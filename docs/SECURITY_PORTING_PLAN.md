# Security Features Porting Plan

## Overview

This document outlines the plan to port security enhancements from `confluence-demo` to `jira-demo` and `splunk-demo`.

## Security Features to Port

### 1. Dependencies

**Add to package.json:**
```json
{
  "dependencies": {
    "helmet": "^8.0.0",
    "isomorphic-dompurify": "^2.16.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.2",
    "eslint": "^9.39.2"
  }
}
```

### 2. Helmet.js Security Headers

**Add imports:**
```javascript
const helmet = require('helmet');
```

**Add middleware (after express initialization, before routes):**
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // ttyd/xterm.js requires inline scripts
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      frameSrc: ["'self'"],
      fontSrc: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false, // Required for terminal iframe
}));
```

### 3. Content-Type Validation

**Add middleware for POST/PUT requests:**
```javascript
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    if (contentType && !contentType.includes('application/json')) {
      return res.status(415).json({ error: 'Unsupported Media Type. Expected application/json' });
    }
  }
  next();
});
```

### 4. Connection Rate Limiting

**Add configuration:**
```javascript
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_CONNECTIONS = 10;   // Max connections per IP per window
const connectionRateLimits = new Map();  // ip -> { count, resetAt }
```

**Add WebSocket rate limiting (in connection handler):**
```javascript
function checkConnectionRateLimit(ip) {
  const now = Date.now();
  const current = connectionRateLimits.get(ip);

  // Cleanup expired entries periodically
  if (connectionRateLimits.size > 1000) {
    for (const [key, value] of connectionRateLimits) {
      if (value.resetAt < now) connectionRateLimits.delete(key);
    }
  }

  if (!current || current.resetAt < now) {
    connectionRateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX_CONNECTIONS) {
    return false;
  }

  current.count++;
  return true;
}

// In wss.on('connection', ...)
wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
             req.socket.remoteAddress || 'unknown';

  if (!checkConnectionRateLimit(ip)) {
    console.log(`Rate limit exceeded for ${ip}`);
    ws.close(1008, 'Rate limit exceeded');
    return;
  }
  // ... rest of connection handler
});
```

### 5. Invite Brute-Force Protection

**Add configuration:**
```javascript
const INVITE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;  // 1 hour window
const INVITE_RATE_LIMIT_MAX_ATTEMPTS = 10;           // Max failed attempts per IP per hour
const inviteRateLimits = new Map();                   // ip -> { count, resetAt }
```

**Add validation function:**
```javascript
function checkInviteRateLimit(ip) {
  const now = Date.now();
  const current = inviteRateLimits.get(ip);

  if (!current || current.resetAt < now) {
    return true; // No active rate limit
  }

  return current.count < INVITE_RATE_LIMIT_MAX_ATTEMPTS;
}

function recordFailedInviteAttempt(ip) {
  const now = Date.now();
  const current = inviteRateLimits.get(ip);

  if (!current || current.resetAt < now) {
    inviteRateLimits.set(ip, { count: 1, resetAt: now + INVITE_RATE_LIMIT_WINDOW_MS });
  } else {
    current.count++;
  }
}

// Use in invite validation:
if (!checkInviteRateLimit(ip)) {
  return { valid: false, reason: 'rate_limited', message: 'Too many invalid attempts. Try again later.' };
}
// ... validation logic
if (!valid) {
  recordFailedInviteAttempt(ip);
}
```

### 6. Container Security Constraints

**Replace docker spawn command with secured version:**
```javascript
// Configuration
const SESSION_ENV_HOST_PATH = process.env.SESSION_ENV_HOST_PATH || '/tmp/session-env';
const SESSION_ENV_CONTAINER_PATH = '/run/session-env';

// Create session env file function
function createSessionEnvFile(sessionId) {
  const filename = `session-${sessionId}.env`;
  const containerPath = path.join(SESSION_ENV_CONTAINER_PATH, filename);
  const hostPath = path.join(SESSION_ENV_HOST_PATH, filename);

  const envContent = [
    `TERM=xterm`,
    // Add product-specific env vars here
    `SESSION_TIMEOUT_MINUTES=${SESSION_TIMEOUT_MINUTES}`,
  ];

  // Add optional auth tokens
  if (CLAUDE_CODE_OAUTH_TOKEN) {
    envContent.push(`CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN}`);
  }
  if (ANTHROPIC_API_KEY) {
    envContent.push(`ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}`);
  }

  // Write with secure permissions
  fs.mkdirSync(SESSION_ENV_CONTAINER_PATH, { recursive: true });
  fs.writeFileSync(containerPath, envContent.join('\n'), { mode: 0o600 });

  return { containerPath, hostPath };
}

