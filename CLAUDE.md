# CLAUDE.md

This file provides guidance to Claude Code when working with the confluence-demo project.

## Project Overview

This is a production demo platform for **Confluence Assistant Skills** - a Claude Code plugin that enables natural language automation of Confluence Cloud operations.

### Architecture

```
confluence-demo/
├── docker-compose.yml          # Production orchestration (YAML anchors for DRY config)
├── docker-compose.dev.yml      # Development overrides
├── Makefile                    # 50+ dev/deploy/test targets (macros for reuse)
├── queue-manager/              # Node.js WebSocket server
│   ├── server.js               # Main server with session management
│   ├── templates/              # HTML templates (scenario.html)
│   └── static/                 # CSS files (scenario.css)
├── demo-container/             # Claude + Confluence plugin container
├── landing-page/               # Static HTML frontend
│   ├── index.html              # Main page
│   ├── styles.css              # Shared styles (includes error page styles)
│   └── unauthorized.html       # Error page (uses shared styles)
├── nginx/                      # Reverse proxy configuration
├── observability/              # LGTM stack (Grafana, Loki, Tempo)
├── scripts/                    # Python maintenance scripts
│   ├── confluence_base.py      # Shared API client with retry logic
│   ├── seed_demo_data.py       # Creates demo content
│   └── cleanup_demo_sandbox.py # Resets sandbox
└── secrets/                    # Credentials (.gitignored)
```

### Key Services

| Service | Port | Purpose |
|---------|------|---------|
| nginx | 80, 443 | Reverse proxy, SSL, static content |
| queue-manager | 3000 | WebSocket, session management, invites |
| demo-container | 7681 | Claude terminal (ttyd, spawned per session) |
| redis | 6379 | Session state, queue, invite tokens |
| lgtm | 3001 (Grafana), 4317, 4318 | Grafana, Loki, Tempo (LGTM stack) |

## Development Commands

### Quick Start

```bash
# Start local development
make dev

# Access at http://localhost:8080
# Grafana at http://localhost:3001

# Stop environment
make dev-down
```

### Skill Testing

```bash
# Run skill test with live Confluence
make test-skill SCENARIO=page

# Run with mock API (fast, no Confluence needed)
make test-skill-mock SCENARIO=search

# Test single prompt for fast iteration
make test-skill-dev SCENARIO=page PROMPT_INDEX=0

# Run all mock tests in parallel
make test-all-mocks
```

### Code Quality

```bash
# Run all linters
make lint

# JavaScript only (ESLint)
make lint-js

# Python only (Ruff)
make lint-py

# Auto-fix issues
make lint-fix
```

### Code Review

Use the `feature-dev:code-reviewer` subagent for security and quality review:

```
Run a code-reviewer subagent on project
```

This identifies security vulnerabilities, logic errors, and code quality issues.

### Sandbox Management

```bash
# Seed demo data (creates CDEMO space with pages)
make seed-sandbox

# Reset sandbox (removes user content, keeps demo data)
make reset-sandbox
```

### Invite Management

```bash
# Generate invite (local dev)
make invite-local

# Generate with custom expiration and label
make invite EXPIRES=7d LABEL="Workshop Demo"

# List/revoke invites
make invite-list
make invite-revoke TOKEN=abc123
```

## Demo Scenarios

| Scenario | File | Description |
|----------|------|-------------|
| page | page.prompts | Page CRUD operations |
| search | search.prompts | CQL queries, text search |
| space | space.prompts | Space management |
| template | template.prompts | Page templates |
| hierarchy | hierarchy.prompts | Page tree navigation |
| comment | comment.prompts | Comments |
| attachment | attachment.prompts | File attachments |
| label | label.prompts | Content labeling |
| permission | permission.prompts | Access control |
| bulk | bulk.prompts | Bulk operations |
| analytics | analytics.prompts | Views, watchers |

## Claude Code Integration

### Slash Commands

Available via `.claude/commands/`:

| Command | Description |
|---------|-------------|
| `/start-local` | Start local dev environment |
| `/stop-local` | Stop local dev environment |
| `/status-local` | Check local service status |
| `/logs` | View all service logs |
| `/otel-logs` | View observability stack logs |
| `/test-skill-dev` | Run skill test (SCENARIO=page) |
| `/refine-skill` | Run skill refinement loop |
| `/queue-status-local` | Check queue manager status |
| `/invite-local` | Generate local invite URL |
| `/reset-sandbox` | Reset sandbox to clean state |
| `/seed-sandbox` | Seed demo data |

### Agents

| Agent | Purpose |
|-------|---------|
| `skill-fix` | Analyze skill test failures and make targeted fixes |

## Configuration

### Environment Variables

Set in `secrets/.env`:

