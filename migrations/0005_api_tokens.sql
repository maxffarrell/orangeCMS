-- Bearer tokens for the MCP admin tools, created from /admin/tokens.
-- Only a SHA-256 hash is stored; the token itself is shown once at creation.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  revoked_at DATETIME
);
