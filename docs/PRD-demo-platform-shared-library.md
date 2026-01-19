# PRD: Demo Platform Shared Library

**Version:** 1.0
**Date:** 2026-01-18
**Author:** Claude Code Analysis
**Status:** Draft

---

## Executive Summary

This PRD defines the requirements for extracting shared code from three demo platform projects (jira-demo, confluence-demo, splunk-demo) into reusable libraries. Analysis shows ~70% of the queue-manager code is functionally identical across projects, creating maintenance burden and inconsistent implementations.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Goals & Success Metrics](#2-goals--success-metrics)
3. [Current State Analysis](#3-current-state-analysis)
4. [Proposed Solution](#4-proposed-solution)
5. [Technical Specifications](#5-technical-specifications)
6. [Implementation Plan](#6-implementation-plan)
7. [Quick Wins (No Library Required)](#7-quick-wins-no-library-required)
8. [Appendix: Code Comparison](#appendix-code-comparison)

---

## 1. Problem Statement

### 1.1 Background

Three demo platform projects exist for showcasing Claude Code plugins:

| Project | Purpose | Location |
|---------|---------|----------|
| jira-demo | JIRA Assistant Skills demo | `/Users/jasonkrueger/IdeaProjects/jira-demo/` |
| confluence-demo | Confluence Assistant Skills demo | `/Users/jasonkrueger/IdeaProjects/confluence-demo/` |
| splunk-demo | Splunk Assistant Skills demo | `/Users/jasonkrueger/IdeaProjects/splunk-demo/` |

Each project implements a queue-manager service for managing single-user demo sessions with WebSocket communication, invite-based access, and terminal spawning.

### 1.2 Problems

1. **Code Duplication**: ~70% of queue-manager code is functionally identical across projects
2. **Inconsistent Implementations**: Security fixes applied to one project don't reach others
3. **Architectural Divergence**: jira-demo uses monolithic pattern; others use modular pattern
4. **Maintenance Burden**: Bug fixes and improvements must be applied 3x
5. **Knowledge Silos**: Best practices from one project aren't shared to others

### 1.3 Specific Examples

| Issue | jira-demo | confluence-demo | splunk-demo |
|-------|-----------|-----------------|-------------|
| Hard timeout (zombie prevention) | Missing | Implemented | Missing |
| Path traversal protection | Implemented | Missing | Missing |
| Jest test suite | Missing | Missing | Implemented |
| Modular architecture | No (monolithic) | Yes | Yes |

---

## 2. Goals & Success Metrics

### 2.1 Goals

1. **Reduce code duplication** by extracting common patterns into shared libraries
2. **Standardize security patterns** across all demo platforms
3. **Improve maintainability** through consistent architecture
4. **Enable faster new demo creation** with reusable components
5. **Ensure feature parity** across all platforms

### 2.2 Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Lines of duplicated code | ~2,500 | <500 |
| Time to create new demo platform | ~2 weeks | ~3 days |
| Security patterns coverage | 60% | 100% |
| Test coverage (queue-manager) | 0% (jira/confluence) | 80% |

### 2.3 Non-Goals

- Merging all projects into a single monorepo (future consideration)
- Changing the fundamental architecture of each demo
- Modifying the API-specific integrations (JIRA, Confluence, Splunk APIs)

---

## 3. Current State Analysis

### 3.1 Project Structure Comparison

```
jira-demo/queue-manager/          confluence-demo/queue-manager/     splunk-demo/queue-manager/
├── server.js (1,423 lines)       ├── server.js (161 lines)          ├── server.js (similar)
├── instrumentation.js            ├── instrumentation.js             ├── instrumentation.js
├── invite-cli.js                 ├── invite-cli.js                  ├── config/
└── package.json                  ├── config/                        │   ├── index.js
                                  │   ├── index.js                   │   └── metrics.js
                                  │   └── metrics.js                 ├── services/
                                  ├── services/                      │   ├── state.js
                                  │   ├── state.js                   │   ├── session.js
                                  │   ├── session.js                 │   ├── queue.js
                                  │   ├── queue.js                   │   └── invite.js
                                  │   └── invite.js                  ├── handlers/
                                  ├── handlers/                      │   └── websocket.js
                                  │   └── websocket.js               ├── routes/
                                  ├── routes/                        │   ├── health.js
                                  │   ├── health.js                  │   ├── session.js
                                  │   ├── session.js                 │   └── scenarios.js
                                  │   └── scenarios.js               └── tests/
                                  ├── templates/                         ├── unit/
                                  │   └── scenario.html                  ├── integration/
                                  └── static/                            └── e2e/
                                      └── scenario.css
```

### 3.2 Identical Code Patterns

The following patterns are functionally identical across all three projects:

#### 3.2.1 Session Token Generation
```javascript
// Location: jira-demo/queue-manager/server.js:generateSessionToken()
// Location: confluence-demo/queue-manager/services/session.js:generateSessionToken()
// Location: splunk-demo/queue-manager/services/session.js:generateSessionToken()

function generateSessionToken(sessionId) {
  const timestamp = Date.now().toString();
  const data = `${sessionId}:${timestamp}`;
  const signature = crypto.createHmac('sha256', config.SESSION_SECRET)
    .update(data)
    .digest('hex');
  return `${Buffer.from(data).toString('base64')}.${signature}`;
}
```

#### 3.2.2 Rate Limiting
```javascript
// All three projects use identical in-memory Map pattern
// Differences: Only variable names and limits

const connectionRateLimits = new Map();  // ip -> { count, resetAt }
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_CONNECTIONS = 10;

function checkConnectionRateLimit(ip) {
  const now = Date.now();
  const current = connectionRateLimits.get(ip);

  if (connectionRateLimits.size > 1000) {
    // Cleanup expired entries
    for (const [key, value] of connectionRateLimits) {
      if (now > value.resetAt) connectionRateLimits.delete(key);
    }
  }

  if (!current || now > current.resetAt) {
    connectionRateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (current.count >= RATE_LIMIT_MAX_CONNECTIONS) {
    return { allowed: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }

  current.count++;
  return { allowed: true };
}
```

#### 3.2.3 Secure Environment File Management
```javascript
// All three projects create session env files with 0600 permissions
// Differences: Only the environment variables written

function createSessionEnvFile(sessionId) {
  const envPath = path.join(SESSION_ENV_PATH, `${sessionId}.env`);
  const envContent = [/* API-specific vars */].join('\n');

  fs.mkdirSync(SESSION_ENV_PATH, { recursive: true });
  fs.writeFileSync(envPath, envContent, { mode: 0o600 });

  return {
    path: envPath,
    cleanup: () => {
      try { fs.unlinkSync(envPath); }
      catch (err) { if (err.code !== 'ENOENT') console.error(err); }
    }
  };
}
```

#### 3.2.4 WebSocket Message Protocol
```javascript
// Identical message types across all projects:
// Client → Server: join_queue, leave_queue, heartbeat
// Server → Client: queue_position, session_starting, session_active,
//                  session_warning, session_ended, invite_invalid, error
```

#### 3.2.5 OpenTelemetry Metrics
```javascript
// Same metric names and types across all projects:
// Gauges: demo_queue_size, demo_sessions_active
// Counters: demo_sessions_started_total, demo_sessions_ended_total, demo_invites_validated_total
// Histograms: demo_session_duration_seconds, demo_queue_wait_seconds, demo_ttyd_spawn_seconds
```

#### 3.2.6 Container Security Constraints
```javascript
// Identical Docker run flags across all projects (minor variations in limits):
'--memory', '2g',
'--memory-swap', '2g',
'--cpus', '2',
'--pids-limit', '256',
'--security-opt', 'no-new-privileges:true',
'--cap-drop', 'ALL',
'--cap-add', 'CHOWN', '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--cap-add', 'DAC_OVERRIDE',
'--read-only',
'--tmpfs', '/tmp:rw,noexec,nosuid,size=512m',
'--env-file', envFilePath,
```

### 3.3 Unique Features by Project

| Feature | jira-demo | confluence-demo | splunk-demo |
|---------|-----------|-----------------|-------------|
| **Architecture** | Monolithic server.js | Modular services/ | Modular services/ |
| **Hard timeout** | No | Yes (session + 5 min) | No |
| **Path traversal check** | Yes | No | No |
| **HTML template** | Inline (200 lines) | External file | External file |
| **CSS** | Inline | External file | External file |
| **Jest tests** | No | No | Yes (unit/integration/e2e) |
| **Sandbox cleanup** | On session end | On session end | N/A |
| **Python retry decorator** | In library | Custom implementation | No retry logic |
| **Config organization** | Inline constants | config/index.js | config/index.js |

### 3.4 Python Utilities Comparison

| Project | API Client | Retry Logic | Telemetry |
|---------|------------|-------------|-----------|
| jira-demo | `jira_assistant_skills_lib` (external) | In library | `otel_setup.py` |
| confluence-demo | `confluence_base.py` (166 lines) | `@retry_on_failure` decorator | None |
| splunk-demo | `hec_client.py` (126 lines) | `wait_until_ready()` only | None |

---

## 4. Proposed Solution

### 4.1 Solution Overview

Create two shared libraries and adopt consistent patterns:

1. **`@demo-platform/queue-manager-core`** (Node.js)
   - Session token management
   - Rate limiting
   - Secure env file handling
   - WebSocket protocol base
   - OTel metrics factory
   - Scenario rendering

2. **`demo-platform-python-utils`** (Python)
   - Retry decorator
   - Telemetry helpers
   - Base config validation

3. **Shared Docker/Makefile fragments**
   - Reusable YAML anchors
   - Common Makefile targets

### 4.2 Architecture Decision

**Recommendation**: Adopt confluence-demo/splunk-demo modular pattern for all projects.

```
queue-manager/
├── server.js              # Express app setup only (~150 lines)
├── instrumentation.js     # OTel bootstrap
├── config/
│   ├── index.js          # All configuration
│   └── metrics.js        # OTel metrics
├── services/
│   ├── state.js          # Shared state management
│   ├── session.js        # Session lifecycle
│   ├── queue.js          # Queue operations
│   └── invite.js         # Invite validation
├── handlers/
│   └── websocket.js      # WebSocket handlers
├── routes/
│   ├── health.js         # Health endpoints
│   ├── session.js        # Session validation
│   └── scenarios.js      # Scenario rendering
├── templates/
│   └── scenario.html     # HTML template
├── static/
│   └── scenario.css      # Styles
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## 5. Technical Specifications

### 5.1 Node.js Shared Library

**Package**: `@demo-platform/queue-manager-core`

#### 5.1.1 Module: `session-token.js`
```javascript
/**
 * Generate HMAC-SHA256 session token.
 * @param {string} sessionId - UUID session identifier
 * @param {string} secret - HMAC secret key
 * @returns {string} Base64-encoded token with signature
 */
function generateSessionToken(sessionId, secret);

/**
 * Validate session token.
 * @param {string} token - Token to validate
 * @param {string} secret - HMAC secret key
 * @param {Object} options - { maxAgeMs?: number }
 * @returns {{ valid: boolean, sessionId?: string, timestamp?: number, error?: string }}
 */
function validateSessionToken(token, secret, options);
```

#### 5.1.2 Module: `rate-limiter.js`
```javascript
class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} options.maxRequests - Max requests per window (default: 10)
   * @param {number} options.windowMs - Window duration in ms (default: 60000)
   * @param {number} options.cleanupThreshold - Cleanup when map exceeds this (default: 1000)
   */
  constructor(options);

  /**
   * Check if request is allowed.
   * @param {string} key - Rate limit key (typically IP address)
   * @returns {{ allowed: boolean, remaining?: number, retryAfter?: number }}
   */
  check(key);

  /**
   * Reset rate limit for a key.
   * @param {string} key
   */
  reset(key);
}
```

#### 5.1.3 Module: `env-file.js`
```javascript
/**
 * Create secure environment file.
 * @param {string} sessionId - Session identifier
 * @param {Object} envVars - Key-value pairs to write
 * @param {Object} options
 * @param {string} options.containerPath - Path inside container
 * @param {string} options.hostPath - Path on host (for --env-file)
 * @returns {{ containerPath: string, hostPath: string, cleanup: Function }}
 */
function createSessionEnvFile(sessionId, envVars, options);
```

#### 5.1.4 Module: `metrics.js`
```javascript
/**
 * Create standard demo platform metrics.
 * @param {string} serviceName - Service identifier (e.g., 'jira-demo')
 * @returns {Object} Metrics object with gauges, counters, histograms
 */
function createDemoMetrics(serviceName);

// Returns:
// {
//   queueSizeGauge,
//   sessionsActiveGauge,
//   sessionsStartedCounter,
//   sessionsEndedCounter,
//   invitesValidatedCounter,
//   sessionDurationHistogram,
//   queueWaitHistogram,
//   ttydSpawnHistogram,
//   sandboxCleanupHistogram,
//   registerCallbacks(stateProvider)
// }
```

#### 5.1.5 Module: `container-security.js`
```javascript
/**
 * Get standard container security flags for Docker run.
 * @param {Object} options
 * @param {string} options.memory - Memory limit (default: '2g')
 * @param {number} options.cpus - CPU limit (default: 2)
 * @param {number} options.pidsLimit - PID limit (default: 256)
 * @param {string} options.tmpfsSize - Tmpfs size (default: '512m')
 * @returns {string[]} Array of Docker CLI flags
 */
function getContainerSecurityFlags(options);
```

#### 5.1.6 Module: `scenario-renderer.js`
```javascript
/**
 * Render markdown scenario to HTML.
 * @param {string} markdown - Markdown content
 * @param {Object} scenario - { title: string, icon: string }
 * @param {Object} options
 * @param {string} options.templatePath - Path to HTML template
 * @param {string[]} options.navLinks - Navigation links array
 * @returns {string} Rendered HTML
 */
function renderScenario(markdown, scenario, options);
```

### 5.2 Python Shared Library

**Package**: `demo-platform-python-utils`

#### 5.2.1 Module: `retry.py`
```python
from typing import Set, Callable

RETRYABLE_STATUS_CODES: Set[int] = {429, 500, 502, 503, 504}

def retry_on_failure(
    max_retries: int = 3,
    base_delay: float = 1.0,
    retryable_codes: Set[int] = RETRYABLE_STATUS_CODES,
) -> Callable:
    """
    Decorator for retrying API calls with exponential backoff.

    Handles:
    - 429 Too Many Requests (respects Retry-After header)
    - 5xx Server errors
    - Connection/Timeout errors

    Usage:
        @retry_on_failure(max_retries=3)
        def api_call():
            return requests.get(url)
    """
```

#### 5.2.2 Module: `telemetry.py`
```python
def init_telemetry(service_name: str, scenario: str | None = None) -> Tracer | None:
    """Initialize OpenTelemetry tracer with OTLP exporter."""

def traced(span_name: str) -> Callable:
    """Decorator for automatic span creation."""

def add_span_attribute(key: str, value: Any) -> None:
    """Add attribute to current span."""
```

#### 5.2.3 Module: `config.py`
```python
class BaseConfig:
    """Base configuration class with validation."""

    def validate(self) -> bool:
        """Validate required fields are set."""

    def print_status(self) -> None:
        """Print configuration status for debugging."""

def require_config(config: BaseConfig) -> BaseConfig:
    """Validate config and exit if invalid."""
```

### 5.3 Shared Docker Fragments

**File**: `docker/compose-fragments/security-constraints.yml`
```yaml
x-container-security: &container-security
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
  cap_add:
    - CHOWN
    - SETUID
    - SETGID
    - DAC_OVERRIDE
  read_only: true
  tmpfs:
    - /tmp:rw,noexec,nosuid,size=512m

x-resource-limits: &resource-limits
  deploy:
    resources:
      limits:
        memory: 2g
        cpus: '2'
        pids: 256
```

**File**: `docker/compose-fragments/logging.yml`
```yaml
x-logging-standard: &logging-standard
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

### 5.4 Shared Makefile Includes

**File**: `makefile-includes/skill-testing.mk`
```makefile
# Skill testing targets
.PHONY: test-skill test-skill-mock test-skill-dev refine-skill

test-skill:
	$(call skill_test_run,$(SCENARIO))

test-skill-mock:
	$(call skill_test_run,$(SCENARIO),MOCK_MODE=true)

define skill_test_run
	docker run --rm \
		--network $(TELEMETRY_NETWORK) \
		-e SCENARIO=$(1) \
		$(if $(2),-e $(2)) \
		$(DEMO_CONTAINER_IMAGE)
endef
```

---

## 6. Implementation Plan

### 6.1 Phase 1: Quick Wins (Week 1)

No shared library required. Port improvements directly between projects.

| Task | From | To | Priority |
|------|------|----|----------|
| Add hard timeout (force-kill) | confluence-demo | jira-demo, splunk-demo | P0 |
| Add path traversal protection | jira-demo | confluence-demo, splunk-demo | P0 |
| Extract HTML template to file | confluence-demo pattern | jira-demo | P1 |
| Copy Jest test structure | splunk-demo | jira-demo, confluence-demo | P1 |

### 6.2 Phase 2: Refactor jira-demo (Week 2)

Refactor jira-demo from monolithic to modular architecture:

1. Create `config/index.js` - extract all configuration
2. Create `config/metrics.js` - extract OTel setup
3. Create `services/state.js` - extract state management
4. Create `services/session.js` - extract session logic
5. Create `services/queue.js` - extract queue logic
6. Create `services/invite.js` - extract invite logic
7. Create `handlers/websocket.js` - extract WS handlers
8. Create `routes/health.js`, `routes/session.js`, `routes/scenarios.js`
9. Create `templates/scenario.html` - extract HTML template
10. Reduce `server.js` to ~150 lines

### 6.3 Phase 3: Create Shared Libraries (Week 3-4)

1. Initialize `@demo-platform/queue-manager-core` package
2. Extract and test each module:
   - session-token.js
   - rate-limiter.js
   - env-file.js
   - metrics.js
   - container-security.js
   - scenario-renderer.js
3. Update all three projects to use shared library
4. Initialize `demo-platform-python-utils` package
5. Extract Python retry decorator
6. Update Python scripts to use shared library

### 6.4 Phase 4: Standardize & Document (Week 5)

1. Create shared Docker Compose fragments
2. Create shared Makefile includes
3. Update all CLAUDE.md files
4. Create contribution guide for new demos
5. Set up CI/CD for shared libraries

---

## 7. Quick Wins (No Library Required)

These changes can be made immediately by copying code between projects.

### 7.1 Add Hard Timeout to jira-demo and splunk-demo

**Source**: `confluence-demo/queue-manager/services/session.js:267-279`

**Add to jira-demo** at end of `startSession()` function (around line 1100):
```javascript
// Hard timeout: force-kill ttyd if still running after session timeout + 5 min grace
const hardTimeoutMs = (SESSION_TIMEOUT_MINUTES + 5) * 60 * 1000;
const hardTimeout = setTimeout(() => {
  if (activeSession && activeSession.ttydProcess && activeSession.clientId === client.id) {
    console.log(`Hard timeout reached for session ${sessionId}, force-killing ttyd`);
    try {
      activeSession.ttydProcess.kill('SIGKILL');
    } catch (err) {
      console.error('Error force-killing ttyd:', err.message);
    }
  }
}, hardTimeoutMs);

activeSession.hardTimeout = hardTimeout;
```

**Add to endSession()**: Clear the hard timeout
```javascript
// Clear hard timeout
if (activeSession.hardTimeout) {
  clearTimeout(activeSession.hardTimeout);
  activeSession.hardTimeout = null;
}
```

### 7.2 Add Path Traversal Protection

**Source**: `jira-demo/queue-manager/server.js` (scenarios route)

**Add to confluence-demo and splunk-demo** `routes/scenarios.js`:
```javascript
app.get('/api/scenarios/:name', (req, res) => {
  const scenarioName = req.params.name;
  const scenario = SCENARIO_NAMES[scenarioName];

  if (!scenario) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  // Path traversal protection
  const filePath = path.resolve(SCENARIOS_PATH, scenario.file);
  if (!filePath.startsWith(path.resolve(SCENARIOS_PATH))) {
    return res.status(400).json({ error: 'Invalid scenario path' });
  }

  // ... rest of handler
});
```

### 7.3 Standardize Container Security Flags

Ensure all three projects use identical flags:
```javascript
const CONTAINER_SECURITY_FLAGS = [
  '--memory', '2g',
  '--memory-swap', '2g',
  '--cpus', '2',
  '--pids-limit', '256',
  '--security-opt', 'no-new-privileges:true',
  '--cap-drop', 'ALL',
  '--cap-add', 'CHOWN',
  '--cap-add', 'SETUID',
  '--cap-add', 'SETGID',
  '--cap-add', 'DAC_OVERRIDE',
  '--read-only',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=512m',
  '--tmpfs', '/home/demo:rw,exec,nosuid,size=256m',
];
```

### 7.4 Copy Test Structure

Copy `splunk-demo/queue-manager/tests/` to other projects:
```
tests/
├── setup/
│   ├── app.js           # Test Express app factory
│   └── websocket.js     # WebSocket test helpers
├── unit/
│   ├── session.test.js
│   ├── queue.test.js
│   ├── invite.test.js
│   └── state.test.js
├── integration/
│   ├── http.test.js
│   └── websocket.test.js
└── e2e/
    └── queue-manager.e2e.test.js
```

---

## Appendix: Code Comparison

### A.1 Session Management Comparison

| Aspect | jira-demo | confluence-demo | splunk-demo |
|--------|-----------|-----------------|-------------|
| Location | server.js:~950-1200 | services/session.js | services/session.js |
| Lines | ~250 (inline) | ~450 (modular) | ~390 (modular) |
| Token generation | Inline function | Separate function | Separate function |
| Env file handling | Inline | Function with cleanup | Function with cleanup |
| Hard timeout | No | Yes | No |
| Sandbox cleanup | Yes | Yes | N/A |

### A.2 Rate Limiting Comparison

| Aspect | jira-demo | confluence-demo | splunk-demo |
|--------|-----------|-----------------|-------------|
| Location | server.js:488-544 | handlers/websocket.js | handlers/websocket.js |
| Connection limit | 10/min | 10/min | 10/min |
| Invite limit | 10/hour | 10/hour | 10/hour |
| Cleanup threshold | 1000 | 1000 | 1000 |
| Implementation | Identical | Identical | Identical |

### A.3 Files to Modify for Each Phase

**Phase 1 (Quick Wins)**:
- `jira-demo/queue-manager/server.js` - Add hard timeout, lines ~1050-1070, ~1150
- `splunk-demo/queue-manager/services/session.js` - Add hard timeout, lines ~200-220, ~280
- `confluence-demo/queue-manager/routes/scenarios.js` - Add path traversal check, line ~15
- `splunk-demo/queue-manager/routes/scenarios.js` - Add path traversal check, line ~15

**Phase 2 (jira-demo refactor)**:
- Create 10 new files (see Section 6.2)
- Reduce server.js from 1,423 lines to ~150 lines

**Phase 3 (Shared library)**:
- New package: `packages/queue-manager-core/`
- New package: `packages/python-utils/`
- Update: All three project's package.json
- Update: All three project's imports

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-18 | Claude Code Analysis | Initial draft |

---

## Related Documents

- `confluence-demo/CLAUDE.md` - Project conventions
- `jira-demo/CLAUDE.md` - Project conventions
- `splunk-demo/CLAUDE.md` - Project conventions