```bash
# Confluence API
CONFLUENCE_SITE_URL=https://your-site.atlassian.net
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-api-token

# Demo Space
DEMO_SPACE_KEY=CDEMO
SEED_DEMO_DATA=true

# Claude Authentication (one required)
CLAUDE_CODE_OAUTH_TOKEN=...  # or
ANTHROPIC_API_KEY=...

# Security (required in production)
SESSION_SECRET=your-secure-random-string

# Security (optional)
BASE_URL=https://demo.example.com        # Base URL for origin validation (default: http://localhost:8080)
ALLOWED_ORIGINS=https://demo.example.com # Comma-separated allowed WebSocket origins (default: BASE_URL)
COOKIE_SECURE=true                       # Force secure cookies (auto-enabled in production)
SESSION_ENV_HOST_PATH=/path/to/session-env  # Host path for session env files
```

### Secure Token Storage

**macOS Keychain:**
```bash
security add-generic-password -a "$USER" -s "CLAUDE_CODE_OAUTH_TOKEN" -w "<token>"
```

**Linux (secret-tool):**
```bash
secret-tool store --label="Claude Code OAuth" service CLAUDE_CODE_OAUTH_TOKEN username "$USER"
```

**Environment variable (fallback):**
```bash
export CLAUDE_CODE_OAUTH_TOKEN="<token>"
```

The Makefile automatically retrieves from keychain/secret-tool when available.

## Project Conventions

### Prompts Files

Scenario prompts use YAML frontmatter with expectations:

```yaml
---
prompt: |
  Show me all pages in space CDEMO
expect:
  tools:
    must_call: [Skill]
  text:
    must_contain: [CDEMO, page]
    must_not_contain: [error, failed]
  semantic: |
    Response should list pages with titles and IDs.
---
```

### Seed Data

The `seed_demo_data.py` script creates:

- CDEMO space with demo pages
- Sample page hierarchy
- Labels: demo, docs, api, guide
- Sample attachments
- Blog posts

### Cleanup

The `cleanup_demo_sandbox.py` script:

- Removes pages without `demo` label
- Preserves seed data
- Clears comments from demo pages

## Security Considerations

### Session Management

- `SESSION_SECRET` must be set in production (server exits if default value detected with `NODE_ENV=production`)
- Development mode warns when using default `SESSION_SECRET`
- Session tokens use HMAC-SHA256 signatures
- Secure cookies with `httpOnly`, `secure` (production), and `sameSite=strict`
- Reconnection logic has race condition protection via `reconnectionInProgress` lock
- TTY process hard timeout (session timeout + 5 min) as safety net

### Rate Limiting

- **WebSocket connections**: 10 connections per IP per minute
- **Invite validation**: 10 failed attempts per IP per hour (brute-force protection)
- Automatic cleanup of stale rate limit entries every 5 minutes

### Input Validation

- Invite tokens validated via regex: `[A-Za-z0-9_-]{4,64}`
- Invite labels limited to 100 characters, control characters stripped
- HTML template substitution uses `escapeHtml()` to prevent XSS
- Markdown output sanitized via DOMPurify (whitelist of safe tags/attributes)
- Scenario names validated against whitelist (`SCENARIO_NAMES` object)
- Path traversal protection validates resolved paths stay within `SCENARIOS_PATH`
- Content-Type validation rejects non-JSON POST/PUT/PATCH requests

### HTTP Security Headers

Helmet.js provides security headers including:
- Content-Security-Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security (HSTS)

### WebSocket Security

- Origin validation against `ALLOWED_ORIGINS` whitelist
- Rate limiting per IP address
- Connections from non-allowed origins are rejected

### Container Security

Spawned demo containers have security constraints:
- **Memory limit**: 2GB (no swap)
- **CPU limit**: 2 cores
- **PID limit**: 256 (prevents fork bombs)
- **Capabilities**: All dropped except CHOWN, SETUID, SETGID, DAC_OVERRIDE
- **no-new-privileges**: Prevents privilege escalation
- **Read-only root filesystem**: With tmpfs for `/tmp` and `/home/demo`

### Credential Protection

- Sensitive credentials passed via `--env-file` (not visible in `ps aux` or `docker inspect`)
- Session env files created with 0600 permissions
- Env files cleaned up on session end
- Docker socket access documented with security mitigations in `docker-compose.yml`

### API Client

The `scripts/confluence_base.py` module provides:

- Automatic retry with exponential backoff (1s, 2s, 4s)
- Rate limit handling (429) with Retry-After header support
- Transient error handling (500, 502, 503, 504)
- Connection timeout (30s)

## Coding Patterns

### DRY Configuration

**Docker Compose YAML anchors:**
```yaml
x-logging-standard: &logging-standard
  driver: json-file
  options:
    max-size: "10m"

services:
  nginx:
    logging: *logging-standard
```

