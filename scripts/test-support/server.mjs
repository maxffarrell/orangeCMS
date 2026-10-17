import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

/** Transpile the actual server modules without adding a test runtime dependency. */
export async function serverModules(t) {
	const temp = await mkdtemp(join(tmpdir(), 'orangecms-server-test-'));
	t.after(() => rm(temp, { recursive: true, force: true }));
	await mkdir(join(temp, 'src/lib/server'), { recursive: true });
	await writeFile(
		join(temp, 'package.json'),
		JSON.stringify({ type: 'module', imports: { '#lib/*': './src/lib/*' } }),
	);
	for (const file of [
		'server/db',
		'server/limits',
		'server/privacy',
		'forms',
		'site',
		'routing',
	]) {
		const source = await readFile(
			new URL(`../../src/lib/${file}.ts`, import.meta.url),
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
	return {
		db: await import(pathToFileURL(join(temp, 'src/lib/server/db.js')).href),
		privacy: await import(
			pathToFileURL(join(temp, 'src/lib/server/privacy.js')).href
		),
	};
}

/** D1's small statement interface backed by real SQLite, using the shipping migration. */
export async function migratedDatabase(t) {
	const sqlite = new DatabaseSync(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec('PRAGMA foreign_keys = ON');
	sqlite.exec(
		await readFile(
			new URL('../../migrations/0001_initial.sql', import.meta.url),
			'utf8',
		),
	);
	const db = {
		prepare(sql) {
			const statement = sqlite.prepare(sql);
			let values = [];
			return {
				bind(...input) {
					values = input;
					return this;
				},
				async first() {
					const row = statement.get(...values);
					return row ? { ...row } : null;
				},
				async all() {
					return {
						results: statement.all(...values).map((row) => ({ ...row })),
					};
				},
				async run() {
					const result = statement.run(...values);
					return {
						success: true,
						meta: {
							changes: Number(result.changes),
							last_row_id: Number(result.lastInsertRowid),
						},
					};
				},
			};
		},
		async batch(statements) {
			sqlite.exec('BEGIN');
			try {
				const results = [];
				for (const statement of statements) results.push(await statement.run());
				sqlite.exec('COMMIT');
				return results;
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
		},
	};
	return { db, sqlite };
}
