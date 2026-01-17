# CLAUDE.md

This file provides guidance to Claude Code when working with the confluence-demo project.

## Project Overview

This is a production demo platform for **Confluence Assistant Skills** - a Claude Code plugin that enables natural language automation of Confluence Cloud operations.

### Architecture

```
confluence-demo/
├── docker-compose.yml          # Production orchestration
├── docker-compose.dev.yml      # Development overrides
├── Makefile                    # 50+ dev/deploy/test targets
├── queue-manager/              # Node.js WebSocket server
├── demo-container/             # Claude + Confluence plugin container
├── landing-page/               # Static HTML frontend
├── nginx/                      # Reverse proxy configuration
├── observability/              # LGTM stack (Grafana, Loki, Tempo)
├── scripts/                    # Python maintenance scripts
└── secrets/                    # Credentials (.gitignored)
```

### Key Services

| Service | Port | Purpose |
|---------|------|---------|
| nginx | 80, 443 | Reverse proxy, SSL, static content |
| queue-manager | 3000 | WebSocket, session management, invites |
| demo-container | 7681 | Claude terminal (ttyd, spawned per session) |
| redis | 6379 | Session state, queue, invite tokens |
| lgtm | 3000, 4317, 4318 | Grafana, Loki, Tempo (LGTM stack) |

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
```

### macOS Keychain

Store Claude token securely:

```bash
security add-generic-password -a "$USER" -s "CLAUDE_CODE_OAUTH_TOKEN" -w "<token>"
```

The Makefile automatically retrieves it.

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

## Testing Strategy

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

## Related Projects

| Project | Path | Purpose |
|---------|------|---------|
| Confluence-Assistant-Skills | `/Users/jasonkrueger/IdeaProjects/Confluence-Assistant-Skills/` | Source plugin |
| jira-demo | `/Users/jasonkrueger/IdeaProjects/jira-demo/` | Reference implementation |

## Common Tasks

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
