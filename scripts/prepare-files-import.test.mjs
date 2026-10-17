import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareFilesImport } from './prepare-files-import.mjs';
import { getFile } from '../src/lib/server/files.ts';
async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'orangecms-file-import-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const bytes = Buffer.from([0, 255, 1, 128, 22]);
	await writeFile(join(root, 'document.pdf'), bytes);
	const row = {
		key: 'document.pdf',
		size: bytes.length,
		sha256: createHash('sha256').update(bytes).digest('hex'),
		http_metadata: { contentType: 'application/pdf' },
	};
	const manifestPath = join(root, 'manifest.json');
	await writeFile(manifestPath, JSON.stringify({ objects: [row] }));
	return {
		root,
		bytes,
		row,
		manifestPath,
		sourceDirectory: root,
		outputPath: join(root, 'bulk.json'),
	};
}
test('offline import preserves exact bytes, keys and metadata readable by the file backend', async (t) => {
	const f = await fixture(t);
	const result = await prepareFilesImport(f);
	assert.equal(result.objects, 1);
	assert.equal(result.bytes, f.bytes.length);
	const [item] = JSON.parse(await readFile(f.outputPath, 'utf8'));
	assert.equal(item.key, 'orangecms:files:document.pdf');
	assert.equal(item.base64, true);
	assert.deepEqual(Buffer.from(item.value, 'base64'), f.bytes);
	const file = await getFile(
		{
			getWithMetadata: async () => ({
				value: Uint8Array.from(f.bytes).buffer,
				metadata: item.metadata,
			}),
		},
		f.row.key,
	);
	assert.equal(file.metadata.sha256, f.row.sha256);
	assert.equal(file.metadata.contentType, 'application/pdf');
});
test('offline import rejects corrupt backups before replacing an output', async (t) => {
	const f = await fixture(t);
	await writeFile(join(f.root, 'document.pdf'), 'corrupted');
	await writeFile(f.outputPath, 'existing output');
	await assert.rejects(prepareFilesImport(f), /does not match/);
	assert.equal(await readFile(f.outputPath, 'utf8'), 'existing output');
});
test('offline import rejects duplicate keys and filesystem escapes', async (t) => {
	const f = await fixture(t);
	await writeFile(f.manifestPath, JSON.stringify({ objects: [f.row, f.row] }));
	await assert.rejects(prepareFilesImport(f), /Duplicate/);
	await writeFile(
		f.manifestPath,
		JSON.stringify({ objects: [{ ...f.row, key: '../outside.pdf' }] }),
	);
	await assert.rejects(prepareFilesImport(f), /Invalid file key/);
	await symlink(join(f.root, 'document.pdf'), join(f.root, 'alias.pdf'));
	await writeFile(
		f.manifestPath,
		JSON.stringify({ objects: [{ ...f.row, key: 'alias.pdf' }] }),
	);
	await assert.rejects(prepareFilesImport(f), /escapes/);
});

test('offline import never overwrites a verified source, manifest or existing output', async (t) => {
	const f = await fixture(t);
	for (const outputPath of [join(f.root, 'document.pdf'), f.manifestPath]) {
		const before = await readFile(outputPath);
		await assert.rejects(prepareFilesImport({ ...f, outputPath }), {
			code: 'EEXIST',
		});
		assert.deepEqual(await readFile(outputPath), before);
	}
	await writeFile(f.outputPath, 'existing output');
	await assert.rejects(prepareFilesImport(f), { code: 'EEXIST' });
	assert.equal(await readFile(f.outputPath, 'utf8'), 'existing output');
});

test('offline import limits encoded request bytes before exposing any partial payload', async (t) => {
	const f = await fixture(t);
	const bytes = Buffer.alloc(2048, 1);
	await writeFile(join(f.root, 'document.pdf'), bytes);
	await writeFile(
		f.manifestPath,
		JSON.stringify({
			objects: [
				{
					...f.row,
					size: bytes.length,
					sha256: createHash('sha256').update(bytes).digest('hex'),
				},
			],
		}),
	);
	await assert.rejects(
		prepareFilesImport({ ...f, maxPayloadBytes: 1024 }),
		/Encoded bulk payload exceeds/,
	);
	await assert.rejects(readFile(f.outputPath), { code: 'ENOENT' });
	await assert.rejects(
		prepareFilesImport({ ...f, maxPayloadBytes: 100 * 1024 * 1024 }),
		/Invalid bulk payload limit/,
	);
});
