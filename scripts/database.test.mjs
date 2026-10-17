import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { serverModules, migratedDatabase } from './test-support/server.mjs';
const cleanup = [];
const { db: cms, privacy } = await serverModules({
	after: (fn) => cleanup.push(fn),
});
after(async () => {
	for (const fn of cleanup) await fn();
});
const model = {
	slug: 'articles',
	title: 'Articles',
	fields: [{ key: 'score', label: 'Score', type: 'number', required: true }],
};
const entry = (collection, slug, active = 1) => ({
	collection,
	slug,
	title: slug,
	content: 'Body',
	image_path: null,
	fields: { score: 0, ignored: 'omitted' },
	sort_order: 0,
	active,
});

test('migrated database persists custom models, isolates collections, hides drafts, and preserves renamed identity', async (t) => {
	const { db } = await migratedDatabase(t);
	await cms.saveCollection(db, model);
	await cms.saveCollection(db, { ...model, slug: 'notes', title: 'Notes' });
	await cms.saveEntry(db, entry('articles', 'shared'));
	await cms.saveEntry(db, entry('notes', 'shared'));
	await cms.saveEntry(db, { ...entry('articles', 'draft', 0), sort_order: -1 });
	assert.equal((await cms.getCollections(db)).length, 2);
	assert.equal(
		(await cms.getCollection(db, 'articles')).fields[0].required,
		true,
	);
	assert.deepEqual(
		(await cms.getEntries(db, 'articles')).map((row) => row.slug),
		['shared'],
	);
	assert.deepEqual(
		(await cms.getEntries(db, 'articles', false)).map((row) => row.slug),
		['draft', 'shared'],
	);
	const saved = await cms.getEntry(db, 'articles', 'shared');
	assert.deepEqual(saved.fields, { score: 0 });
	await cms.saveEntry(db, { ...entry('articles', 'renamed'), id: saved.id });
	assert.equal(await cms.getEntry(db, 'articles', 'shared'), null);
	assert.equal((await cms.getEntry(db, 'articles', 'renamed')).id, saved.id);
	await assert.rejects(
		() => cms.saveEntry(db, { ...entry('notes', 'renamed'), id: saved.id }),
		/Entry not found/,
	);
	await cms.deleteEntry(db, 'notes', saved.id);
	assert.ok(await cms.getEntry(db, 'articles', 'renamed'));
	await cms.deleteCollection(db, 'articles');
	assert.equal(await cms.getCollection(db, 'articles'), null);
	assert.deepEqual(await cms.getEntries(db, 'articles', false), []);
	assert.ok(await cms.getEntry(db, 'notes', 'shared'));
});

test('page upserts, settings, and deleted pages round-trip literal untrusted content through SQLite', async (t) => {
	const { db } = await migratedDatabase(t);
	const page = {
		slug: 'custom',
		title: "A ' title",
		eyebrow: null,
		subtitle: null,
		content: '<script>literal</script>',
	};
	await cms.savePage(db, page);
	const id = (await cms.getPage(db, page.slug)).id;
	await cms.savePage(db, { ...page, title: 'Updated' });
	assert.equal((await cms.getPage(db, page.slug)).id, id);
	await cms.updatePage(db, page.slug, {
		subtitle: 'A subtitle',
		title: 'Final',
	});
	assert.equal((await cms.getPage(db, page.slug)).title, 'Final');
	await cms.updateSettings(db, {
		display_name: "O'Reilly",
		arbitrary_key: 'Configured',
	});
	assert.deepEqual(await cms.getSettings(db), {
		display_name: "O'Reilly",
		arbitrary_key: 'Configured',
	});
	await cms.deletePage(db, page.slug);
	assert.equal(await cms.getPage(db, page.slug), null);
});

