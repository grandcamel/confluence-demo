/**
 * Configuration constants for the queue manager.
 */

module.exports = {
  // Server
  PORT: process.env.PORT || 3000,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Session
  SESSION_TIMEOUT_MINUTES: parseInt(process.env.SESSION_TIMEOUT_MINUTES, 10) || 60,
  MAX_QUEUE_SIZE: parseInt(process.env.MAX_QUEUE_SIZE, 10) || 10,
  AVERAGE_SESSION_MINUTES: 45,
  TTYD_PORT: 7681,
  DISCONNECT_GRACE_MS: 10000,
  AUDIT_RETENTION_DAYS: 30,
  SESSION_SECRET: process.env.SESSION_SECRET || 'change-me-in-production',

  // Session environment files (for secure credential passing)
  SESSION_ENV_HOST_PATH: process.env.SESSION_ENV_HOST_PATH || '/tmp/session-env',
  SESSION_ENV_CONTAINER_PATH: '/run/session-env',

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 60 * 1000,  // 1 minute window
  RATE_LIMIT_MAX_CONNECTIONS: 10,    // Max connections per IP per window

  // Invite brute-force protection
  INVITE_RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000,  // 1 hour window
  INVITE_RATE_LIMIT_MAX_ATTEMPTS: 10,            // Max failed attempts per IP per hour

  // Claude authentication
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

  // Base URL and allowed origins
  BASE_URL: process.env.BASE_URL || 'http://localhost:8080',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || process.env.BASE_URL || 'http://localhost:8080').split(',').map(o => o.trim()),
  COOKIE_SECURE: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',

  // Confluence
  CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN || '',
  CONFLUENCE_EMAIL: process.env.CONFLUENCE_EMAIL || '',
  CONFLUENCE_SITE_URL: process.env.CONFLUENCE_SITE_URL || '',

  // Scenarios
  SCENARIOS_PATH: '/opt/demo-container/scenarios',
  SCENARIO_NAMES: {
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
  }
};
