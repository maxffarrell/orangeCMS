import assert from 'node:assert/strict';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const wranglerBin = new URL('./bin/wrangler.js', 'file://' + require.resolve('wrangler/package.json')).pathname;
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the production worker, never the Vite dev server or a remote database.
const dir = await mkdtemp(join(tmpdir(), 'orangecms-smoke-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = String(probe.address().port);
await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
let worker;
let logs = '';
const teamDomain = 'orangecms-smoke.cloudflareaccess.com';
const issuer = `https://${teamDomain}`;
const audience = 'orangecms-smoke-audience';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const publicJwk = { ...await exportJWK(publicKey), kid: 'smoke-key', alg: 'RS256', use: 'sig' };
async function token(overrides = {}) {
  return new SignJWT({ email: 'smoke@example.test' })
    .setProtectedHeader({ alg: 'RS256', kid: 'smoke-key' })
    .setSubject('smoke-user').setIssuedAt()
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? audience)
    .setExpirationTime(overrides.expiration ?? '5m').sign(privateKey);
}
const adminJwt = await token();
async function stopWorker() {
  if (worker && worker.exitCode === null) {
    process.kill(-worker.pid, 'SIGTERM');
    await new Promise(resolve => worker.once('exit', resolve));
  }
}
async function startWorker(local) {
  logs = '';
  worker = spawn(process.execPath, [wranglerBin, 'dev', '--local', ...local, '--port', port], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  worker.stdout.on('data', chunk => { logs += chunk; });
  worker.stderr.on('data', chunk => { logs += chunk; });
  worker.on('error', error => { logs += error.message; });
  for (let i = 0; i < 120; i++) {
    if (worker.exitCode !== null) throw new Error(`Worker exited: ${logs}`);
    try { await fetch(origin); return; } catch { await delay(500); }
  }
  throw new Error(`Worker did not start: ${logs}`);
}
async function wrangler(args) {
  const child = spawn(process.execPath, [wranglerBin, ...args], { stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  assert.equal(code, 0, `wrangler ${args[0]} failed`);
}
async function d1json(local, sql) {
  const child = spawn(process.execPath, [wranglerBin, 'd1', 'execute', 'DB', '--local', ...local, '--json', '--command', sql], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  await new Promise(resolve => child.on('exit', resolve));
  return JSON.parse(out)[0].results;
}
async function page(path, expected, admin = false) {
  const response = await fetch(origin + path, {
    redirect: 'manual',
    headers: admin ? { 'Cf-Access-Jwt-Assertion': adminJwt } : {}
  });
  assert.equal(response.status, 200, `${path}: expected content, got ${response.status}`);
  // Layout data can contain the fixture even when the CMS form is empty.
  // Assert rendered markup, excluding hydration payloads and inline scripts.
  const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const value of expected) assert.ok(html.includes(value), `${path}: missing D1 content ${value}`);
  console.log(`PASS ${path}: seeded content loaded`);
}
try {
  const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  const canonicalHost = process.env.CMS_SMOKE_CANONICAL_HOST;
  const aliasHosts = (process.env.CMS_SMOKE_ALIAS_HOSTS ?? '').split(',').filter(Boolean);
  // Only the JWKS transport is mocked. The production hook must verify real
  // signatures, issuer, audience, and expiry; there is no auth bypass binding.
  const wrapper = join(dir, 'worker.mjs');
  await writeFile(wrapper, `
    import worker from ${JSON.stringify(resolve('.svelte-kit/cloudflare/_worker.js'))};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url ?? input.href;
      if (url === ${JSON.stringify(`${issuer}/cdn-cgi/access/certs`)}) {
        return Promise.resolve(Response.json(${JSON.stringify({ keys: [publicJwk] })}));
      }
      return originalFetch(input, init);
    };
    export default worker;
  `);
  config.main = wrapper;
  config.assets.directory = resolve('.svelte-kit/cloudflare');
  delete config.build;
  config.vars = { CF_ACCESS_TEAM_DOMAIN: teamDomain, CF_ACCESS_AUD: audience, MCP_ADMIN_TOKEN: 'smoke-mcp-token', FORM_EMAIL_FROM: 'forms@smoke.example.test', FORM_DATA_KEY: Buffer.alloc(32, 7).toString('base64') };
  const configPath = join(dir, 'wrangler.json');
  await writeFile(configPath, JSON.stringify(config));
  const local = ['--config', configPath, '--persist-to', join(dir, 'state')];
  // One D1 invocation applies the real migrations and fixture together, avoiding
  // four separate Wrangler/workerd startups without reducing coverage.
  const migrations = await Promise.all(
    ['migrations/0001_initial.sql', 'migrations/0002_seed.sql', 'migrations/0003_vendors.sql', 'migrations/0004_interactive_forms.sql', 'migrations/0005_api_tokens.sql', 'migrations/0006_privacy.sql', 'migrations/0007_token_scopes_audit.sql']
      .map(file => readFile(file, 'utf8'))
  );
  const fixture = join(dir, 'fixture.sql');
  await writeFile(fixture, migrations.join('\n') + '\n' + `
    DELETE FROM form_submissions; DELETE FROM form_schemas; DELETE FROM forms; DELETE FROM api_tokens; DELETE FROM tours; DELETE FROM vendors;
    DELETE FROM sqlite_sequence WHERE name IN ('forms','api_tokens','form_submissions','tours','vendors');
    UPDATE settings SET value = 'smoke-settings@example.test' WHERE key = 'email';
    UPDATE pages SET title = 'Smoke CMS About', content = 'Smoke CMS page content from D1' WHERE slug = 'about';
    INSERT INTO tours (slug,title,content,active) VALUES ('smoke-tour','Smoke CMS Tour','Smoke tour detail from D1',1);
    INSERT INTO forms (title,description,file_path) VALUES ('Smoke CMS Form','Smoke form description from D1','/files/smoke.pdf');
    INSERT INTO form_schemas (form_id,slug,fields,submit_label,success_message) VALUES (1,'smoke-form','[{"key":"request","type":"text","label":"Request","required":true},{"key":"attendee_count","type":"number","label":"Number of attendees","required":true},{"key":"name","type":"text","label":"Full name","required":true},{"key":"email","type":"email","label":"Email","required":true},{"key":"phone","type":"tel","label":"Phone","required":true},{"key":"private_date","type":"date","label":"Private date","sensitive":true,"range":"past"},{"key":"include_reference","type":"select","label":"Include private reference?","options":["Yes","No"]},{"key":"private_reference","type":"text","label":"Private reference","sensitive":true,"showIf":{"field":"include_reference","equals":"Yes"}},{"key":"private_category","type":"checkboxes","label":"Private category","sensitive":true,"options":["Example category"]},{"key":"consent_privacy","type":"checkbox","label":"I agree to the privacy policy.","required":true},{"key":"consent","type":"checkbox","label":"I confirm this request.","required":true}]','Submit request','Thank you for your response.');
    INSERT INTO vendors (slug,name,description,active) VALUES ('smoke-vendor','Smoke CMS Vendor','Smoke vendor description from D1',1);
  `);
  await wrangler(['d1', 'execute', 'DB', '--local', ...local, '--file', fixture]);
  await startWorker(local);
  await page('/', ['Smoke CMS Tour', 'smoke-settings@example.test']);
  await page('/about', ['Smoke CMS page content from D1']);
  await page('/tours', ['Smoke CMS Tour']);
  await page('/tours/smoke-tour', ['Smoke tour detail from D1']);
  await page('/forms', ['Smoke CMS Form']);
  await page('/vendors', ['Smoke CMS Vendor']);
  // A synthetic interactive form renders, validates, and stores responses.
  await page('/forms', ['Smoke CMS Form']);
  await page('/forms/smoke-form', ['Number of attendees', 'Include private reference?']);
  const post = (body) => fetch(origin + '/forms/smoke-form?/submit', {
    method: 'POST', redirect: 'manual', headers: { Origin: origin }, body: new URLSearchParams(body)
  });
  const invalid = await post({ f_request: 'Smoke request' });
  assert.equal(invalid.status, 400, 'incomplete form submission must be rejected');
  const missingConsent = await post({
    f_request: 'Smoke request', f_attendee_count: '2', f_name: 'Smoke Respondent',
    f_email: 'respondent@example.test', f_phone: '555-0100', f_consent: 'on'
  });
  assert.equal(missingConsent.status, 400, 'privacy consent must be required');
  const valid = await post({
    f_request: 'Smoke request', f_attendee_count: '2', f_name: 'Smoke Respondent',
    f_email: 'respondent@example.test', f_phone: '555-0100', f_private_date: '1985-05-08',
    f_include_reference: 'Yes', f_private_reference: 'X1234567', f_private_category: 'Example category',
    f_consent_privacy: 'on', f_consent: 'on'
  });
  assert.equal(valid.status, 200, 'valid form submission failed');
  await page('/admin/forms/1/submissions', ['Smoke Respondent'], true);
  // The response must reach the send_email binding as a well-formed message to the admin email.
  await delay(500);
  assert.ok(!logs.includes('form email notification failed'), 'form email notification failed');
  const emlPath = /Email: (\S+\.eml)/.exec(logs)?.[1];
  assert.ok(emlPath, 'expected the send_email binding to be called');
  const eml = await readFile(emlPath, 'utf8');
  assert.ok(eml.includes('To: smoke-settings@example.test'), 'email must go to the configured admin email');
  assert.ok(eml.includes('Reply-To: respondent@example.test'), 'email must reply to the client');
  const emailBody = Buffer.from(eml.split(/\r?\n\r?\n/)[1].replace(/\s+/g, ''), 'base64').toString('utf8');
  assert.ok(emailBody.includes('Smoke Respondent') && emailBody.includes('Number of attendees'), 'email must contain the answers');
  console.log('PASS form response was emailed to the admin through the send_email binding');
  // Privacy: sensitive answers never travel by email...
  for (const secret of ['X1234567', '1985-05-08', 'Example category']) {
    assert.ok(!emailBody.includes(secret), `sensitive value ${secret} must not be emailed`);
  }
  assert.ok(emailBody.includes('withheld'), 'email should say sensitive details were withheld');
  // ...are encrypted at rest...
  const storedAnswers = (await d1json(local, 'SELECT answers FROM form_submissions ORDER BY id DESC LIMIT 1'))[0].answers;
  for (const secret of ['X1234567', '1985-05-08', 'Example category']) assert.ok(!storedAnswers.includes(secret), `${secret} must not be stored in plaintext`);
  assert.equal((storedAnswers.match(/enc:v1:/g) ?? []).length, 3, 'all three sensitive fields must be encrypted');
  // ...decrypt only for the authenticated admin export...
  const exported = await fetch(origin + '/admin/forms/1/submissions/1/export', { headers: { 'Cf-Access-Jwt-Assertion': adminJwt } });
  assert.equal(exported.status, 200);
  const exportText = await exported.text();
  assert.ok(exportText.includes('X1234567') && exportText.includes('1985-05-08'), 'admin export must decrypt');
  assert.equal((await fetch(origin + '/admin/forms/1/submissions/1/export', { redirect: 'manual' })).status, 302, 'export requires Access');
  console.log('PASS sensitive answers are encrypted at rest, withheld from email, and decrypted only for the admin');
  console.log('PASS online form validates, stores a response, and shows it in the CMS');
  // MCP endpoint: public tools open, admin tools require the bearer token.
  const rpc = async (method, params, token) => {
    const response = await fetch(origin + '/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    return { status: response.status, body: await response.json() };
  };
  const init = await rpc('initialize', { protocolVersion: '2025-06-18' });
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  const names = (await rpc('tools/list')).body.result.tools.map(t => t.name);
  assert.ok(names.includes('list_tours') && !names.includes('save_form'), 'admin tools must be hidden without a token');
  const tours = await rpc('tools/call', { name: 'list_tours', arguments: {} });
  assert.ok(tours.body.result.content[0].text.includes('Smoke CMS Tour'));
  assert.ok((await rpc('tools/call', { name: 'list_form_submissions', arguments: { form: '1' } })).body.error, 'admin tool must be rejected without a token');
  assert.equal((await rpc('tools/list', undefined, 'wrong')).status, 401);
  const adminNames = (await rpc('tools/list', undefined, 'smoke-mcp-token')).body.result.tools.map(t => t.name);
  assert.ok(adminNames.includes('list_form_submissions') && !adminNames.includes('save_form'), 'the env secret token must be read-only');
  const subs = await rpc('tools/call', { name: 'list_form_submissions', arguments: { form: 'smoke-form' } }, 'smoke-mcp-token');
  assert.ok(subs.body.result.content[0].text.includes('Smoke Respondent'));
  assert.ok(!subs.body.result.content[0].text.includes('X1234567') && subs.body.result.content[0].text.includes('withheld'), 'MCP must withhold sensitive answers');
  console.log('PASS MCP endpoint serves public tools and gates admin tools');
  // Tokens created in the admin UI authorize MCP; revoking them disables access.
  const createdToken = await fetch(origin + '/admin/tokens?/create', {
    method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': adminJwt },
    body: new URLSearchParams({ name: 'Smoke token' })
  });
  assert.equal(createdToken.status, 200, 'token creation failed');
  const issued = /[a-z]+_[0-9a-f]{64}/.exec(await createdToken.text())?.[0];
  assert.ok(issued, 'created token must be returned once');
  const roNames = (await rpc('tools/list', undefined, issued)).body.result.tools.map(t => t.name);
  assert.ok(roNames.includes('list_form_submissions') && !roNames.includes('save_form') && !roNames.includes('save_tour'), 'tokens are read-only by default');
  assert.ok((await rpc('tools/call', { name: 'save_tour', arguments: { title: 'Nope', confirm: true } }, issued)).body.error, 'read-only token must not edit');
  await page('/admin/tokens', ['Smoke token', issued.slice(0, 11)], true);
  const revoked = await fetch(origin + '/admin/tokens?/revoke', {
    method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': adminJwt }, body: new URLSearchParams({ id: '1' })
  });
  assert.equal(revoked.status, 200);
  assert.equal((await rpc('tools/list', undefined, issued)).status, 401, 'revoked token must be rejected');
  console.log('PASS admin-created tokens authorize MCP and revoking disables them');
  // Edit access: opt-in per token, preview by default, validated, audited.
  const writeIssue = await fetch(origin + '/admin/tokens?/create', {
    method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': adminJwt },
    body: new URLSearchParams({ name: 'Smoke editor', can_write: 'on' })
  });
  const editor = /[a-z]+_[0-9a-f]{64}/.exec(await writeIssue.text())?.[0];
  assert.ok(editor, 'write token must be issued');
  const edit = (args) => rpc('tools/call', { name: 'save_tour', arguments: args }, editor);
  const dry = JSON.parse((await edit({ title: 'Smoke Edit Tour', dates: 'June 2027' })).body.result.content[0].text);
  assert.ok(dry.dry_run && dry.applied === false, 'edits must preview without confirm');
  assert.ok(!(await rpc('tools/call', { name: 'get_tour', arguments: { slug: 'smoke-edit-tour' } })).body.result.content[0].text.includes('June 2027'), 'preview must not save');
  assert.ok((await edit({ title: 'Smoke Edit Tour', booking_url: 'javascript:alert(1)', confirm: true })).body.result.isError, 'unsafe links must be rejected');
  const applied = JSON.parse((await edit({ title: 'Smoke Edit Tour', dates: 'June 2027', confirm: true })).body.result.content[0].text);
  assert.ok(applied.applied, 'confirmed edit must apply');
  assert.ok((await rpc('tools/call', { name: 'get_tour', arguments: { slug: 'smoke-edit-tour' } })).body.result.content[0].text.includes('June 2027'));
  await page('/admin/tokens', ['Recent edits via API', 'Created tour', 'smoke-edit-tour'], true);
  console.log('PASS edit tokens preview, validate, apply and audit changes');
  // Alias hosts redirect to the canonical host, preserving path and query (dynamic, not just the homepage).
  const hostGet = (host, path) => new Promise((resolveReq, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers: { Host: host } }, res => { res.resume(); resolveReq(res); }).on('error', reject);
  });
  if (canonicalHost && aliasHosts.length) {
    for (const host of aliasHosts) {
      for (const path of ['/forms', '/admin/forms/1?tab=x', '/', '/tours/smoke-tour']) {
        const res = await hostGet(host, path);
        assert.equal(res.statusCode, 308, `${host}${path} must redirect`);
        assert.equal(res.headers.location, `https://${canonicalHost}${path}`, `${host}${path} must keep its path and query`);
      }
    }
    assert.equal((await hostGet(canonicalHost, '/forms')).statusCode, 200, 'the canonical host must not redirect');
    console.log('PASS configured alias domains redirect preserving path and query');
  } else {
    assert.equal((await hostGet('unconfigured.example.test', '/forms')).statusCode, 200, 'unconfigured hosts must not redirect');
    console.log('PASS unconfigured domains do not redirect');
  }
  const unauthorized = await fetch(origin + '/admin', { redirect: 'manual' });
  assert.equal(unauthorized.status, 302, 'CMS must still require the Access header');
  for (const assertion of [undefined, 'local-smoke-fixture',
    await token({ issuer: 'https://wrong.cloudflareaccess.com' }),
    await token({ audience: 'wrong-audience' }), await token({ expiration: '0s' })]) {
    for (const path of ['/admin', '/api/upload']) {
      const response = await fetch(origin + path, {
        method: path === '/api/upload' ? 'POST' : 'GET', redirect: 'manual',
        headers: { Origin: origin, ...(assertion ? { 'Cf-Access-Jwt-Assertion': assertion } : {}) }
      });
      assert.equal(response.status, path === '/api/upload' ? 401 : 302,
        `${path} must reject invalid or missing Access assertions`);
    }
  }
  console.log('PASS admin and upload reject missing, forged, wrong-issuer, wrong-audience, and expired assertions');
  for (const [path, content] of [
    ['/admin/tours', 'Smoke CMS Tour'], ['/admin/forms', 'Smoke CMS Form'],
    ['/admin/vendors', 'Smoke CMS Vendor'], ['/admin/pages', 'Smoke CMS About'],
    ['/admin/pages/about', 'Smoke CMS About'],
    ['/admin/settings', 'smoke-settings@example.test']
  ]) await page(path, [content], true);
  const saved = await fetch(origin + '/admin/settings?/save', {
    method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': adminJwt },
    body: new URLSearchParams({ email: 'smoke-saved@example.test' })
  });
  assert.equal(saved.status, 200, 'CMS settings save failed');
  await page('/admin/settings', ['smoke-saved@example.test'], true);
  await page('/', ['smoke-saved@example.test']);
  console.log('PASS CMS save persisted to D1 and reached the public site');
  const upload = new FormData();
  upload.set('file', new File(['%PDF-1.7\nsmoke fixture'], 'smoke.pdf', { type: 'application/pdf' }));
  const uploaded = await fetch(origin + '/api/upload', {
    method: 'POST', headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': adminJwt }, body: upload
  });
  assert.equal(uploaded.status, 200, 'Authenticated CMS upload failed');
  const uploadedPath = (await uploaded.json()).path;
  const stored = await fetch(origin + uploadedPath);
  assert.equal(stored.status, 200, 'Uploaded file must remain publicly readable');
  assert.ok((await stored.text()).includes('smoke fixture'));
  console.log('PASS authenticated upload persists to local R2');
  await stopWorker();
  delete config.vars.CF_ACCESS_AUD;
  delete config.vars.FORM_DATA_KEY;
  await writeFile(configPath, JSON.stringify(config));
  await startWorker(local);
  for (const path of ['/admin', '/api/upload']) {
    const response = await fetch(origin + path, {
      redirect: 'manual', headers: { 'Cf-Access-Jwt-Assertion': adminJwt }
    });
    assert.equal(response.status, 503, `${path} must fail closed without Access configuration`);
  }
  const noKeyForm = await (await fetch(origin + '/forms/smoke-form')).text();
  assert.ok(noKeyForm.includes('Number of attendees') && !noKeyForm.includes('Private date') && !noKeyForm.includes('Private reference'),
    'without FORM_DATA_KEY the form must not ask for sensitive details');
  console.log('PASS without an encryption key the form does not collect sensitive details');
  await page('/', ['smoke-saved@example.test']);
  console.log('PASS missing Access configuration blocks protected routes and leaves public pages available');
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await stopWorker();
  await rm(dir, { recursive: true, force: true });
}
