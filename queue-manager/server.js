/**
 * Confluence Demo Queue Manager
 *
 * Manages single-user demo sessions with queue/waitlist functionality.
 * Supports invite-based access control with detailed session tracking.
 *
 * WebSocket Protocol:
 *   Client -> Server:
 *     { type: "join_queue", inviteToken?: "token" }
 *     { type: "leave_queue" }
 *     { type: "heartbeat" }
 *
 *   Server -> Client:
 *     { type: "queue_position", position: N, estimated_wait: "X minutes", queue_size: N }
 *     { type: "session_starting", terminal_url: "/terminal" }
 *     { type: "session_active", expires_at: "ISO timestamp" }
 *     { type: "session_warning", minutes_remaining: 5 }
 *     { type: "session_ended", reason: "timeout" | "disconnected" | "error" }
 *     { type: "invite_invalid", reason: "not_found" | "expired" | "used" | "revoked", message: "..." }
 *     { type: "error", message: "..." }
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { marked } = require('marked');

// OpenTelemetry imports (only if available)
let metrics, trace;
try {
  const api = require('@opentelemetry/api');
  metrics = api.metrics;
  trace = api.trace;
} catch (_e) {
  // OTel not available, will use no-op implementations
}

// Configuration
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SESSION_TIMEOUT_MINUTES = parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 60;
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE) || 10;
const AVERAGE_SESSION_MINUTES = 45;
const TTYD_PORT = 7681;
// Claude authentication - OAuth token (preferred) or API key
const CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';

// Validate SESSION_SECRET in production
if (SESSION_SECRET === 'change-me-in-production' && process.env.NODE_ENV === 'production') {
  console.error('FATAL: SESSION_SECRET must be set in production');
  process.exit(1);
}

// =============================================================================
// OpenTelemetry Metrics Setup
// =============================================================================

let meter, queueSizeGauge, sessionsActiveGauge, sessionsStartedCounter,
    sessionsEndedCounter, sessionDurationHistogram, queueWaitHistogram,
    ttydSpawnHistogram, invitesValidatedCounter, sandboxCleanupHistogram;

if (metrics) {
  meter = metrics.getMeter('confluence-demo-queue-manager');

  // Gauges
  queueSizeGauge = meter.createObservableGauge('demo_queue_size', {
    description: 'Current number of clients in queue',
  });
  sessionsActiveGauge = meter.createObservableGauge('demo_sessions_active', {
    description: 'Number of currently active sessions',
  });

  // Counters
  sessionsStartedCounter = meter.createCounter('demo_sessions_started_total', {
    description: 'Total number of sessions started',
  });
  sessionsEndedCounter = meter.createCounter('demo_sessions_ended_total', {
    description: 'Total number of sessions ended',
  });
  invitesValidatedCounter = meter.createCounter('demo_invites_validated_total', {
    description: 'Total number of invite validations',
  });

  // Histograms
  sessionDurationHistogram = meter.createHistogram('demo_session_duration_seconds', {
    description: 'Session duration in seconds',
    unit: 's',
  });
  queueWaitHistogram = meter.createHistogram('demo_queue_wait_seconds', {
    description: 'Time spent waiting in queue',
    unit: 's',
  });
  ttydSpawnHistogram = meter.createHistogram('demo_ttyd_spawn_seconds', {
    description: 'Time to spawn ttyd process',
    unit: 's',
  });
  sandboxCleanupHistogram = meter.createHistogram('demo_sandbox_cleanup_seconds', {
    description: 'Sandbox cleanup duration',
    unit: 's',
  });

  // Register observable callbacks
  queueSizeGauge.addCallback((result) => {
    result.observe(queue.length);
  });
  sessionsActiveGauge.addCallback((result) => {
    result.observe(activeSession ? 1 : 0);
  });
}

// Helper to get tracer
function getTracer() {
  return trace ? trace.getTracer('confluence-demo-queue-manager') : null;
}

// Initialize services
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws' });
const redis = new Redis(REDIS_URL);

// State
const clients = new Map(); // ws -> { id, state, joinedAt, ip, userAgent, inviteToken }
const queue = [];          // Array of client IDs waiting
let activeSession = null;  // { clientId, sessionId, startedAt, expiresAt, ttydProcess, inviteToken, ip, userAgent, queueWaitMs, errors, sessionToken }
const sessionTokens = new Map(); // sessionToken -> sessionId (for Grafana auth)
const pendingSessionTokens = new Map(); // sessionToken -> { clientId, inviteToken, ip } (for queue/pending state)
let disconnectGraceTimeout = null; // Timeout for disconnect grace period
let reconnectionInProgress = false; // Prevent concurrent reconnection attempts
const DISCONNECT_GRACE_MS = 10000; // 10 seconds grace period for page refresh

// Invite audit retention (30 days after expiration)
const AUDIT_RETENTION_DAYS = 30;

// Load HTML template at startup (cached)
const scenarioTemplate = fs.readFileSync(path.join(__dirname, 'templates', 'scenario.html'), 'utf8');

// =============================================================================
// Express Routes
// =============================================================================

app.use(express.json());
app.use(cookieParser());

// Serve static files (CSS, JS)
app.use('/static', express.static(path.join(__dirname, 'static')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Session validation endpoint (used by nginx auth_request for Grafana)
app.get('/api/session/validate', (req, res) => {
  const sessionCookie = req.cookies.demo_session;

  if (!sessionCookie) {
    return res.status(401).send('No session cookie');
  }

  // Check active session token first
  const sessionId = sessionTokens.get(sessionCookie);
  if (sessionId && activeSession && activeSession.sessionId === sessionId) {
    res.set('X-Grafana-User', `demo-${sessionId.slice(0, 8)}`);
    return res.status(200).send('OK');
  }

  // Check pending session token (user in queue or session starting)
  const pending = pendingSessionTokens.get(sessionCookie);
  if (pending) {
    res.set('X-Grafana-User', `demo-${pending.clientId.slice(0, 8)}`);
    return res.status(200).send('OK');
  }

  // Clean up stale token if it was in sessionTokens
  if (sessionTokens.has(sessionCookie)) {
    sessionTokens.delete(sessionCookie);
  }

  return res.status(401).send('Session not active');
});

// Queue status (public)
app.get('/api/status', (req, res) => {
  res.json({
    queue_size: queue.length,
    session_active: activeSession !== null,
    estimated_wait: queue.length * AVERAGE_SESSION_MINUTES + ' minutes',
    max_queue_size: MAX_QUEUE_SIZE
  });
});

// Invite validation endpoint (used by nginx auth_request)
app.get('/api/invite/validate', async (req, res) => {
  // Token comes from X-Invite-Token header (set by nginx from path) or query param
  const token = req.headers['x-invite-token'] || req.query.token;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

  if (!token) {
    return res.status(401).json({ valid: false, reason: 'missing', message: 'Invite token required' });
  }

  const validation = await validateInvite(token, clientIp);

  if (validation.valid) {
    res.status(200).json({ valid: true });
  } else {
    res.status(401).json({ valid: false, reason: validation.reason, message: validation.message });
  }
});

// Scenarios endpoint - renders markdown as styled HTML
const SCENARIOS_PATH = '/opt/demo-container/scenarios';

// HTML escape helper to prevent XSS
const escapeHtml = (str) => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const SCENARIO_NAMES = {
  'page': { file: 'page.md', title: 'Page Management', icon: '📝' },
  'search': { file: 'search.md', title: 'CQL Search', icon: '🔍' },
  'space': { file: 'space.md', title: 'Space Management', icon: '🏠' },
  'hierarchy': { file: 'hierarchy.md', title: 'Page Hierarchy', icon: '🌳' },
  'template': { file: 'template.md', title: 'Templates', icon: '📋' },
  'comment': { file: 'comment.md', title: 'Comments', icon: '💬' },
  'attachment': { file: 'attachment.md', title: 'Attachments', icon: '📎' },
  'label': { file: 'label.md', title: 'Labels', icon: '🏷️' },
  'permission': { file: 'permission.md', title: 'Permissions', icon: '🔒' },
  'bulk': { file: 'bulk.md', title: 'Bulk Operations', icon: '📦' },
  'analytics': { file: 'analytics.md', title: 'Analytics', icon: '📊' },
  'observability': { file: 'observability.md', title: 'Observability', icon: '📈' }
};

app.get('/api/scenarios/:name', (req, res) => {
  const scenarioName = req.params.name;
  const scenario = SCENARIO_NAMES[scenarioName];

  if (!scenario) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  const filePath = path.join(SCENARIOS_PATH, scenario.file);

  fs.readFile(filePath, 'utf8', (err, markdown) => {
    if (err) {
      console.error(`Error reading scenario ${scenarioName}:`, err);
      return res.status(404).json({ error: 'Scenario file not found' });
    }

    const htmlContent = marked(markdown);

    // Render template with substitutions (escape icon/title to prevent XSS)
    const html = scenarioTemplate
      .replace(/\{\{ICON\}\}/g, escapeHtml(scenario.icon))
      .replace(/\{\{TITLE\}\}/g, escapeHtml(scenario.title))
      .replace(/\{\{CONTENT\}\}/g, htmlContent);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });
});

// =============================================================================
// WebSocket Handlers
// =============================================================================

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'unknown';

  clients.set(ws, {
    id: clientId,
    state: 'connected',
    joinedAt: null,
    ip: clientIp,
    userAgent: userAgent,
    inviteToken: null
  });

  console.log(`Client connected: ${clientId} from ${clientIp}`);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log("Received message:", message); handleMessage(ws, message);
    } catch (_err) {
      sendError(ws, 'Invalid message format');
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${clientId}:`, err.message);
  });

  // Send initial status
  sendStatus(ws);
});

function handleMessage(ws, message) {
  const client = clients.get(ws);
  if (!client) return;

  switch (message.type) {
    case 'join_queue':
      joinQueue(ws, client, message.inviteToken);
      break;

    case 'leave_queue':
      leaveQueue(ws, client);
      break;

    case 'heartbeat':
      ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
      break;

    default:
      sendError(ws, `Unknown message type: ${message.type}`);
  }
}

function handleDisconnect(ws) {
  const client = clients.get(ws);
  if (!client) return;

  console.log(`Client disconnected: ${client.id}`);

  // Clean up pending session token (but keep it for grace period if in active session)
  if (client.pendingSessionToken && !(activeSession && activeSession.clientId === client.id)) {
    pendingSessionTokens.delete(client.pendingSessionToken);
  }

  // Remove from queue if waiting
  const queueIndex = queue.indexOf(client.id);
  if (queueIndex !== -1) {
    queue.splice(queueIndex, 1);
    broadcastQueueUpdate();
  }

  // End session with grace period if active (allows page refresh)
  if (activeSession && activeSession.clientId === client.id) {
    console.log(`Starting ${DISCONNECT_GRACE_MS/1000}s grace period for session ${activeSession.sessionId}`);

    // Store info needed for reconnection
    activeSession.disconnectedAt = new Date();
    activeSession.awaitingReconnect = true;

    // Clear any existing grace timeout
    if (disconnectGraceTimeout) {
      clearTimeout(disconnectGraceTimeout);
    }

    // Set grace period - session ends if no reconnect within timeout
    disconnectGraceTimeout = setTimeout(() => {
      if (activeSession && activeSession.awaitingReconnect) {
        console.log('Grace period expired, ending session');
        endSession('disconnected');
      }
      disconnectGraceTimeout = null;
    }, DISCONNECT_GRACE_MS);
  }

  clients.delete(ws);
}

// =============================================================================
// Queue Management
// =============================================================================

async function joinQueue(ws, client, inviteToken) {
  // Check if this is a reconnection to an active session (grace period)
  if (activeSession && activeSession.awaitingReconnect &&
      activeSession.inviteToken === inviteToken && activeSession.ip === client.ip) {

    // Prevent concurrent reconnection attempts
    if (reconnectionInProgress) {
      sendError(ws, 'Reconnection already in progress');
      return;
    }

    reconnectionInProgress = true;
    try {
      console.log(`Client ${client.id} reconnecting to session ${activeSession.sessionId} during grace period`);

      // Cancel the grace period timeout
      if (disconnectGraceTimeout) {
        clearTimeout(disconnectGraceTimeout);
        disconnectGraceTimeout = null;
      }

      // Update session with new client
      activeSession.clientId = client.id;
      activeSession.awaitingReconnect = false;
      delete activeSession.disconnectedAt;

      // Give client the existing session token
      client.inviteToken = inviteToken;
      client.state = 'active';
      client.pendingSessionToken = activeSession.sessionToken;

      // Send session info to client
      ws.send(JSON.stringify({
        type: 'session_token',
        session_token: activeSession.sessionToken
      }));
      ws.send(JSON.stringify({
        type: 'session_starting',
        terminal_url: '/terminal',
        expires_at: activeSession.expiresAt.toISOString(),
        session_token: activeSession.sessionToken,
        reconnected: true
      }));

      console.log(`Session ${activeSession.sessionId} reconnected successfully`);
    } finally {
      reconnectionInProgress = false;
    }
    return;
  }

  // Check if already in queue
  if (queue.includes(client.id)) {
    sendError(ws, 'Already in queue');
    return;
  }

  // Validate invite token if provided
  if (inviteToken) {
    const validation = await validateInvite(inviteToken, client.ip);
    if (!validation.valid) {
      ws.send(JSON.stringify({
        type: 'invite_invalid',
        reason: validation.reason,
        message: validation.message
      }));
      return;
    }
    client.inviteToken = inviteToken;
    client.inviteData = validation.data;
    console.log(`Client ${client.id} has valid invite: ${inviteToken.slice(0, 8)}...`);
  }

  // Check queue size limit
  if (queue.length >= MAX_QUEUE_SIZE) {
    ws.send(JSON.stringify({
      type: 'queue_full',
      message: 'Queue is full. Please try again later.'
    }));
    return;
  }

  // Generate pending session token immediately (allows page refresh while in queue)
  const pendingToken = generateSessionToken(client.id);
  pendingSessionTokens.set(pendingToken, {
    clientId: client.id,
    inviteToken: inviteToken || null,
    ip: client.ip,
    createdAt: new Date()
  });
  client.pendingSessionToken = pendingToken;

  // Send token immediately so client can set cookie
  ws.send(JSON.stringify({
    type: 'session_token',
    session_token: pendingToken
  }));

  // Add to queue
  queue.push(client.id);
  client.state = 'queued';
  client.joinedAt = new Date();

  console.log(`Client ${client.id} joined queue (position ${queue.length})`);

  // If no active session and first in queue, start immediately
  if (!activeSession && queue[0] === client.id) {
    startSession(ws, client);
  } else {
    sendQueuePosition(ws, client);
  }

  broadcastQueueUpdate();
}

// =============================================================================
// Session Token Management
// =============================================================================

function generateSessionToken(sessionId) {
  const timestamp = Date.now().toString();
  const data = `${sessionId}:${timestamp}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('hex');
  return `${Buffer.from(data).toString('base64')}.${signature}`;
}

function clearSessionToken(sessionToken) {
  if (sessionToken) {
    sessionTokens.delete(sessionToken);
  }
}

// =============================================================================
// Invite Validation
// =============================================================================

async function validateInvite(token, clientIp = null) {
  const tracer = getTracer();
  const span = tracer?.startSpan('invite.validate', {
    attributes: { 'invite.token_prefix': token?.slice(0, 8) || 'none' }
  });

  try {
    // Token must be 4-64 chars, URL-safe characters only
    if (!token || !/^[A-Za-z0-9_-]{4,64}$/.test(token)) {
      invitesValidatedCounter?.add(1, { status: 'invalid' });
      span?.setAttribute('invite.status', 'invalid');
      return {
        valid: false,
        reason: 'invalid',
        message: 'This invite link is malformed or invalid.'
      };
    }

    const inviteKey = `invite:${token}`;
    const inviteJson = await redis.get(inviteKey);

    if (!inviteJson) {
      invitesValidatedCounter?.add(1, { status: 'not_found' });
      span?.setAttribute('invite.status', 'not_found');
      return {
        valid: false,
        reason: 'not_found',
        message: 'This invite link does not exist. Please check the URL or request a new invite.'
      };
    }

    const invite = JSON.parse(inviteJson);

    // Check if revoked
    if (invite.status === 'revoked') {
      invitesValidatedCounter?.add(1, { status: 'revoked' });
      span?.setAttribute('invite.status', 'revoked');
      return {
        valid: false,
        reason: 'revoked',
        message: 'This invite link has been revoked by an administrator.'
      };
    }

    // Check if already used
    if (invite.status === 'used' || (invite.useCount >= invite.maxUses)) {
      // Allow rejoin if there's an active session from the same IP using this invite
      if (clientIp && activeSession && activeSession.inviteToken === token && activeSession.ip === clientIp) {
        console.log(`Allowing rejoin for used invite ${token.slice(0, 8)}... from same IP ${clientIp} (awaitingReconnect: ${activeSession.awaitingReconnect || false})`);
        invitesValidatedCounter?.add(1, { status: 'rejoin' });
        span?.setAttribute('invite.status', 'rejoin');
        return { valid: true, data: invite, rejoin: true };
      }

      // Also allow if there's a pending session token from the same IP
      for (const [, pending] of pendingSessionTokens) {
        if (pending.inviteToken === token && pending.ip === clientIp) {
          console.log(`Allowing rejoin for pending invite ${token.slice(0, 8)}... from same IP ${clientIp}`);
          invitesValidatedCounter?.add(1, { status: 'rejoin' });
          span?.setAttribute('invite.status', 'rejoin');
          return { valid: true, data: invite, rejoin: true };
        }
      }

      invitesValidatedCounter?.add(1, { status: 'used' });
      span?.setAttribute('invite.status', 'used');
      return {
        valid: false,
        reason: 'used',
        message: 'This invite link has already been used. Each invite can only be used once.'
      };
    }

    // Check expiration
    if (new Date(invite.expiresAt) < new Date()) {
      // Update status in Redis
      invite.status = 'expired';
      const ttl = await redis.ttl(inviteKey);
      await redis.set(inviteKey, JSON.stringify(invite), 'EX', ttl > 0 ? ttl : 86400);
      invitesValidatedCounter?.add(1, { status: 'expired' });
      span?.setAttribute('invite.status', 'expired');
      return {
        valid: false,
        reason: 'expired',
        message: 'This invite link has expired. Please request a new invite.'
      };
    }

    invitesValidatedCounter?.add(1, { status: 'valid' });
    span?.setAttribute('invite.status', 'valid');
    return { valid: true, data: invite };
  } finally {
    span?.end();
  }
}

function leaveQueue(ws, client) {
  const queueIndex = queue.indexOf(client.id);
  if (queueIndex !== -1) {
    queue.splice(queueIndex, 1);
    client.state = 'connected';
    console.log(`Client ${client.id} left queue`);

    ws.send(JSON.stringify({ type: 'left_queue' }));
    broadcastQueueUpdate();
  }
}

function sendQueuePosition(ws, client) {
  const position = queue.indexOf(client.id) + 1;
  const estimatedWait = position * AVERAGE_SESSION_MINUTES;

  ws.send(JSON.stringify({
    type: 'queue_position',
    position: position,
    estimated_wait: `${estimatedWait} minutes`,
    queue_size: queue.length
  }));
}

function broadcastQueueUpdate() {
  clients.forEach((client, ws) => {
    if (client.state === 'queued') {
      sendQueuePosition(ws, client);
    }
  });
}

// =============================================================================
// Session Management
// =============================================================================

async function startSession(ws, client) {
  const tracer = getTracer();
  const span = tracer?.startSpan('session.start', {
    attributes: {
      'session.client_id': client.id,
      'session.invite_token': client.inviteToken ? client.inviteToken.slice(0, 8) : 'none',
    }
  });

  console.log(`Starting session for client ${client.id}`);
  const spawnStartTime = Date.now();

  try {
    // Remove from queue
    const queueIndex = queue.indexOf(client.id);
    if (queueIndex !== -1) {
      queue.splice(queueIndex, 1);
    }

    client.state = 'active';

    // Start ttyd with demo container
    const ttydProcess = spawn('ttyd', [
      '--port', String(TTYD_PORT),
      '--interface', '0.0.0.0',
      '--max-clients', '1',
      '--once',
      '--writable',
      '--client-option', 'reconnect=0',
      'docker', 'run', '--rm', '-it',
      '-e', 'TERM=xterm',
      '-e', `CONFLUENCE_API_TOKEN=${process.env.CONFLUENCE_API_TOKEN}`,
      '-e', `CONFLUENCE_EMAIL=${process.env.CONFLUENCE_EMAIL}`,
      '-e', `CONFLUENCE_SITE_URL=${process.env.CONFLUENCE_SITE_URL}`,
      '-e', `SESSION_TIMEOUT_MINUTES=${SESSION_TIMEOUT_MINUTES}`,
      '-e', `ENABLE_AUTOPLAY=${process.env.ENABLE_AUTOPLAY || 'false'}`,
      '-e', `AUTOPLAY_DEBUG=${process.env.AUTOPLAY_DEBUG || 'false'}`,
      '-e', `AUTOPLAY_SHOW_TOOLS=${process.env.AUTOPLAY_SHOW_TOOLS || 'false'}`,
      '-e', `OTEL_ENDPOINT=${process.env.OTEL_ENDPOINT || ''}`,
      // Claude authentication - pass token as env var (container handles .claude.json setup)
      ...(CLAUDE_CODE_OAUTH_TOKEN ? ['-e', `CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN}`] : []),
      ...(ANTHROPIC_API_KEY ? ['-e', `ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}`] : []),
      'confluence-demo-container:latest'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Record spawn time
    const spawnDuration = (Date.now() - spawnStartTime) / 1000;
    ttydSpawnHistogram?.record(spawnDuration);
    span?.setAttribute('ttyd.spawn_seconds', spawnDuration);

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + SESSION_TIMEOUT_MINUTES * 60 * 1000);
    const queueWaitMs = client.joinedAt ? (startedAt - client.joinedAt) : 0;
    const sessionId = uuidv4();

    // Record queue wait time
    if (queueWaitMs > 0) {
      queueWaitHistogram?.record(queueWaitMs / 1000);
      span?.setAttribute('session.queue_wait_seconds', queueWaitMs / 1000);
    }

    // Promote pending session token to active session token
    const sessionToken = client.pendingSessionToken;
    if (sessionToken) {
      pendingSessionTokens.delete(sessionToken);
      sessionTokens.set(sessionToken, sessionId);
    }

    activeSession = {
      clientId: client.id,
      sessionId: sessionId,
      sessionToken: sessionToken,
      ttydProcess: ttydProcess,
      startedAt: startedAt,
      expiresAt: expiresAt,
      inviteToken: client.inviteToken || null,
      ip: client.ip,
      userAgent: client.userAgent,
      queueWaitMs: queueWaitMs,
      errors: []
    };

    // Handle ttyd exit
    ttydProcess.on('exit', (code) => {
      console.log(`ttyd exited with code ${code}`);
      if (activeSession && activeSession.clientId === client.id) {
        endSession('container_exit');
      }
    });

    // Notify client
    ws.send(JSON.stringify({
      type: 'session_starting',
      terminal_url: '/terminal',
      expires_at: expiresAt.toISOString(),
      session_token: sessionToken
    }));

    // Schedule warning and timeout
    scheduleSessionWarning(ws, client);
    scheduleSessionTimeout(ws, client);

    // Save to Redis for persistence
    await redis.set(`session:${client.id}`, JSON.stringify({
      sessionId: activeSession.sessionId,
      startedAt: startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      inviteToken: client.inviteToken || null,
      ip: client.ip,
      userAgent: client.userAgent,
      queueWaitMs: queueWaitMs
    }), 'EX', SESSION_TIMEOUT_MINUTES * 60);

    // Record metrics
    sessionsStartedCounter?.add(1);
    span?.setAttribute('session.id', sessionId);

    console.log(`Session started for ${client.id}, expires at ${expiresAt.toISOString()}`);

    span?.end();
  } catch (err) {
    console.error('Failed to start session:', err);
    span?.recordException(err);
    span?.end();
    sendError(ws, 'Failed to start demo session');
    client.state = 'connected';

    // Try next in queue
    processQueue();
  }
}

function scheduleSessionWarning(ws, client) {
  const warningTime = (SESSION_TIMEOUT_MINUTES - 5) * 60 * 1000;

  setTimeout(() => {
    if (activeSession && activeSession.clientId === client.id) {
      ws.send(JSON.stringify({
        type: 'session_warning',
        minutes_remaining: 5
      }));
    }
  }, warningTime);
}

function scheduleSessionTimeout(ws, client) {
  const timeoutMs = SESSION_TIMEOUT_MINUTES * 60 * 1000;

  setTimeout(() => {
    if (activeSession && activeSession.clientId === client.id) {
      endSession('timeout');
    }
  }, timeoutMs);
}

async function endSession(reason) {
  if (!activeSession) return;

  const tracer = getTracer();
  const span = tracer?.startSpan('session.end', {
    attributes: {
      'session.id': activeSession.sessionId,
      'session.client_id': activeSession.clientId,
      'session.end_reason': reason,
    }
  });

  const clientId = activeSession.clientId;
  const endedAt = new Date();
  const durationMs = endedAt - activeSession.startedAt;
  console.log(`Ending session for ${clientId}, reason: ${reason}`);

  // Record session duration
  sessionDurationHistogram?.record(durationMs / 1000, { reason });
  sessionsEndedCounter?.add(1, { reason });
  span?.setAttribute('session.duration_seconds', durationMs / 1000);

  // Kill ttyd process
  if (activeSession.ttydProcess) {
    try {
      activeSession.ttydProcess.kill('SIGTERM');
    } catch (err) {
      console.error('Error killing ttyd:', err.message);
    }
  }

  // Clear session token
  clearSessionToken(activeSession.sessionToken);

  // Record invite usage if applicable
  if (activeSession.inviteToken) {
    await recordInviteUsage(activeSession, endedAt, reason);
  }

  // Notify client to clear cookie
  const clientWs = findClientWs(clientId);
  if (clientWs) {
    clientWs.send(JSON.stringify({
      type: 'session_ended',
      reason: reason,
      clear_session_cookie: true
    }));

    const client = clients.get(clientWs);
    if (client) {
      client.state = 'connected';
      client.sessionToken = null;
    }
  }

  // Clean up Redis
  await redis.del(`session:${clientId}`);

  // Run Confluence sandbox cleanup
  runSandboxCleanup();

  activeSession = null;
  span?.end();

  // Process next in queue
  processQueue();
}

async function recordInviteUsage(session, endedAt, endReason) {
  const inviteKey = `invite:${session.inviteToken}`;

  try {
    const inviteJson = await redis.get(inviteKey);
    if (!inviteJson) {
      console.log(`Invite ${session.inviteToken} not found for usage recording`);
      return;
    }

    const invite = JSON.parse(inviteJson);

    // Add session record
    if (!invite.sessions) invite.sessions = [];
    invite.sessions.push({
      sessionId: session.sessionId,
      clientId: session.clientId,
      startedAt: session.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      endReason: endReason,
      queueWaitMs: session.queueWaitMs,
      ip: session.ip,
      userAgent: session.userAgent,
      errors: session.errors || []
    });

    // Update usage tracking
    invite.useCount = (invite.useCount || 0) + 1;
    if (invite.useCount >= invite.maxUses) {
      invite.status = 'used';
    }

    // Save with extended TTL (audit retention after expiration)
    const expiresAtMs = new Date(invite.expiresAt).getTime();
    const auditRetentionMs = AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const ttlSeconds = Math.max(
      Math.floor((expiresAtMs - Date.now() + auditRetentionMs) / 1000),
      86400
    );

    await redis.set(inviteKey, JSON.stringify(invite), 'EX', ttlSeconds);
    console.log(`Recorded usage for invite ${session.inviteToken.slice(0, 8)}..., status: ${invite.status}`);

  } catch (err) {
    console.error('Error recording invite usage:', err.message);
  }
}

function runSandboxCleanup() {
  const tracer = getTracer();
  const span = tracer?.startSpan('sandbox.cleanup');
  const startTime = Date.now();

  console.log('Running Confluence sandbox cleanup...');

  const cleanup = spawn('python3', ['/opt/scripts/cleanup_demo_sandbox.py'], {
    env: {
      ...process.env,
      CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN,
      CONFLUENCE_EMAIL: process.env.CONFLUENCE_EMAIL,
      CONFLUENCE_SITE_URL: process.env.CONFLUENCE_SITE_URL,
      OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || ''
    }
  });

  cleanup.on('exit', (code) => {
    const durationSeconds = (Date.now() - startTime) / 1000;
    sandboxCleanupHistogram?.record(durationSeconds, { success: code === 0 ? 'true' : 'false' });
    span?.setAttribute('sandbox.cleanup_duration_seconds', durationSeconds);
    span?.setAttribute('sandbox.cleanup_success', code === 0);

    if (code === 0) {
      console.log('Sandbox cleanup completed successfully');
    } else {
      console.error(`Sandbox cleanup failed with code ${code}`);
      span?.recordException(new Error(`Cleanup failed with code ${code}`));
    }
    span?.end();
  });
}

function processQueue() {
  if (activeSession || queue.length === 0) return;

  const nextClientId = queue[0];
  const nextClientWs = findClientWs(nextClientId);

  if (nextClientWs) {
    const client = clients.get(nextClientWs);
    startSession(nextClientWs, client);
  } else {
    // Client disconnected, remove and try next
    queue.shift();
    processQueue();
  }
}

// =============================================================================
// Helpers
// =============================================================================

function findClientWs(clientId) {
  for (const [ws, client] of clients.entries()) {
    if (client.id === clientId) {
      return ws;
    }
  }
  return null;
}

function sendStatus(ws) {
  ws.send(JSON.stringify({
    type: 'status',
    queue_size: queue.length,
    session_active: activeSession !== null
  }));
}

function sendError(ws, message) {
  ws.send(JSON.stringify({ type: 'error', message }));
}

// =============================================================================
// Startup
// =============================================================================

server.listen(PORT, () => {
  console.log(`Queue manager listening on port ${PORT}`);
  console.log(`Session timeout: ${SESSION_TIMEOUT_MINUTES} minutes`);
  console.log(`Max queue size: ${MAX_QUEUE_SIZE}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');

  // Clear grace period timeout
  if (disconnectGraceTimeout) {
    clearTimeout(disconnectGraceTimeout);
  }

  if (activeSession) {
    await endSession('shutdown');
  }

  wss.close();
  server.close();
  redis.quit();

  process.exit(0);
});
