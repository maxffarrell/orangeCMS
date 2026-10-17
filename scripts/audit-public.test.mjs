import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
const script = fileURLToPath(new URL('./audit-public.mjs', import.meta.url));
function fixture(run) {
 const cwd = mkdtempSync(join(tmpdir(), 'publication-audit-'));
 const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
 const add = (path, value) => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), value); git('add', '--force', '--', path); };
 const audit = (patterns = '') => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', env: { ...process.env, CMS_FORBIDDEN_PATTERNS: patterns } });
 try { git('init', '--quiet'); run({ add, audit, cwd }); } finally { rmSync(cwd, { recursive: true, force: true }); }
}
test('clean source passes and untracked local secrets are excluded', () => fixture(({ add, audit, cwd }) => {
 add('src/index.ts', 'export const name = "Example";');
 writeFileSync(join(cwd, '.env'), 'LOCAL_SECRET=private');
 assert.equal(audit().status, 0);
}));
test('staged secrets are rejected even after being removed from working source', () => fixture(({ add, audit, cwd }) => {
 add('src/index.ts', 'ghp_' + 'A'.repeat(36));
 writeFileSync(join(cwd, 'src/index.ts'), 'clean now');
 assert.equal(audit().status, 1);
 assert.match(audit().stderr, /possible GitHub token \(index\)/);
}));
test('runtime files, binary content and customer assets are rejected', () => fixture(({ add, audit }) => {
 add('.env', 'EXAMPLE=value'); add('src/blob', Buffer.from([0, 255, 1])); add('static/photo.svg', '<svg/>');
 const result = audit(); assert.equal(result.status, 1);
 assert.match(result.stderr, /local runtime/); assert.match(result.stderr, /binary/); assert.match(result.stderr, /site asset/);
}));
test('configured site content is matched without exposing the matching value', () => fixture(({ add, audit }) => {
 add('src/index.ts', 'Customer Example Organization');
 const result = audit('example organization'); assert.equal(result.status, 1);
 assert.match(result.stderr, /forbidden site content/); assert.ok(!result.stderr.includes('example organization'));
}));
test('generic favicon is permitted and an empty index fails closed', () => fixture(({ add, audit }) => {
 assert.equal(audit().status, 1); add('static/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'); assert.equal(audit().status, 0);
}));

test('published customer snapshots are rejected even when force-staged', () => fixture(({ add, audit }) => {
 add('site/published/assets/index.html', '<h1>Customer content</h1>');
 add('other-output/manifest.json', JSON.stringify({format:'orangecms-static-v1',files:[]}));
 const result=audit(); assert.equal(result.status,1); assert.match(result.stderr,/local runtime/); assert.match(result.stderr,/snapshot must remain private/);
}));