**Makefile macros:**
```makefile
define skill_test_run
  docker run --rm $(1) ...
endef

test-skill:
  $(call skill_test_run,$(CONFLUENCE_ENV_VARS),)
```

### Template Extraction

HTML templates in `queue-manager/templates/` use placeholder substitution:
```html
<title>{{ICON}} {{TITLE}}</title>
```

Always escape dynamic values:
```javascript
const escapeHtml = (str) => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
```

### Shared Modules

Python scripts use `scripts/confluence_base.py`:
```python
from confluence_base import ConfluenceClient, require_config

config = require_config()
client = ConfluenceClient(config)
response = client.get("/wiki/api/v2/spaces")
```

## Testing Strategy

**Important:** Tests require the dev environment running (`make dev`) or at minimum the `demo-telemetry-network` Docker network.

### Unit Tests (Mock API)

```bash
make test-skill-mock SCENARIO=page
```

Uses `CONFLUENCE_MOCK_MODE=true` for fast, deterministic tests.

### Integration Tests (Live API)

```bash
make test-skill SCENARIO=page
```

Requires valid Confluence credentials.

### Skill Refinement Loop

```bash
make refine-skill SCENARIO=search MAX_ATTEMPTS=3
```

Iteratively tests and fixes skills until passing.

### Session Checkpointing

The `skill-test.py` runner supports checkpointing for fast iteration:

```bash
# First run creates checkpoint after Claude initialization
make test-skill-dev SCENARIO=page

# Subsequent runs restore from checkpoint (skips 30s+ startup)
make test-skill-dev SCENARIO=page PROMPT_INDEX=2

# Clear checkpoints
make clear-checkpoints
```

Checkpoints are stored in `/tmp/claude-checkpoints/` and automatically invalidate when the plugin or scenario changes.

## Observability

### Grafana Dashboards

- **Demo Home**: Overview of queue and sessions
- **Skill Test Results**: Test pass/fail metrics
- **Queue Operations**: Queue size, wait times
- **Session Analytics**: User behavior

### Logs

```bash
# All logs
make logs

# Queue manager only
make logs-queue

# Error grep
make logs-errors-local
```

### Traces

Access Tempo at http://localhost:3200 (dev mode).

## Deployment

### Production

```bash
# Deploy with SSL
make deploy
make ssl-setup DOMAIN=demo.confluence-skills.dev
```

### Health Check

```bash
make health
```

## Shared Library

This project uses `@demo-platform/queue-manager-core` for common queue-manager functionality shared across jira-demo, confluence-demo, and splunk-demo.

### Location

```
demo-platform-shared/packages/queue-manager-core/
├── lib/
│   ├── index.js       # Main exports
│   ├── session.js     # Session token generation/validation
│   ├── rate-limit.js  # Connection and invite rate limiting
│   ├── env-file.js    # Secure environment file management
│   └── metrics.js     # OpenTelemetry metrics factory
├── test/              # Unit tests (16 tests)
└── package.json
```

### What's Shared

| Component | File | Usage |
|-----------|------|-------|
| Session tokens | `session.js` | HMAC-SHA256 token generation and validation |
| Rate limiting | `rate-limit.js` | Connection and invite brute-force protection |
| Env files | `env-file.js` | Secure credential file creation with 0600 permissions |
| Metrics | `metrics.js` | Standardized OpenTelemetry counters, histograms, gauges |

### Usage in This Project

```javascript
// config/metrics.js
const { createMetrics } = require('@demo-platform/queue-manager-core');
const metricsManager = createMetrics({ serviceName: 'confluence-demo-queue-manager', ... });

// services/session.js
const { generateSessionToken, createSessionEnvFile } = require('@demo-platform/queue-manager-core');
const token = generateSessionToken(sessionId, config.SESSION_SECRET);
const envFile = createSessionEnvFile(sessionId, envVars, { containerPath, hostPath });

// handlers/websocket.js, services/invite.js
const { createConnectionRateLimiter, createInviteRateLimiter } = require('@demo-platform/queue-manager-core');
```

### Updating the Shared Library

1. Make changes in `demo-platform-shared/packages/queue-manager-core/`
2. Run tests: `cd demo-platform-shared/packages/queue-manager-core && npm test`
3. Update all consuming projects: `npm install` in each queue-manager directory
4. Verify each project loads correctly: `node -e "require('./config'); console.log('OK')"`

### Shared Docker/Makefile Includes

Docker Compose fragments and Makefile includes are available in:

```
demo-platform-shared/
├── docker/compose-fragments/
│   ├── security-constraints.yml  # Container security anchors
│   ├── logging.yml               # Logging configuration anchors
│   └── healthcheck.yml           # Health check anchors
└── makefile-includes/
    ├── common.mk                 # Common dev/deploy targets
    ├── skill-testing.mk          # Skill test targets
    └── invites.mk                # Invite management targets
```

