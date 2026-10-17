import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Compile the actual database module and its local dependencies for Node's test runner.
const temp = await mkdtemp(join(tmpdir(), 'orangecms-content-test-'));
after(() => rm(temp, { recursive: true, force: true }));
await mkdir(join(temp, 'src/lib/server'), { recursive: true });
await writeFile(
	join(temp, 'package.json'),
	JSON.stringify({ type: 'module', imports: { '#lib/*': './src/lib/*' } }),
);
for (const file of ['server/db', 'server/limits', 'forms', 'site', 'routing']) {
	const source = await readFile(
		new URL(`../src/lib/${file}.ts`, import.meta.url),
		'utf8',
	);
	const compiled = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.ESNext,
			target: ts.ScriptTarget.ES2022,
		},
	}).outputText;
	await writeFile(join(temp, `src/lib/${file}.js`), compiled);
}
const {
	validateContentFields,
	validateEntryInput,
	updatePage,
	getEntries,
	saveEntry,
	mcpWritesLastHour,
	recordAudit,
} = await import(pathToFileURL(join(temp, 'src/lib/server/db.js')).href);
const schema = {
	slug: 'articles',
	title: 'Articles',
	fields: validateContentFields([
		{ key: 'featured', label: 'Featured', type: 'boolean', required: true },
		{ key: 'score', label: 'Score', type: 'number', required: true },
		{ key: 'link', label: 'Link', type: 'url' },
	]),
};
const entry = {
	collection: 'articles',
	slug: 'example',
	title: 'Example',
	content: 'Body',
	image_path: null,
	fields: {
		featured: false,
		score: 0,
		link: 'https://example.com',
		ignored: 'omitted',
	},
	sort_order: 0,
	active: 1,
};
test('custom content models preserve false and zero and store only declared fields', () => {
	assert.deepEqual(validateEntryInput(schema, entry), {
		featured: false,
		score: 0,
		link: 'https://example.com',
	});
});
test('content models reject invalid field definitions and unsafe values', () => {
	assert.throws(() =>
		validateContentFields([
			{ key: 'name', label: 'Name', type: 'text' },
			{ key: 'name', label: 'Duplicate', type: 'text' },
		]),
	);
	for (const patch of [
		{ active: 2 },
		{ sort_order: 0.5 },
		{ image_path: 'javascript:alert(1)' },
		{ image_path: '//example.com' },
		{ fields: { featured: true } },
		{ fields: { featured: 'true', score: 0 } },
		{ fields: { featured: false, score: 0, link: '/files/%2e%2e/private' } },
	]) {
		assert.throws(() => validateEntryInput(schema, { ...entry, ...patch }));
	}
});
test('page updates reject unknown runtime SQL keys and public entry lists exclude drafts', async () => {
	const calls = [];
	const db = {
		prepare(sql) {
			calls.push(sql);
			return {
				bind(...values) {
					calls.push(values);
					return this;
				},
				async run() {},
				async all() {
					return { results: [] };
				},
			};
		},
	};
	await updatePage(db, 'home', {
		title: 'Safe',
		'invalid_column = 1 --': 'ignored',
	});
	assert.ok(!calls[0].includes('invalid_column'));
	assert.deepEqual(calls[1], ['Safe', 'home']);
	calls.length = 0;
	await getEntries(db, 'articles');
	assert.ok(calls[0].includes('AND active = 1'));
	assert.deepEqual(calls[1], ['articles']);
});

test('editing an entry slug preserves its stable id and collection boundary', async () => {
	const statements = [];
	const db = {
		prepare(sql) {
			const statement = {
				sql,
				values: [],
				bind(...values) {
					this.values = values;
					return this;
				},
				async first() {
					if (sql.includes('FROM collections'))
						return { ...schema, fields: JSON.stringify(schema.fields) };
					if (sql.includes('FROM entries'))
						return this.values[0] === 'articles' && this.values[1] === 7
							? { ...entry, id: 7, fields: JSON.stringify(entry.fields) }
							: null;
				},
				async run() {
					statements.push(this);
				},
			};
			return statement;
		},
	};
	await saveEntry(db, { ...entry, id: 7, slug: 'renamed' });
	assert.equal(statements.length, 1);
	assert.ok(statements[0].sql.startsWith('UPDATE entries'));
	assert.equal(statements[0].values[0], 'renamed');
	assert.deepEqual(statements[0].values.slice(-2), ['articles', 7]);
	await assert.rejects(() => saveEntry(db, { ...entry, id: 99 }));
});

test('OAuth audit quotas retain grant identity independently of API token ids', async () => {
	const statements = [];
	const db = {
		prepare(sql) {
			return {
				sql,
				values: [],
				bind(...values) {
					this.values = values;
					return this;
				},
				async first() {
					statements.push(this);
					return { n: 2 };
				},
			};
		},
		async batch(items) {
			statements.push(...items);
		},
	};
	assert.equal(await mcpWritesLastHour(db, null, 'oauth:user:grant-a'), 2);
	assert.deepEqual(statements[0].values, ['oauth:user:grant-a', null]);
	await mcpWritesLastHour(db, 17);
	assert.deepEqual(statements[1].values, [null, 17]);
	await recordAudit(
		db,
		null,
		'save_page',
		'page:home',
		[],
		'oauth:user:grant-b',
	);
	assert.deepEqual(statements[2].values, [
		null,
		'save_page',
		'page:home',
		'[]',
		'oauth:user:grant-b',
	]);
});