// Cleanup function
function cleanupSessionEnvFile(sessionId) {
  const filename = `session-${sessionId}.env`;
  const filePath = path.join(SESSION_ENV_CONTAINER_PATH, filename);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Failed to cleanup env file: ${err.message}`);
  }
}

// In startSession:
const envFile = createSessionEnvFile(sessionId);

const ttydProcess = spawn('ttyd', [
  '--port', String(TTYD_PORT),
  '--interface', '0.0.0.0',
  '--max-clients', '1',
  '--once',
  '--writable',
  '--client-option', 'reconnect=0',
  'docker', 'run', '--rm', '-it',
  '--network', 'demo-telemetry-network',
  // Security constraints
  '--memory', '2g',                    // Memory limit
  '--memory-swap', '2g',               // Disable swap
  '--cpus', '2',                       // CPU limit
  '--pids-limit', '256',               // Process limit (prevents fork bombs)
  '--security-opt', 'no-new-privileges:true',
  '--cap-drop', 'ALL',                 // Drop all capabilities
  '--cap-add', 'CHOWN',                // Required for npm/pip
  '--cap-add', 'SETUID',               // Required for user switching
  '--cap-add', 'SETGID',               // Required for group switching
  '--cap-add', 'DAC_OVERRIDE',         // Required for file access
  '--read-only',                       // Read-only root filesystem
  '--tmpfs', '/tmp:size=512m,noexec,nosuid',
  '--tmpfs', '/home:size=1g,exec',     // Writable home for npm/pip cache
  '--env-file', envFile.hostPath,
  'CONTAINER_IMAGE:latest'
], { stdio: ['pipe', 'pipe', 'pipe'] });

// In endSession, add cleanup:
cleanupSessionEnvFile(activeSession.sessionId);
```

### 7. DOMPurify for Markdown Output

**Add import:**
```javascript
const DOMPurify = require('isomorphic-dompurify');
```

**Update markdown rendering:**
```javascript
// In scenario route or markdown handler:
const rawHtml = marked.parse(markdownContent);
const htmlContent = DOMPurify.sanitize(rawHtml, {
  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'ul', 'ol', 'li',
                 'code', 'pre', 'blockquote', 'a', 'strong', 'em', 'table', 'thead',
                 'tbody', 'tr', 'th', 'td'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
});
```

### 8. Session Secret Validation

**Add production check:**
```javascript
if (SESSION_SECRET === 'change-me-in-production') {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: SESSION_SECRET must be set in production');
    process.exit(1);
  } else {
    console.warn('WARNING: Using default SESSION_SECRET. Set SESSION_SECRET env var in production!');
  }
}
```

### 9. Docker Compose Updates

**Add to docker-compose.yml:**
```yaml
services:
  queue-manager:
    environment:
      # Host path for session env files (used for --env-file in spawned containers)
      - SESSION_ENV_HOST_PATH=${PWD}/session-env
    volumes:
      # SECURITY: Docker socket is required to spawn demo containers.
      # Mitigations applied in server.js:
      # - Spawned containers have memory/CPU/PID limits
      # - Capabilities dropped (only CHOWN, SETUID, SETGID, DAC_OVERRIDE retained)
      # - no-new-privileges flag prevents privilege escalation
      # - Read-only root filesystem with tmpfs for /tmp and /home
      - /var/run/docker.sock:/var/run/docker.sock
      - ./session-env:/run/session-env
```

**Add to .gitignore:**
```
session-env/
```

---

## Implementation Checklist

### jira-demo

- [ ] Add helmet and isomorphic-dompurify to package.json
- [ ] Add ESLint devDependencies
- [ ] Add Helmet middleware with CSP
- [ ] Add Content-Type validation middleware
- [ ] Add connection rate limiting
- [ ] Add invite brute-force protection
- [ ] Update docker spawn with security constraints
- [ ] Add session env file pattern
- [ ] Add DOMPurify to markdown rendering
- [ ] Add SESSION_SECRET production check
- [ ] Update docker-compose.yml with SESSION_ENV_HOST_PATH
- [ ] Add session-env/ to .gitignore
- [ ] Add npm lint scripts
- [ ] Test all security features

### splunk-demo

- [ ] Add helmet and isomorphic-dompurify to package.json
- [ ] Add ESLint devDependencies
- [ ] Add Helmet middleware with CSP (in server.js)
- [ ] Add Content-Type validation middleware
- [ ] Add connection rate limiting (in handlers/websocket.js)
- [ ] Add invite brute-force protection (in services/invite.js)
- [ ] Update docker spawn with security constraints (in services/session.js)
- [ ] Add session env file pattern
- [ ] Add DOMPurify to markdown rendering (in routes/scenarios.js)
- [ ] Add SESSION_SECRET production check
- [ ] Update docker-compose.yml with SESSION_ENV_HOST_PATH
- [ ] Add session-env/ to .gitignore
- [ ] Add npm lint scripts
- [ ] Test all security features

---

## File Changes Summary

### jira-demo (Monolithic)

| File | Changes |
|------|---------|
| `queue-manager/package.json` | Add dependencies |
| `queue-manager/server.js` | Add all security features |
| `docker-compose.yml` | Add SESSION_ENV_HOST_PATH, volume |
| `.gitignore` | Add session-env/ |

### splunk-demo (Modular)

| File | Changes |
|------|---------|
| `queue-manager/package.json` | Add dependencies |
| `queue-manager/server.js` | Add Helmet, Content-Type validation |
| `queue-manager/handlers/websocket.js` | Add connection rate limiting |
| `queue-manager/services/invite.js` | Add brute-force protection |
| `queue-manager/services/session.js` | Add container security, env files |
| `queue-manager/routes/scenarios.js` | Add DOMPurify |
| `docker-compose.yml` | Add SESSION_ENV_HOST_PATH, volume |
| `.gitignore` | Add session-env/ |

---

## Testing Plan

1. **Helmet Headers**: Verify security headers in browser dev tools
2. **Rate Limiting**: Test with rapid WebSocket connections
3. **Invite Protection**: Test with multiple invalid tokens
4. **Container Security**: Verify `docker inspect` shows limits
5. **Secret Hiding**: Verify `ps aux` doesn't show tokens
6. **DOMPurify**: Test with XSS payloads in markdown

---

## Rollback Plan

If issues arise:
1. Revert package.json changes
2. Remove security middleware
3. Revert docker-compose changes
4. All changes are additive, so rollback is straightforward
