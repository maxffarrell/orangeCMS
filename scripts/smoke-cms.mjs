import assert from 'node:assert/strict';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const wranglerBin = new URL(
	'./bin/wrangler.js',
	'file://' + require.resolve('wrangler/package.json'),
).pathname;
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the production worker, never the Vite dev server or a remote database.
const dir = await mkdtemp(join(tmpdir(), 'orangecms-smoke-'));
// Read the same route configuration used by the compiled application. These
// modules are plain configuration and a pure matcher, so no Worker code runs here.
await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
for (const name of ['routing', 'site']) {
	const source = await readFile(`src/lib/${name}.ts`, 'utf8');
	await writeFile(
		join(dir, `${name}.js`),
		ts.transpileModule(source, {
			compilerOptions: {
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.ESNext,
			},
		}).outputText,
	);
}
const { site, pageHref, collectionHref, entryHref, formsHref } = await import(
	pathToFileURL(join(dir, 'site.js')).href
);
const model =
	site.routes.find((route) => route.collection)?.collection ?? 'smoke-records';
const contentPath = collectionHref(model);
const detailPath = (slug) => entryHref(model, slug);
const homePath = pageHref('home');
const formsPath = formsHref();
const formPath = formsHref('smoke-form');
const notificationKey = site.formNotificationSetting;
const editableSetting = site.settingsFields[0]?.key;
const publicSetting = site.settingsFields.find((field) =>
	site.publicSettings.includes(field.key),
)?.key;
const sqlString = (value) => "'" + String(value).replaceAll("'", "''") + "'";
async function homePage() {
	if (homePath) await page(homePath, ['Smoke CMS Home']);
}
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = String(probe.address().port);
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
let worker;
let logs = '';
const teamDomain = 'orangecms-smoke.cloudflareaccess.com';
const issuer = `https://${teamDomain}`;
const audience = 'orangecms-smoke-audience';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const publicJwk = {
	...(await exportJWK(publicKey)),
	kid: 'smoke-key',
	alg: 'RS256',
	use: 'sig',
};
async function token(overrides = {}) {
	return new SignJWT({ email: 'smoke@example.test' })
		.setProtectedHeader({ alg: 'RS256', kid: 'smoke-key' })
		.setSubject('smoke-user')
		.setIssuedAt()
		.setIssuer(overrides.issuer ?? issuer)
		.setAudience(overrides.audience ?? audience)
		.setExpirationTime(overrides.expiration ?? '5m')
		.sign(privateKey);
}
const adminJwt = await token();
async function stopWorker() {
	if (worker && worker.exitCode === null) {
		process.kill(-worker.pid, 'SIGTERM');
		await new Promise((resolve) => worker.once('exit', resolve));
	}
}
async function startWorker(local) {
	logs = '';
	worker = spawn(
		process.execPath,
		[wranglerBin, 'dev', '--local', ...local, '--port', port],
		{ detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
	);
	worker.stdout.on('data', (chunk) => {
		logs += chunk;
	});
	worker.stderr.on('data', (chunk) => {
		logs += chunk;
	});
	worker.on('error', (error) => {
		logs += error.message;
	});
	for (let i = 0; i < 120; i++) {
		if (worker.exitCode !== null) throw new Error(`Worker exited: ${logs}`);
		try {
			await fetch(origin);
			return;
		} catch {
			await delay(500);
		}
	}
	throw new Error(`Worker did not start: ${logs}`);
}
async function wrangler(args) {
	const child = spawn(process.execPath, [wranglerBin, ...args], {
		stdio: 'inherit',
	});
	const code = await new Promise((resolve, reject) => {
		child.on('error', reject);
		child.on('exit', resolve);
	});
	assert.equal(code, 0, `wrangler ${args[0]} failed`);
}
async function d1json(local, sql) {
	const child = spawn(
		process.execPath,
		[
			wranglerBin,
			'd1',
			'execute',
			'DB',
			'--local',
			...local,
			'--json',
			'--command',
			sql,
		],
		{ stdio: ['ignore', 'pipe', 'inherit'] },
	);
	let out = '';
	child.stdout.on('data', (chunk) => {
		out += chunk;
	});
	await new Promise((resolve) => child.on('exit', resolve));
	return JSON.parse(out)[0].results;
}
async function page(path, expected, admin = false) {
	const response = await fetch(origin + path, {
		redirect: 'manual',
		headers: admin ? { 'Cf-Access-Jwt-Assertion': adminJwt } : {},
	});
	assert.equal(
		response.status,
		200,
		`${path}: expected content, got ${response.status}`,
	);
	// Layout data can contain the fixture even when the CMS form is empty.
	// Assert rendered markup, excluding hydration payloads and inline scripts.
	const html = (await response.text()).replace(
		/<script\b[^>]*>[\s\S]*?<\/script>/gi,
		'',
	);
	for (const value of expected)
		assert.ok(html.includes(value), `${path}: missing D1 content ${value}`);
	console.log(`PASS ${path}: seeded content loaded`);
}
try {
	const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
	const canonicalHost = process.env.CMS_SMOKE_CANONICAL_HOST;
	const aliasHosts = (process.env.CMS_SMOKE_ALIAS_HOSTS ?? '')
		.split(',')
		.filter(Boolean);
	// Only the JWKS transport is mocked. The production hook must verify real
	// signatures, issuer, audience, and expiry; there is no auth bypass binding.
	const wrapper = join(dir, 'worker.mjs');
	await writeFile(
		wrapper,
		`
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
  `,
	);
	config.main = wrapper;
	config.assets.directory = resolve('.svelte-kit/cloudflare');
	delete config.build;
	config.vars = {
		CF_ACCESS_TEAM_DOMAIN: teamDomain,
		CF_ACCESS_AUD: audience,
		MCP_ADMIN_TOKEN: 'smoke-mcp-token',
		FORM_EMAIL_FROM: 'forms@smoke.example.test',
		FORM_DATA_KEY: Buffer.alloc(32, 7).toString('base64'),
	};
	const configPath = join(dir, 'wrangler.json');
	await writeFile(configPath, JSON.stringify(config));
	const local = ['--config', configPath, '--persist-to', join(dir, 'state')];
	// Apply the real schema and opt-in starter data explicitly before fixtures.
	// Production migrations themselves never install example content.
	const migrations = await Promise.all(
		(await readdir('migrations'))
			.filter((file) => file.endsWith('.sql'))
			.sort()
			.map((file) => readFile(join('migrations', file), 'utf8')),
	);
	const fixture = join(dir, 'fixture.sql');
	await writeFile(
		fixture,
		migrations.join('\n') +
			'\n' +
			(await readFile('seeds/starter.sql', 'utf8')) +
			'\n' +
			`
    DELETE FROM form_submissions; DELETE FROM form_schemas; DELETE FROM forms; DELETE FROM api_tokens; DELETE FROM entries; DELETE FROM collections;
    DELETE FROM sqlite_sequence WHERE name IN ('forms','api_tokens','form_submissions','entries');
    INSERT OR REPLACE INTO settings(key,value) VALUES (${sqlString(notificationKey)},'smoke-settings@example.test');
    UPDATE pages SET title = 'Smoke CMS Home', content = ${sqlString('Smoke CMS page content from D1' + (publicSetting ? ' {{setting:' + publicSetting + '}}' : ''))} WHERE slug = 'home';
    INSERT INTO collections (slug,title,fields) VALUES (${sqlString(model)},'Smoke CMS Collection','[{"key":"summary","label":"Summary","type":"textarea","required":true},{"key":"resource","label":"Resource","type":"url"},{"key":"priority","label":"Priority","type":"number"},{"key":"reviewed","label":"Reviewed","type":"boolean"}]');
    INSERT INTO entries (collection,slug,title,content,fields,active) VALUES (${sqlString(model)},'smoke-entry','Smoke CMS Entry','Smoke entry detail from D1','{"summary":"Smoke summary","priority":2,"reviewed":false}',1), (${sqlString(model)},'draft-entry','Draft-only marker','Draft content','{"summary":"Draft summary"}',0);
    INSERT INTO forms (title,description,file_path) VALUES ('Smoke CMS Form','Smoke form description from D1','/files/smoke.pdf');
    INSERT INTO form_schemas (form_id,slug,fields,submit_label,success_message) VALUES (1,'smoke-form','[{"key":"request","type":"text","label":"Request","required":true},{"key":"quantity","type":"number","label":"Quantity","required":true},{"key":"name","type":"text","label":"Full name","required":true},{"key":"email","type":"email","label":"Email","required":true},{"key":"phone","type":"tel","label":"Phone","required":true},{"key":"private_date","type":"date","label":"Private date","sensitive":true,"range":"past"},{"key":"include_reference","type":"select","label":"Include private reference?","options":["Yes","No"]},{"key":"private_reference","type":"text","label":"Private reference","sensitive":true,"showIf":{"field":"include_reference","equals":"Yes"}},{"key":"private_category","type":"checkboxes","label":"Private category","sensitive":true,"options":["Example category"]},{"key":"consent_privacy","type":"checkbox","label":"I agree to the privacy policy.","required":true},{"key":"consent","type":"checkbox","label":"I confirm this request.","required":true}]','Submit request','Thank you for your response.');
  `,
	);
	await wrangler([
		'd1',
		'execute',
		'DB',
		'--local',
		...local,
		'--file',
		fixture,
	]);
	await startWorker(local);
	if (homePath)
		await page(homePath, ['Smoke CMS Home', 'Smoke CMS page content from D1']);
	for (const absentPath of (process.env.CMS_SMOKE_ABSENT_PATHS ?? '')
		.split(',')
		.filter(Boolean)) {
		assert.equal(
			(await fetch(origin + absentPath)).status,
			404,
			'Removed route must return 404: ' + absentPath,
		);
	}
	if (contentPath) await page(contentPath, ['Smoke CMS Entry']);
	if (detailPath('smoke-entry'))
		await page(detailPath('smoke-entry'), [
			'Smoke entry detail from D1',
			'Smoke summary',
		]);
	if (detailPath('draft-entry'))
		assert.equal(
			(await fetch(origin + detailPath('draft-entry'))).status,
			404,
			'draft detail must not be public',
		);
	if (contentPath) {
		const listing = await (await fetch(origin + contentPath)).text();
		assert.ok(
			!listing.includes('Draft-only marker'),
			'draft must not appear in public collection',
		);
	}
	assert.equal(
		(await fetch(origin + '/unmapped-content')).status,
		404,
		'unconfigured content paths must not exist',
	);
	if (formsPath) await page(formsPath, ['Smoke CMS Form']);
	if (formPath) {
		// A synthetic interactive form renders, validates, and stores responses.
		if (formsPath) await page(formsPath, ['Smoke CMS Form']);
		await page(formPath, ['Quantity', 'Include private reference?']);
		const post = (body) =>
			fetch(origin + formPath + '?/submit', {
				method: 'POST',
				redirect: 'manual',
				headers: { Origin: origin },
				body: new URLSearchParams(body),
			});
		const invalid = await post({ f_request: 'Smoke request' });
		assert.equal(
			invalid.status,
			400,
			'incomplete form submission must be rejected',
		);
		const missingConsent = await post({
			f_request: 'Smoke request',
			f_quantity: '2',
			f_name: 'Smoke Respondent',
			f_email: 'respondent@example.test',
			f_phone: '555-0100',
			f_consent: 'on',
		});
		assert.equal(
			missingConsent.status,
			400,
			'privacy consent must be required',
		);
		const valid = await post({
			f_request: 'Smoke request',
			f_quantity: '2',
			f_name: 'Smoke Respondent',
			f_email: 'respondent@example.test',
			f_phone: '555-0100',
			f_private_date: '1985-05-08',
			f_include_reference: 'Yes',
			f_private_reference: 'private-marker-123',
			f_private_category: 'Example category',
			f_consent_privacy: 'on',
			f_consent: 'on',
		});
		assert.equal(valid.status, 200, 'valid form submission failed');
		await page('/admin/forms/1/submissions', ['Smoke Respondent'], true);
		// The response must reach the send_email binding as a well-formed message to the admin email.
		await delay(500);
		assert.ok(
			!logs.includes('form email notification failed'),
			'form email notification failed',
		);
		const emlPath = /Email: (\S+\.eml)/.exec(logs)?.[1];
		assert.ok(emlPath, 'expected the send_email binding to be called');
		const eml = await readFile(emlPath, 'utf8');
		assert.ok(
			eml.includes('To: smoke-settings@example.test'),
			'email must go to the configured admin email',
		);
		assert.ok(
			eml.includes('Reply-To: respondent@example.test'),
			'email must reply to the client',
		);
		const emailBody = Buffer.from(
			eml.split(/\r?\n\r?\n/)[1].replace(/\s+/g, ''),
			'base64',
		).toString('utf8');
		assert.ok(
			emailBody.includes('Smoke Respondent') && emailBody.includes('Quantity'),
			'email must contain the answers',
		);
		console.log(
			'PASS form response was emailed to the admin through the send_email binding',
		);
		// Privacy: sensitive answers are never sent by email...
		for (const secret of [
			'private-marker-123',
			'1985-05-08',
			'Example category',
		]) {
			assert.ok(
				!emailBody.includes(secret),
				`sensitive value ${secret} must not be emailed`,
			);
		}
		assert.ok(
			emailBody.includes('withheld'),
			'email should say sensitive details were withheld',
		);
		// ...are encrypted at rest...
		const storedAnswers = (
			await d1json(
				local,
				'SELECT answers FROM form_submissions ORDER BY id DESC LIMIT 1',
			)
		)[0].answers;
		for (const secret of [
			'private-marker-123',
			'1985-05-08',
			'Example category',
		])
			assert.ok(
				!storedAnswers.includes(secret),
				`${secret} must not be stored in plaintext`,
			);
		assert.equal(
			(storedAnswers.match(/enc:v1:/g) ?? []).length,
			3,
			'all three sensitive fields must be encrypted',
		);
		// ...decrypt only for the authenticated admin export...
		const exported = await fetch(
			origin + '/admin/forms/1/submissions/1/export',
			{ headers: { 'Cf-Access-Jwt-Assertion': adminJwt } },
		);
		assert.equal(exported.status, 200);
		const exportText = await exported.text();
		assert.ok(
			exportText.includes('private-marker-123') &&
				exportText.includes('1985-05-08'),
			'admin export must decrypt',
		);
		assert.equal(
			(
				await fetch(origin + '/admin/forms/1/submissions/1/export', {
					redirect: 'manual',
				})
			).status,
			302,
			'export requires Access',
		);
		console.log(
			'PASS sensitive answers are encrypted at rest, withheld from email, and decrypted only for the admin',
		);
		console.log(
			'PASS online form validates, stores a response, and shows it in the CMS',
		);
	} else
		console.log(
			'SKIP interactive form checks: no public form route is configured',
		);
	const postAdmin = async (path, values) =>
		fetch(origin + path, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				Origin: origin,
				Accept: 'text/html',
				'Cf-Access-Jwt-Assertion': adminJwt,
			},
			body: new URLSearchParams(values),
		});
	assert.equal(
		(
			await postAdmin('/admin/collections?/create', {
				slug: 'scratch-notes',
				title: 'Scratch Notes',
			})
		).status,
		303,
	);
	assert.equal(
		(
			await postAdmin('/admin/collections/scratch-notes?/save', {
				title: 'Scratch Notes',
				fields: JSON.stringify([
					{ key: 'score', label: 'Score', type: 'number', required: true },
				]),
			})
		).status,
		200,
	);
	assert.equal(
		(
			await postAdmin('/admin/collections/scratch-notes/entries/new?/save', {
				title: 'First note',
				slug: 'first-note',
				field_score: 'bad',
				active: 'on',
			})
		).status,
		400,
	);
	assert.equal(
		(
			await postAdmin('/admin/collections/scratch-notes/entries/new?/save', {
				title: 'First note',
				slug: 'first-note',
				field_score: '5',
				active: 'on',
			})
		).status,
		303,
	);
	const noteId = (
		await d1json(
			local,
			"SELECT id FROM entries WHERE collection='scratch-notes' AND slug='first-note'",
		)
	)[0].id;
	assert.equal(
		(
			await postAdmin(
				'/admin/collections/scratch-notes/entries/' + noteId + '?/save',
				{
					title: 'Renamed note',
					slug: 'renamed-note',
					field_score: '6',
					active: 'on',
				},
			)
		).status,
		303,
	);
	assert.equal(
		(
			await d1json(
				local,
				"SELECT id FROM entries WHERE collection='scratch-notes' AND slug='renamed-note'",
			)
		)[0].id,
		noteId,
	);
	assert.equal(
		(
			await d1json(
				local,
				"SELECT COUNT(*) AS count FROM entries WHERE collection='scratch-notes' AND slug='first-note'",
			)
		)[0].count,
		0,
	);
	assert.equal(
		(
			await postAdmin(
				'/admin/collections/scratch-notes/entries/' + noteId + '?/delete',
				{},
			)
		).status,
		303,
	);
	assert.equal(
		(await postAdmin('/admin/collections/scratch-notes?/delete', {})).status,
		303,
	);
	assert.equal(
		(
			await postAdmin('/admin/pages?/create', {
				title: 'Temporary page',
				slug: 'temporary-page',
			})
		).status,
		303,
	);
	assert.equal(
		(
			await postAdmin('/admin/pages/temporary-page?/save', {
				title: 'Edited temporary page',
				content: 'Edited content',
			})
		).status,
		200,
	);
	assert.equal(
		(await postAdmin('/admin/pages/temporary-page?/delete', {})).status,
		303,
	);
	console.log(
		'PASS admin collection/schema/entry/page CRUD validates types and preserves IDs on slug changes',
	);
	// MCP endpoint: public tools open, admin tools require the bearer token.
	const rpc = async (method, params, token) => {
		const response = await fetch(origin + '/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
		});
		return { status: response.status, body: await response.json() };
	};
	const init = await rpc('initialize', { protocolVersion: '2025-06-18' });
	assert.equal(init.body.result.protocolVersion, '2025-06-18');
	const names = (await rpc('tools/list')).body.result.tools.map((t) => t.name);
	assert.ok(
		names.includes('list_entries') && !names.includes('save_form'),
		'admin tools must be hidden without a token',
	);
	const entries = await rpc('tools/call', {
		name: 'list_entries',
		arguments: { collection: model },
	});
	assert.ok(entries.body.result.content[0].text.includes('Smoke CMS Entry'));
	assert.ok(!entries.body.result.content[0].text.includes('Draft-only marker'));
	assert.ok(
		(
			await rpc('tools/call', {
				name: 'get_entry',
				arguments: { collection: model, slug: 'draft-entry' },
			})
		).body.result.isError,
		'anonymous MCP must not expose drafts',
	);
	assert.ok(
		(
			await rpc('tools/call', {
				name: 'list_form_submissions',
				arguments: { form: '1' },
			})
		).body.error,
		'admin tool must be rejected without a token',
	);
	assert.equal((await rpc('tools/list', undefined, 'wrong')).status, 401);
	const adminNames = (
		await rpc('tools/list', undefined, 'smoke-mcp-token')
	).body.result.tools.map((t) => t.name);
	assert.ok(
		adminNames.includes('list_form_submissions') &&
			!adminNames.includes('save_form'),
		'the env secret token must be read-only',
	);
	if (formPath) {
		const subs = await rpc(
			'tools/call',
			{ name: 'list_form_submissions', arguments: { form: 'smoke-form' } },
			'smoke-mcp-token',
		);
		assert.ok(subs.body.result.content[0].text.includes('Smoke Respondent'));
		assert.ok(
			!subs.body.result.content[0].text.includes('private-marker-123') &&
				subs.body.result.content[0].text.includes('withheld'),
			'MCP must withhold sensitive answers',
		);
	}
	console.log('PASS MCP endpoint serves public tools and gates admin tools');
	// Tokens created in the admin UI authorize MCP; revoking them disables access.
	const createdToken = await fetch(origin + '/admin/tokens?/create', {
		method: 'POST',
		redirect: 'manual',
		headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': adminJwt },
		body: new URLSearchParams({ name: 'Smoke token' }),
	});
	assert.equal(createdToken.status, 200, 'token creation failed');
	const issued = /[a-z]+_[0-9a-f]{64}/.exec(await createdToken.text())?.[0];
	assert.ok(issued, 'created token must be returned once');
	const roNames = (
		await rpc('tools/list', undefined, issued)
	).body.result.tools.map((t) => t.name);
	assert.ok(
		roNames.includes('list_form_submissions') &&
			!roNames.includes('save_form') &&
			!roNames.includes('save_entry'),
		'tokens are read-only by default',
	);
	assert.ok(
		(
			await rpc(
				'tools/call',
				{ name: 'save_entry', arguments: { title: 'Nope', confirm: true } },
				issued,
			)
		).body.error,
		'read-only token must not edit',
	);
	await page('/admin/tokens', ['Smoke token', issued.slice(0, 11)], true);
	const revoked = await fetch(origin + '/admin/tokens?/revoke', {
		method: 'POST',
		redirect: 'manual',
		headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': adminJwt },
		body: new URLSearchParams({ id: '1' }),
	});
	assert.equal(revoked.status, 200);
	assert.equal(
		(await rpc('tools/list', undefined, issued)).status,
		401,
		'revoked token must be rejected',
	);
	console.log(
		'PASS admin-created tokens authorize MCP and revoking disables them',
	);
	// Edit access: opt-in per token, preview by default, validated, audited.
	const writeIssue = await fetch(origin + '/admin/tokens?/create', {
		method: 'POST',
		redirect: 'manual',
		headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': adminJwt },
		body: new URLSearchParams({ name: 'Smoke editor', can_write: 'on' }),
	});
	const editor = /[a-z]+_[0-9a-f]{64}/.exec(await writeIssue.text())?.[0];
	assert.ok(editor, 'write token must be issued');
	const edit = (args) =>
		rpc(
			'tools/call',
			{
				name: 'save_entry',
				arguments: { collection: model, slug: 'smoke-edit-entry', ...args },
			},
			editor,
		);
	const args = {
		title: 'Smoke Edit Entry',
		fields: { summary: 'Updated custom summary', priority: 3, reviewed: true },
	};
	const dry = JSON.parse((await edit(args)).body.result.content[0].text);
	assert.ok(
		dry.dry_run && dry.applied === false,
		'edits must preview without confirm',
	);
	assert.ok(
		(
			await rpc('tools/call', {
				name: 'get_entry',
				arguments: { collection: model, slug: 'smoke-edit-entry' },
			})
		).body.result.isError,
		'preview must not save',
	);
	assert.ok(
		(await edit({ ...args, image_path: 'javascript:alert(1)', confirm: true }))
			.body.result.isError,
		'unsafe links must be rejected',
	);
	assert.ok(
		(await edit({ title: 'Missing required field', fields: {}, confirm: true }))
			.body.result.isError,
		'required custom fields must be validated',
	);
	assert.ok(
		(
			await edit({
				title: 'Invalid custom type',
				fields: { summary: 'Valid', priority: 'not-a-number' },
				confirm: true,
			})
		).body.result.isError,
		'custom field types must be validated',
	);
	const applied = JSON.parse(
		(await edit({ ...args, confirm: true })).body.result.content[0].text,
	);
	assert.ok(applied.applied, 'confirmed edit must apply');
	assert.ok(
		(
			await rpc('tools/call', {
				name: 'get_entry',
				arguments: { collection: model, slug: 'smoke-edit-entry' },
			})
		).body.result.content[0].text.includes('Updated custom summary'),
	);
	if (detailPath('smoke-edit-entry'))
		await page(detailPath('smoke-edit-entry'), [
			'Smoke Edit Entry',
			'Updated custom summary',
		]);
	await page(
		'/admin/tokens',
		['Recent edits via API', 'Created entry', 'smoke-edit-entry'],
		true,
	);
	console.log('PASS edit tokens preview, validate, apply and audit changes');
	// Alias hosts redirect to the canonical host, preserving path and query (dynamic, not just the homepage).
	const hostGet = (host, path) =>
		new Promise((resolveReq, reject) => {
			http
				.get(
					{ host: '127.0.0.1', port, path, headers: { Host: host } },
					(res) => {
						res.resume();
						resolveReq(res);
					},
				)
				.on('error', reject);
		});
	if (canonicalHost && aliasHosts.length) {
		for (const host of aliasHosts) {
			for (const path of [
				formsPath ?? '/',
				'/admin/forms/1?tab=x',
				'/',
				detailPath('smoke-entry') ?? '/',
			]) {
				const res = await hostGet(host, path);
				assert.equal(res.statusCode, 308, `${host}${path} must redirect`);
				assert.equal(
					res.headers.location,
					`https://${canonicalHost}${path}`,
					`${host}${path} must keep its path and query`,
				);
			}
		}
		assert.equal(
			(await hostGet(canonicalHost, homePath ?? '/')).statusCode,
			200,
			'the canonical host must not redirect',
		);
		console.log(
			'PASS configured alias domains redirect preserving path and query',
		);
	} else {
		assert.equal(
			(await hostGet('unconfigured.example.test', homePath ?? '/')).statusCode,
			200,
			'unconfigured hosts must not redirect',
		);
		console.log('PASS unconfigured domains do not redirect');
	}
	const unauthorized = await fetch(origin + '/admin', { redirect: 'manual' });
	assert.equal(
		unauthorized.status,
		302,
		'CMS must still require the Access header',
	);
	for (const assertion of [
		undefined,
		'local-smoke-fixture',
		await token({ issuer: 'https://wrong.cloudflareaccess.com' }),
		await token({ audience: 'wrong-audience' }),
		await token({ expiration: '0s' }),
	]) {
		for (const path of ['/admin', '/api/upload']) {
			const response = await fetch(origin + path, {
				method: path === '/api/upload' ? 'POST' : 'GET',
				redirect: 'manual',
				headers: {
					Origin: origin,
					...(assertion ? { 'Cf-Access-Jwt-Assertion': assertion } : {}),
				},
			});
			assert.equal(
				response.status,
				path === '/api/upload' ? 401 : 302,
				`${path} must reject invalid or missing Access assertions`,
			);
		}
	}
	console.log(
		'PASS admin and upload reject missing, forged, wrong-issuer, wrong-audience, and expired assertions',
	);
	for (const [path, content] of [
		['/admin/collections', 'Smoke CMS Collection'],
		['/admin/forms', 'Smoke CMS Form'],
		[`/admin/collections/${model}`, 'Smoke CMS Entry'],
		['/admin/pages', 'Smoke CMS Home'],
		['/admin/pages/home', 'Smoke CMS Home'],
		...(editableSetting === notificationKey
			? [['/admin/settings', 'smoke-settings@example.test']]
			: []),
	])
		await page(path, [content], true);
	if (editableSetting) {
		const saved = await fetch(origin + '/admin/settings?/save', {
			method: 'POST',
			redirect: 'manual',
			headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': adminJwt },
			body: new URLSearchParams({
				[editableSetting]: 'smoke-saved@example.test',
				...(publicSetting && publicSetting !== editableSetting
					? { [publicSetting]: 'smoke-public-setting-saved' }
					: {}),
			}),
		});
		assert.equal(saved.status, 200, 'CMS settings save failed');
		await page('/admin/settings', ['smoke-saved@example.test'], true);
		assert.equal(
			(
				await d1json(
					local,
					`SELECT value FROM settings WHERE key = ${sqlString(editableSetting)}`,
				)
			)[0].value,
			'smoke-saved@example.test',
		);
		console.log('PASS CMS save persisted to D1');
		if (homePath && publicSetting) {
			await page(homePath, [
				publicSetting === editableSetting
					? 'smoke-saved@example.test'
					: 'smoke-public-setting-saved',
			]);
			console.log('PASS saved public setting reaches rendered page content');
		}
	}
	await homePage();

	const privacyPath = pageHref('privacy');
	if (privacyPath) {
		const privacyRows = await d1json(
			local,
			"SELECT * FROM pages WHERE slug='privacy'",
		);
		await d1json(local, "DELETE FROM pages WHERE slug='privacy'");
		assert.equal(
			(await fetch(origin + privacyPath)).status,
			404,
			'Configured page with no content must return 404',
		);
		if (privacyRows[0]) {
			const row = privacyRows[0];
			await d1json(
				local,
				`INSERT INTO pages(slug,title,eyebrow,subtitle,content) VALUES('privacy',${sqlString(row.title)},${row.eyebrow === null ? 'NULL' : sqlString(row.eyebrow)},${row.subtitle === null ? 'NULL' : sqlString(row.subtitle)},${sqlString(row.content)})`,
			);
		}
		console.log('PASS missing configured page returns 404');
	}

	const uploadFile = (file, prefix = '') => {
		const body = new FormData();
		if (file !== undefined) body.set('file', file);
		if (prefix) body.set('prefix', prefix);
		return fetch(origin + '/api/upload', {
			method: 'POST',
			headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': adminJwt },
			body,
		});
	};
	for (const [file, prefix, status] of [
		[undefined, '', 400],
		[new File([], 'empty.pdf', { type: 'application/pdf' }), '', 400],
		['not a file', '', 400],
		[new File(['fixture'], 'fixture.pdf', { type: 'text/plain' }), '', 415],
		[
			new File(['fixture'], 'fixture.exe', { type: 'application/pdf' }),
			'',
			415,
		],
		[
			new File(['fixture'], 'fixture.svg', { type: 'image/svg+xml' }),
			'assets/',
			415,
		],
		[
			new File(['fixture'], 'fixture.pdf', { type: 'application/pdf' }),
			'../',
			400,
		],
		[
			new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png', {
				type: 'image/png',
			}),
			'assets/',
			413,
		],
	])
		assert.equal(
			(await uploadFile(file, prefix)).status,
			status,
			'Invalid upload must be rejected',
		);
	const uploaded = await uploadFile(
		new File(['%PDF-1.7\nsmoke fixture'], 'smoke.pdf', {
			type: 'application/pdf',
		}),
	);
	assert.equal(uploaded.status, 200, 'Authenticated CMS upload failed');
	const uploadedPath = (await uploaded.json()).path;
	const stored = await fetch(origin + uploadedPath);
	assert.equal(
		stored.status,
		200,
		'Uploaded file must remain publicly readable',
	);
	assert.equal(stored.headers.get('content-type'), 'application/pdf');
	assert.ok((await stored.text()).includes('smoke fixture'));
	const image = await uploadFile(
		new File(
			[
				Buffer.from(
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY7cAAAAASUVORK5CYII=',
					'base64',
				),
			],
			'pixel.png',
			{ type: 'image/png' },
		),
		'assets/',
	);
	assert.equal(
		image.status,
		200,
		'Images must upload under a generic storage prefix',
	);
	const imageResponse = await fetch(origin + (await image.json()).path);
	assert.equal(imageResponse.headers.get('content-type'), 'image/png');
	assert.match(imageResponse.headers.get('cache-control'), /immutable/);
	assert.equal(
		(await fetch(origin + '/files/missing-smoke-object')).status,
		404,
		'Missing R2 object must return 404',
	);
	console.log(
		'PASS PDF/image uploads persist to local R2 and invalid uploads are rejected',
	);
	await stopWorker();
	delete config.vars.CF_ACCESS_AUD;
	delete config.vars.FORM_DATA_KEY;
	await writeFile(configPath, JSON.stringify(config));
	await startWorker(local);
	for (const path of ['/admin', '/api/upload']) {
		const response = await fetch(origin + path, {
			redirect: 'manual',
			headers: { 'Cf-Access-Jwt-Assertion': adminJwt },
		});
		assert.equal(
			response.status,
			503,
			`${path} must fail closed without Access configuration`,
		);
	}
	if (formPath) {
		const noKeyForm = await (await fetch(origin + formPath)).text();
		assert.ok(
			noKeyForm.includes('Quantity') &&
				!noKeyForm.includes('Private date') &&
				!noKeyForm.includes('Private reference'),
			'without FORM_DATA_KEY the form must not ask for sensitive details',
		);
		console.log(
			'PASS without an encryption key the form does not collect sensitive details',
		);
		const injected = await fetch(origin + formPath + '?/submit', {
			method: 'POST',
			headers: { Origin: origin },
			body: new URLSearchParams({
				f_request: 'No-key request',
				f_quantity: '1',
				f_name: 'No-key Respondent',
				f_email: 'no-key@example.test',
				f_phone: '555-0100',
				f_include_reference: 'Yes',
				f_consent_privacy: 'on',
				f_consent: 'on',
				f_private_date: '1985-05-08',
				f_private_reference: 'injected-sensitive-value',
				f_private_category: 'Example category',
			}),
		});
		assert.equal(
			injected.status,
			200,
			'A no-key form must accept its ordinary fields',
		);
		const noKeyStored = (
			await d1json(
				local,
				'SELECT answers FROM form_submissions ORDER BY id DESC LIMIT 1',
			)
		)[0].answers;
		assert.ok(
			noKeyStored.includes('No-key Respondent'),
			'Ordinary no-key response must be saved',
		);
		for (const marker of [
			'injected-sensitive-value',
			'1985-05-08',
			'Example category',
			'private_reference',
			'private_date',
			'private_category',
		]) {
			assert.ok(
				!noKeyStored.includes(marker),
				'Injected sensitive fields must not reach storage without an encryption key',
			);
		}
		console.log(
			'PASS injected sensitive fields are ignored during no-key POST submission',
		);
	}
	await homePage();
	console.log(
		'PASS missing Access configuration blocks protected routes and leaves public pages available',
	);
} catch (error) {
	console.error(logs);
	throw error;
} finally {
	await stopWorker();
	await rm(dir, { recursive: true, force: true });
}
