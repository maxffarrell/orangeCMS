import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

const migrationDir = new URL("../migrations/", import.meta.url);
const migrationNames = (await readdir(migrationDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrations = await Promise.all(
  migrationNames.map((name) => readFile(new URL(name, migrationDir), "utf8")),
);
const starter = await readFile(
  new URL("../seeds/starter.sql", import.meta.url),
  "utf8",
);

function database(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) db.exec(migration);
  return db;
}

function snapshot(db) {
  return Object.fromEntries(
    db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => [
        name,
        db
          .prepare(
            `SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`,
          )
          .all(),
      ]),
  );
}

test("fresh migrations create a complete CMS with no installed content or identity", (t) => {
  const db = database(t);
  assert.deepEqual(Object.keys(snapshot(db)), [
    "api_token_grants",
    "api_tokens",
    "collections",
    "entries",
    "form_schemas",
    "form_submissions",
    "forms",
    "mcp_audit",
    "pages",
    "settings",
  ]);
  for (const [table, rows] of Object.entries(snapshot(db))) {
    assert.equal(rows.length, 0, `${table} must start empty`);
  }
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
});

test("empty schema supports administrator-created pages, collections, fields, and entries", (t) => {
  const db = database(t);
  db.prepare("INSERT INTO pages (slug,title,content) VALUES (?,?,?)").run(
    "start",
    "My page",
    "My content",
  );
  db.prepare("INSERT INTO collections (slug,title,fields) VALUES (?,?,?)").run(
    "documents",
    "Documents",
    '[{"key":"revision","type":"number"}]',
  );
  db.prepare(
    "INSERT INTO entries (collection,slug,title,fields) VALUES (?,?,?,?)",
  ).run("documents", "handbook", "Handbook", '{"revision":3}');
  assert.equal(
    db.prepare("SELECT content FROM pages WHERE slug = ?").get("start").content,
    "My content",
  );
  assert.equal(
    JSON.parse(
      db.prepare("SELECT fields FROM entries WHERE slug = ?").get("handbook")
        .fields,
    ).revision,
    3,
  );
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO entries (collection,slug,title) VALUES (?,?,?)")
        .run("missing", "invalid", "Invalid"),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO pages (slug,title) VALUES (?,?)")
        .run("start", "Duplicate"),
    /UNIQUE/,
  );
});

test("optional starter content is idempotent and preserves existing customized pages and settings", (t) => {
  const db = database(t);
  db.exec(starter);
  assert.deepEqual(
    db
      .prepare("SELECT slug FROM pages ORDER BY slug")
      .all()
      .map((row) => row.slug),
    ["home", "privacy"],
  );
  assert.equal(
    db
      .prepare(
        "SELECT value FROM settings WHERE key = 'submission_retention_days'",
      )
      .get().value,
    "365",
  );
  const initial = snapshot(db);
  db.exec(starter);
  assert.deepEqual(snapshot(db), initial);
  db.prepare("UPDATE pages SET title = ?, content = ? WHERE slug = ?").run(
    "Personal title",
    "Personal content",
    "home",
  );
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(
    "90",
    "submission_retention_days",
  );
  db.prepare("INSERT INTO collections (slug,title) VALUES (?,?)").run(
    "custom",
    "Custom collection",
  );
  const customized = snapshot(db);
  db.exec(starter);
  assert.deepEqual(snapshot(db), customized);
});
