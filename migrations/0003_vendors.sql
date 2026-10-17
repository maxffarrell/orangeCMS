CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_path TEXT,
  photo_path TEXT,
  accent_color TEXT DEFAULT '#0C1F4A',
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
