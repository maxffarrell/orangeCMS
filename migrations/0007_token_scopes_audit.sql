-- Token write grants + audit log for MCP edits. Safe to re-run.
--  * api_token_grants: a token can edit content only if it has a row with can_write = 1.
--    Tokens without a row (everything created before this migration) stay read-only.
--  * mcp_audit: one row per applied MCP edit (kept to the newest 500 rows by the app,
--    so storage and D1 writes stay far inside the free tier).

CREATE TABLE IF NOT EXISTS api_token_grants (
  token_id INTEGER PRIMARY KEY,
  can_write INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mcp_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id INTEGER,
  tool TEXT NOT NULL,
  target TEXT,
  changes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_token_time ON mcp_audit (token_id, created_at);