## Related Projects

| Project | Repository | Purpose |
|---------|------------|---------|
| Confluence-Assistant-Skills | [GitHub](https://github.com/jasonkrueger/Confluence-Assistant-Skills) / [PyPI](https://pypi.org/project/confluence-assistant-skills-plugin/) | Source plugin |
| confluence-assistant-skills-lib | [PyPI](https://pypi.org/project/confluence-assistant-skills-lib/) | Shared library |
| jira-demo | [GitHub](https://github.com/jasonkrueger/jira-demo) | Reference implementation |
| splunk-demo | [GitHub](https://github.com/grandcamel/splunk-demo) | Similar demo for Splunk |

## Common Tasks

### Before Committing

Always run linters before committing:
```bash
make lint
```

For refactoring work, use the code-reviewer subagent to catch security issues.

### Adding a New Scenario

1. Create `demo-container/scenarios/<name>.prompts`
2. Create `demo-container/scenarios/<name>.md` (documentation)
3. Add to entrypoint.sh menu
4. Add to Makefile help

### Modifying Seed Data

Edit `scripts/seed_demo_data.py`:

```python
DEMO_PAGES = [
    {"title": "New Page", "labels": ["demo", "new"]},
]
```

### Updating Plugin Version

The container installs the plugin at runtime from the marketplace. To use a local version:

```bash
make test-skill-dev SCENARIO=page
```

This mounts your local plugin source.

## Troubleshooting

### Common Issues

**Container fails to start:**
```bash
# Check Docker is running
docker info

# Check for port conflicts
lsof -i :3000 -i :3001 -i :8080

# View container logs
make logs
```

**Claude authentication fails:**
```bash
# Verify token is set
echo $CLAUDE_CODE_OAUTH_TOKEN | head -c 20

# Check keychain (macOS)
security find-generic-password -s "CLAUDE_CODE_OAUTH_TOKEN" -w 2>/dev/null | head -c 20
```

**Skill test hangs:**
```bash
# Check if Claude is responsive
make queue-status-local

# Clear stale checkpoints
rm -rf /tmp/claude-checkpoints/

# Run with verbose output
make test-skill-dev SCENARIO=page VERBOSE=1
```

**Confluence API errors:**
```bash
# Verify credentials
curl -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  "$CONFLUENCE_SITE_URL/wiki/api/v2/spaces?limit=1"

# Check rate limits (429 errors)
# Wait 60 seconds and retry
```

**Redis connection issues:**
```bash
# Check Redis is running
docker compose ps redis

# Connect to Redis CLI
docker compose exec redis redis-cli ping
```

**Plugin installation fails ("⚠ Plugin installation failed"):**
```bash
# Check plugin.json has no unrecognized keys
# Claude Code rejects any keys not in the schema (e.g., "assistant_skills" is invalid)

# Verify marketplace name matches what's in marketplace.json
# Format: claude plugin install <plugin>@<marketplace-name>
# Example: claude plugin install confluence-assistant-skills@confluence-assistant-skills-marketplace

# Check plugin cache path (includes .claude-plugin/ directory)
ls ~/.claude/plugins/cache/*/confluence-assistant-skills/*/.claude-plugin/plugin.json

# Clear plugin cache and reinstall
rm -rf ~/.claude/plugins
claude plugin marketplace add https://github.com/grandcamel/confluence-assistant-skills.git#main
claude plugin install confluence-assistant-skills@confluence-assistant-skills-marketplace --scope user
```

**CLI installation fails ("⚠ CLI installation failed"):**
```bash
# Verify PyPI package name matches what entrypoint.sh expects
pip search confluence-assistant-skills  # Note: search may be disabled

# Check package exists on PyPI
curl -s https://pypi.org/pypi/confluence-assistant-skills/json | jq .info.version

# Manual install for debugging
pip install confluence-assistant-skills -v
```

**Autoplay scenario errors ("No prompts found"):**
```bash
# Prompts files use YAML format with document separators
# Correct format:
# ---
# prompt: |
#   Your multi-line prompt here
# expect:
#   tools:
#     must_call: [Skill]
# ---

# Test parser output
grep -c "^prompt:" demo-container/scenarios/page.prompts
```

**Browser testing limitations:**
- Playwright cannot send keyboard input to ttyd terminal iframes
- The terminal uses xterm.js which captures all keyboard events
- Workaround: Test scenarios via `make test-skill-dev` instead of browser automation
- For visual verification, use `make test-skill-dev` with `FIX_CONTEXT=1`

### Debug Mode

Enable verbose logging:

```bash
# All services
DEBUG=* make dev

# Specific service
make logs-queue
make logs-errors-local
```

### Reset Everything

```bash
# Nuclear option - removes all containers, volumes, checkpoints
make clean-all
make dev
```
