ALTER TABLE mcp_audit ADD COLUMN actor_key TEXT;
CREATE INDEX idx_mcp_audit_actor_time ON mcp_audit(actor_key, created_at);
