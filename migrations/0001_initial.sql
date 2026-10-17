CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE pages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL,
 title TEXT NOT NULL, eyebrow TEXT, subtitle TEXT, content TEXT NOT NULL DEFAULT '',
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE collections (slug TEXT PRIMARY KEY, title TEXT NOT NULL, fields TEXT NOT NULL DEFAULT '[]');
CREATE TABLE entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 collection TEXT NOT NULL REFERENCES collections(slug), slug TEXT NOT NULL,
 title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', image_path TEXT,
 fields TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(collection,slug)
);
CREATE INDEX idx_entries_collection ON entries(collection,active,sort_order);
CREATE TABLE forms (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT,
 file_path TEXT NOT NULL, featured INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE form_schemas (
 form_id INTEGER PRIMARY KEY REFERENCES forms(id), slug TEXT UNIQUE NOT NULL,
 fields TEXT NOT NULL DEFAULT '[]', submit_label TEXT, success_message TEXT,
 accepting INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE form_submissions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, form_id INTEGER NOT NULL REFERENCES forms(id),
 answers TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_form_submissions_form ON form_submissions(form_id,id DESC);
CREATE TABLE api_tokens (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, prefix TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_used_at DATETIME, revoked_at DATETIME
);
CREATE TABLE api_token_grants (token_id INTEGER PRIMARY KEY REFERENCES api_tokens(id), can_write INTEGER NOT NULL DEFAULT 0);
CREATE TABLE mcp_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, token_id INTEGER, tool TEXT NOT NULL,
 target TEXT, changes TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mcp_audit_token_time ON mcp_audit(token_id,created_at);
