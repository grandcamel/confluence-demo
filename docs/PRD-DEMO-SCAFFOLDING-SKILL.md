# PRD: Demo Scaffolding Skill for Assistant-Skills Plugin

## Executive Summary

This PRD defines a new skill for the Assistant-Skills plugin ecosystem that automates the creation of production-ready demo platforms similar to jira-demo, confluence-demo, and splunk-demo. The skill will scaffold complete, security-hardened demo infrastructure with queue management, observability, and Claude Code integration in minutes instead of days.

---

## Problem Statement

### Current State
- Creating a new Assistant-Skills demo platform requires 40+ hours of manual work
- Developers copy/paste from existing demos, introducing inconsistencies
- Security patterns must be manually replicated (rate limiting, credential handling, container constraints)
- Testing infrastructure requires deep knowledge of skill-test.py patterns
- Observability setup is complex and error-prone
- No standardized way to ensure demos follow best practices

### Impact
- Slow time-to-market for new Assistant-Skills plugins
- Inconsistent security posture across demos
- High maintenance burden due to divergent codebases
- Barrier to entry for community contributors

---

## Goals & Success Metrics

### Primary Goals
1. **Reduce scaffolding time** from 40+ hours to < 30 minutes
2. **Enforce security best practices** automatically
3. **Standardize infrastructure patterns** across all demos
4. **Enable rapid skill testing** with built-in test harness

### Success Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first working demo | < 30 minutes | From skill invocation to `make dev` success |
| Security compliance | 100% | All 12 security features present by default |
| Test infrastructure included | 100% | skill-test.py, mock API support, scenarios |
| Documentation coverage | 100% | CLAUDE.md, README.md auto-generated |

---

## User Personas

### Primary: Plugin Developer
- Has created an Assistant-Skills plugin (e.g., `github-assistant-skills`)
- Wants to showcase plugin capabilities with live demo
- Familiar with Docker, Node.js basics
- May not know infrastructure best practices

### Secondary: DevRel Engineer
- Needs to create demos for multiple plugins quickly
- Requires consistent branding and UX across demos
- Wants observability out-of-the-box for demo analytics

### Tertiary: Community Contributor
- Wants to extend existing demos
- Needs clear documentation and patterns to follow
- Values working examples over abstract documentation

---

## Feature Specification

### Skill: `create-assistant-demo`

#### Trigger Phrases
```yaml
triggers:
  - create demo
  - scaffold demo
  - new demo project
  - generate demo infrastructure
  - create assistant skills demo
  - set up demo for plugin
```

#### Interactive Configuration Flow

The skill should guide users through configuration:

