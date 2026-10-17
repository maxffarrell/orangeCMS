-- Interactive forms: admin-defined fields rendered on the public site,
-- plus a store for submissions. A form is "online" when it has a form_schemas row;
-- forms without one remain downloadable PDFs. Safe to re-run.

CREATE TABLE IF NOT EXISTS form_schemas (
  form_id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  fields TEXT NOT NULL DEFAULT '[]',
  submit_label TEXT,
  success_message TEXT,
  accepting INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL,
  answers TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions (form_id, id DESC);