test('API tokens store hashes, default to read-only, honor explicit grants, and revoke immediately', async (t) => {
	const { db, sqlite } = await migratedDatabase(t);
	const reader = await cms.createApiToken(db, 'Reader');
	const writer = await cms.createApiToken(db, 'Writer', true);
	assert.notEqual(reader, writer);
	const rows = sqlite.prepare('SELECT * FROM api_tokens ORDER BY id').all();
	for (const [index, token] of [reader, writer].entries()) {
		const hash = Buffer.from(
			await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
		).toString('hex');
		assert.equal(rows[index].token_hash, hash);
		assert.ok(!JSON.stringify(rows[index]).includes(token));
	}
	assert.deepEqual(await cms.verifyApiToken(db, reader), {
		id: rows[0].id,
		canWrite: false,
	});
	assert.deepEqual(await cms.verifyApiToken(db, writer), {
		id: rows[1].id,
		canWrite: true,
	});
	const listed = await cms.listApiTokens(db);
	assert.deepEqual(
		listed.map((row) => row.can_write),
		[1, 0],
	);
	assert.ok(listed.every((row) => !('token_hash' in row)));
	await cms.revokeApiToken(db, rows[1].id);
	assert.equal(await cms.verifyApiToken(db, writer), null);
	assert.ok(await cms.verifyApiToken(db, reader));
	assert.equal(await cms.verifyApiToken(db, 'unknown'), null);
});

test('token authentication updates usage at most hourly and never writes for unknown tokens', async (t) => {
	const { db, sqlite } = await migratedDatabase(t);
	const token = await cms.createApiToken(db, 'Reader');
	let writes = 0;
	const measured = {
		prepare(sql) {
			const statement = db.prepare(sql);
			const run = statement.run;
			statement.run = async () => {
				writes++;
				return run();
			};
			return statement;
		},
	};
	assert.equal(await cms.verifyApiToken(measured, 'unknown'), null);
	assert.equal(writes, 0);
	await cms.verifyApiToken(measured, token);
	assert.equal(writes, 1);
	await cms.verifyApiToken(measured, token);
	assert.equal(writes, 1);
	sqlite.exec(
		"UPDATE api_tokens SET last_used_at = datetime('now', '-2 hours')",
	);
	await cms.verifyApiToken(measured, token);
	assert.equal(writes, 2);
});

const formInput = {
	title: 'Request',
	description: null,
	file_path: '',
	featured: 0,
	sort_order: 0,
	online: {
		slug: 'request',
		fields: [
			{ key: 'message', label: 'Message', type: 'text', required: true },
		],
		submit_label: null,
		success_message: null,
		accepting: 1,
	},
};
test('forms resolve duplicate slugs, keep submissions when taken offline, and delete related data together', async (t) => {
	const { db, sqlite } = await migratedDatabase(t);
	const first = await cms.saveForm(db, formInput);
	const second = await cms.saveForm(db, formInput);
	assert.equal((await cms.getFormBySlug(db, 'request')).form.id, first);
	assert.equal((await cms.getFormBySlug(db, 'request-2')).form.id, second);
	await cms.addSubmission(db, first, [
		{ key: 'message', label: 'Message', value: 'Hello' },
	]);
	const submission = (await cms.getSubmissions(db, first))[0];
	assert.equal(submission.answers[0].value, 'Hello');
	assert.equal((await cms.getForms(db))[0].unread_count, 1);
	await cms.setSubmissionRead(db, submission.id, true);
	assert.equal((await cms.getForms(db))[0].unread_count, 0);
	await cms.saveForm(db, { ...formInput, id: first, online: null });
	assert.equal(await cms.getFormBySlug(db, 'request'), null);
	assert.equal((await cms.getSubmissions(db, first)).length, 1);
	await cms.deleteForm(db, first);
	assert.equal(await cms.getFormById(db, first), null);
	assert.equal(
		sqlite.prepare('SELECT COUNT(*) AS count FROM form_submissions').get()
			.count,
		0,
	);
	assert.ok(await cms.getFormById(db, second));
});

test('retention defaults safely, enforces its lower bound, and purges only expired responses', async (t) => {
	const { db, sqlite } = await migratedDatabase(t);
	assert.equal(await privacy.getRetentionDays(db), 365);
	assert.equal(await privacy.setRetentionDays(db, 1), 30);
	assert.equal(await privacy.getRetentionDays(db), 30);
	const id = await cms.saveForm(db, formInput);
	await cms.addSubmission(db, id, []);
	await cms.addSubmission(db, id, []);
	sqlite.exec(
		"UPDATE form_submissions SET created_at = datetime('now', '-31 days') WHERE id = 1",
	);
	assert.equal(await privacy.purgeExpiredSubmissions(db), 1);
	assert.equal((await cms.getSubmissions(db, id)).length, 1);
	await cms.updateSettings(db, { submission_retention_days: 'invalid' });
	assert.equal(await privacy.getRetentionDays(db), 365);
});