```
┌─────────────────────────────────────────────────────────────┐
│ Create Assistant-Skills Demo                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 1. Demo Name: _____________ (e.g., "github-demo")           │
│                                                              │
│ 2. Product Name: _____________ (e.g., "GitHub")             │
│                                                              │
│ 3. Plugin Source:                                           │
│    ○ PyPI package: _______________                          │
│    ○ GitHub repo: _______________                           │
│    ○ No plugin (CLI-only demo)                              │
│                                                              │
│ 4. API Configuration:                                       │
│    Base URL variable: _____________ (e.g., GITHUB_API_URL)  │
│    Auth token variable: _____________ (e.g., GITHUB_TOKEN)  │
│    Additional credentials (comma-separated): ___________    │
│                                                              │
│ 5. Scenarios (comma-separated):                             │
│    _______________ (e.g., search,issues,repos,admin)        │
│                                                              │
│ 6. Features:                                                │
│    ☑ Mock API support                                       │
│    ☑ Skill testing infrastructure                           │
│    ☑ Auto-play mode                                         │
│    ☑ Sandbox reset script                                   │
│    ☐ CI/CD pipeline (GitHub Actions)                        │
│    ☐ Pre-commit hooks                                       │
│                                                              │
│ 7. Output directory: _____________ (default: ./{name})      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Generated Artifacts

### Directory Structure

```
{demo-name}/
├── docker-compose.yml              # Production config with YAML anchors
├── docker-compose.dev.yml          # Development overrides
├── docker-compose.test.yml         # Test environment (if CI enabled)
├── Makefile                        # 50+ targets with macOS Keychain support
├── CLAUDE.md                       # Comprehensive Claude Code guidance
├── README.md                       # Project documentation
├── .gitignore                      # Standard exclusions
├── pyproject.toml                  # Python linting config
│
├── queue-manager/                  # Node.js WebSocket server
│   ├── server.js                   # Main entry (modular architecture)
│   ├── package.json                # Dependencies with security packages
│   ├── Dockerfile                  # Multi-stage build
│   ├── instrumentation.js          # OpenTelemetry setup
│   ├── invite-cli.js               # Invite management CLI
│   ├── eslint.config.js            # ESLint 9+ flat config
│   ├── config/
│   │   ├── index.js                # Configuration constants
│   │   └── metrics.js              # OTel metrics setup
│   ├── services/
│   │   ├── state.js                # Shared state management
│   │   ├── queue.js                # Queue logic
│   │   ├── session.js              # Session management
│   │   └── invite.js               # Invite validation
│   ├── routes/
│   │   ├── health.js               # Health endpoints
│   │   ├── session.js              # Session API
│   │   └── scenarios.js            # Scenario rendering
│   ├── handlers/
│   │   └── websocket.js            # WebSocket handlers
│   ├── static/
│   │   └── scenario.css            # Scenario page styling
│   └── templates/
│       └── scenario.html           # Scenario page template
│
├── demo-container/
│   ├── Dockerfile                  # Custom claude-devcontainer
│   ├── entrypoint.sh               # Interactive menu
│   ├── autoplay.sh                 # Auto-play script (if enabled)
│   ├── skill-test.py               # Test runner (if plugin enabled)
│   ├── skill-refine-loop.py        # Refinement script (if enabled)
│   ├── motd                        # Welcome message
│   ├── settings.json               # Claude Code settings
│   └── scenarios/
│       ├── {scenario}.prompts      # Test prompts (per scenario)
│       └── {scenario}.md           # Documentation (per scenario)
│
├── landing-page/
│   ├── index.html                  # Main page with queue UI
│   ├── queue-client.js             # WebSocket client
│   ├── styles.css                  # Shared styles
│   ├── unauthorized.html           # Error page
│   └── assets/
│       └── logo.svg                # Placeholder logo
│
├── nginx/
│   ├── nginx.conf                  # Main config
│   ├── demo.conf                   # Production site
│   ├── demo.dev.conf               # Development site
│   └── locations.include           # Shared routing
│
├── observability/
│   ├── grafana-dashboards.yaml     # Dashboard provisioning
│   ├── grafana-datasources.yaml    # Datasource config
│   ├── loki-config.yaml            # Log storage
│   ├── tempo-config.yaml           # Trace storage
│   ├── prometheus.yaml             # Metrics scraping
│   ├── promtail-config.yaml        # Log shipping
│   ├── otelcol-config.yaml         # Telemetry collection
│   └── dashboards/
│       ├── demo-home.json          # Overview dashboard
│       ├── queue-operations.json   # Queue metrics
│       └── session-analytics.json  # Session metrics
│
├── scripts/
│   ├── deploy.sh                   # Deployment script
│   ├── healthcheck.sh              # Health check
│   ├── {product}_base.py           # API client base class
│   ├── seed_demo_data.py           # Data seeding
│   └── cleanup_demo_sandbox.py     # Sandbox reset
│
├── secrets/
│   └── example.env                 # Environment template
│
├── .claude/
│   ├── commands/
│   │   ├── start-local.md          # make dev
│   │   ├── stop-local.md           # make dev-down
│   │   ├── status-local.md         # Service status
│   │   ├── logs.md                 # View logs
│   │   ├── otel-logs.md            # Observability logs
│   │   ├── invite-local.md         # Generate invite
│   │   ├── reset-sandbox.md        # Reset sandbox
│   │   ├── test-skill-dev.md       # Run skill test (if plugin)
│   │   └── refine-skill.md         # Refinement loop (if plugin)
│   └── agents/
│       └── skill-fix.md            # Fix failed tests (if plugin)
│
├── docs/
│   └── ARCHITECTURE.md             # Architecture details
│
└── .github/                        # (if CI enabled)
    └── workflows/
        └── test.yml                # CI pipeline
```

---

## Security Features (Auto-Included)

All generated demos include these security measures by default:

### 1. Input Validation
- Invite tokens: `[A-Za-z0-9_-]{4,64}` regex validation
- Scenario names: Whitelist validation against `SCENARIO_NAMES`
- Content-Type enforcement: 415 for non-JSON POST/PUT/PATCH

### 2. Rate Limiting
- Connection rate limiting: 10 connections/IP/minute
- Invite brute-force protection: 10 failed attempts/IP/hour
- Periodic cleanup of stale rate limit entries

### 3. Session Security
- `SESSION_SECRET` required in production (server exits if default)
- HMAC-SHA256 signed session tokens
- HttpOnly, Secure, SameSite=Strict cookies
- Reconnection race condition protection

### 4. Container Security
- Memory limit: 2GB (configurable)
- CPU limit: 2 cores (configurable)
- PID limit: 256 processes
- `--cap-drop=ALL` with minimal adds (CHOWN, SETUID, SETGID, DAC_OVERRIDE)
- `--read-only` root filesystem with tmpfs mounts
- `--security-opt=no-new-privileges:true`

### 5. Credential Protection
- Secrets passed via `--env-file` (not visible in `ps aux`)
- Session env files cleaned up on session end
- macOS Keychain / Linux secret-tool integration in Makefile

### 6. HTTP Security Headers (Helmet.js)
- Content-Security-Policy with strict directives
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- Cross-Origin-Embedder-Policy (disabled for terminal iframe)

### 7. XSS Prevention
- DOMPurify sanitization for markdown rendering
- HTML escaping for template substitution
- Strict CSP for script sources

### 8. Path Traversal Prevention
- `path.resolve()` validation for scenario files
- Base path containment checks

### 9. WebSocket Security
- Origin validation against ALLOWED_ORIGINS
- Rate limiting before connection acceptance

### 10. Redis Security
- Connection error handling
- Session TTL enforcement
- Graceful degradation

### 11. Docker Socket Protection
- Read-only mounts where possible
- Minimal container privileges

### 12. Production Validation
- `NODE_ENV=production` enforces SESSION_SECRET
- Warning logs for development defaults

---

## Makefile Targets (Generated)

```makefile
# Development
dev                    # Start full stack
dev-down               # Stop dev stack
build                  # Build all containers
logs                   # Follow all logs
logs-queue             # Queue manager logs
logs-nginx             # Nginx logs
logs-errors-local      # Error filtering
health                 # Health check
status-local           # Service status

# Sandbox Management
seed-sandbox           # Create demo data
reset-sandbox          # Clean user content

# Invites
invite-local           # Generate invite URL
invite-list            # List invites
invite-revoke TOKEN=   # Revoke invite

# Testing (if plugin enabled)
test-skill SCENARIO=   # Run live tests
test-skill-mock SCENARIO=  # Mock API tests
test-skill-dev SCENARIO=   # Single prompt test
test-all-mocks         # All scenarios
refine-skill SCENARIO= # Refinement loop
refine-all-mocks       # All refinements
clear-checkpoints      # Clear test checkpoints

# Linting
lint                   # All linters
lint-js                # ESLint
lint-py                # Ruff
lint-fix               # Auto-fix

# Deployment
deploy                 # Production deploy
ssl-setup DOMAIN=      # SSL certificate
ssl-renew              # Renew certificates

# Observability
otel-logs              # LGTM stack logs
traces-errors-local    # Trace inspection

# Utilities
clean                  # Remove containers
clean-all              # Full reset
```

---

## CLAUDE.md Structure (Generated)

```markdown
# CLAUDE.md

## Project Overview
[Generated description of the demo purpose]

### Architecture
[ASCII diagram of services]

### Key Services
| Service | Port | Purpose |
|---------|------|---------|
[Auto-generated from config]

## Development Commands
[Quick Start, Skill Testing, Code Quality sections]

## Configuration
[Environment variables, Secure storage patterns]

## Project Conventions
[Prompts files, Seed data, Cleanup patterns]

## Security Considerations
[Session management, Input validation, Container security]

## Testing Strategy
[Mock vs Live, Execution patterns, Checkpointing]

## Observability
[Dashboards, Logs, Traces]

## Troubleshooting
[Common issues with solutions]
```

---

## Implementation Plan

### Phase 1: Core Skill Implementation (2-3 days)

**Tasks:**
1. Create skill file structure in Assistant-Skills plugin
2. Implement interactive configuration flow using AskUserQuestion
3. Create base template files for all artifacts
4. Implement file generation with template substitution
5. Add validation for configuration inputs

**Deliverables:**
- `.claude/skills/create-assistant-demo/SKILL.md`
- Template files in `.claude/skills/create-assistant-demo/templates/`
- Skill triggers and routing from hub skill

### Phase 2: Template Library (3-4 days)

**Tasks:**
1. Extract templates from confluence-demo as canonical source
2. Parameterize all configuration values
3. Create conditional sections (plugin vs no-plugin, CI vs no-CI)
4. Implement security features as non-optional defaults
5. Create scenario scaffold templates

**Deliverables:**
- Complete template library (50+ files)
- Template variable documentation
- Conditional rendering logic

### Phase 3: Testing & Validation (2-3 days)

**Tasks:**
1. Create test scenarios for skill itself
2. Validate generated demos start successfully
3. Verify all security features present
4. Test edge cases (special characters, long names)
5. Performance testing (generation time)

**Deliverables:**
- Skill test prompts in `.prompts` format
- Validation checklist
- Performance benchmarks

### Phase 4: Documentation & Polish (1-2 days)

**Tasks:**
1. Write skill documentation
2. Create usage examples
3. Add troubleshooting section
4. Create video walkthrough script
5. Update hub skill routing

**Deliverables:**
- Comprehensive skill documentation
- Example invocations
- Troubleshooting guide

---

## Technical Considerations

### Template Engine

Use simple string replacement with delimiters:
- `{{VARIABLE}}` for simple substitution
- `{{#IF condition}}...{{/IF}}` for conditional blocks
- `{{#EACH items}}...{{/EACH}}` for lists

Example:
```javascript
const rendered = template
  .replace(/\{\{DEMO_NAME\}\}/g, config.demoName)
  .replace(/\{\{PRODUCT_NAME\}\}/g, config.productName);
```

### File Generation Strategy

1. Create directory structure first
2. Copy static assets (images, fonts)
3. Generate templated files
4. Set appropriate permissions
5. Initialize git repository (optional)

### Configuration Persistence

Store configuration in `demo.config.json` at project root:
```json
{
  "generatedBy": "create-assistant-demo",
  "version": "1.0.0",
  "generatedAt": "2024-01-18T...",
  "config": {
    "demoName": "github-demo",
    "productName": "GitHub",
    "plugin": {...},
    "scenarios": [...]
  }
}
```

This enables:
- Regeneration with same settings
- Upgrade detection
- Configuration auditing

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Template drift from source demos | High | Medium | Quarterly sync process, automated diff detection |
| Security feature bypassed | Low | High | Mandatory inclusion, no opt-out for security |
| Complex configurations fail | Medium | Medium | Extensive validation, sensible defaults |
| Generated code quality issues | Medium | Low | ESLint/Ruff in templates, pre-generation lint |
| Slow generation time | Low | Low | Async file writes, progress indicators |

---

## Future Enhancements

### v1.1: Enhanced Customization
- Custom landing page themes
- Additional observability dashboards
- Multi-language scenario support

### v1.2: Upgrade Support
- Detect outdated generated demos
- Selective file regeneration
- Migration scripts for breaking changes

### v2.0: Multi-Plugin Support
- Generate demos showcasing multiple plugins
- Plugin composition patterns
- Shared scenario infrastructure

---

## Appendix A: Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DEMO_NAME` | Lowercase, kebab-case | `github-demo` |
| `DEMO_TITLE` | Display title | `GitHub Live Demo` |
| `PRODUCT_NAME` | Product/brand | `GitHub` |
| `PRODUCT_NAME_LOWER` | Lowercase product | `github` |
| `PLUGIN_NAME` | Plugin identifier | `github-assistant-skills` |
| `PLUGIN_PACKAGE` | PyPI/npm package | `github-assistant-skills` |
| `API_URL_VAR` | Base URL env var | `GITHUB_API_URL` |
| `API_TOKEN_VAR` | Auth token env var | `GITHUB_TOKEN` |
| `SCENARIOS` | Comma-separated list | `search,issues,repos` |
| `SCENARIO_COUNT` | Number of scenarios | `3` |
| `QUEUE_PORT` | Queue manager port | `3000` |
| `GRAFANA_PORT` | Grafana port | `3001` |
| `NGINX_PORT` | Nginx port | `8080` |
| `SESSION_TIMEOUT` | Minutes | `60` |
| `MAX_QUEUE_SIZE` | Queue capacity | `10` |

---

## Appendix B: Example Invocation

```
User: Create a demo for my new GitHub Assistant Skills plugin

Claude: I'll help you create a complete demo platform for GitHub Assistant Skills.
Let me gather some configuration details.

[Uses AskUserQuestion for configuration]

User provides:
- Demo name: github-demo
- Product name: GitHub
- Plugin: github-assistant-skills (PyPI)
- API vars: GITHUB_API_URL, GITHUB_TOKEN
- Scenarios: search, issues, repos, pullrequests, admin

Claude: Creating your demo platform...

✓ Created directory structure (15 directories)
✓ Generated queue-manager (12 files)
✓ Generated landing-page (4 files)
✓ Generated nginx configuration (4 files)
✓ Generated observability stack (8 files)
✓ Generated demo-container (8 files)
✓ Generated scripts (5 files)
✓ Generated Claude Code commands (10 files)
✓ Generated documentation (3 files)

Your GitHub demo is ready at ./github-demo/

Quick start:
  cd github-demo
  cp secrets/example.env secrets/.env
  # Edit secrets/.env with your credentials
  make dev

The demo will be available at http://localhost:8080

Next steps:
1. Configure your GitHub API credentials in secrets/.env
2. Run `make seed-sandbox` to create demo data
3. Run `make invite-local` to generate an invite URL
4. Access the demo and test your scenarios
```

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Tech Lead | | | |
| Security Review | | | |
