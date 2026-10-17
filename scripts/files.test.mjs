import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FILE_KEY_PREFIX, getFileStorageKey, putFile, getFile, InvalidFileKeyError, FileStorageUnavailableError } from '../src/lib/server/files.ts';
class Storage {
	rows = new Map();
	async put(key, value, { metadata }) { this.rows.set(key, { value: value.slice(0), metadata: structuredClone(metadata) }); }
	async getWithMetadata(key) { return this.rows.get(key) ?? { value: null, metadata: null }; }
}
test('binary storage preserves keys, MIME metadata, size and content digest', async () => {
	const storage = new Storage();
	const bytes = Uint8Array.from([0, 255, 128, 32, 10]).buffer;
	const metadata = await putFile(storage, 'documents/a.pdf', bytes, 'application/pdf');
	assert.equal(storage.rows.size, 1);
	assert.ok(storage.rows.has(FILE_KEY_PREFIX + 'documents/a.pdf'));
	assert.deepEqual((await getFile(storage, 'documents/a.pdf')).body, bytes);
	assert.equal(metadata.size, bytes.byteLength);
	assert.equal(metadata.contentType, 'application/pdf');
	assert.match(metadata.sha256, /^[a-f0-9]{64}$/);
	assert.equal(metadata.sha256, Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex'));
	assert.equal(await getFile(storage, 'missing.pdf'), null);
});
test('17 MiB uploads fit KV without text or base64 conversion', async () => {
	const storage = new Storage();
	const bytes = new Uint8Array(17 * 1024 * 1024);
	bytes[0] = 255; bytes[bytes.length - 1] = 128;
	await putFile(storage, 'large.pdf', bytes.buffer, 'application/pdf');
	const result = await getFile(storage, 'large.pdf');
	assert.equal(result.body.byteLength, bytes.length);
	assert.equal(new Uint8Array(result.body)[bytes.length - 1], 128);
});
test('storage validates key bytes, value sizes and metadata before writing', async () => {
	for (const key of ['', '../private', 'a/../private', '/leading', 'empty//part', 'back\\slash', 'control\nkey', 'ü'.repeat(260)]) assert.throws(() => getFileStorageKey(key), InvalidFileKeyError);
	assert.equal(getFileStorageKey('images/example.png'), FILE_KEY_PREFIX + 'images/example.png');
	const storage = new Storage();
	await assert.rejects(() => putFile(storage, 'file.pdf', new ArrayBuffer(1), 'text/html\r\nx-test: unsafe'));
	await assert.rejects(() => putFile(storage, 'large.pdf', new ArrayBuffer(25 * 1024 * 1024 + 1), 'application/pdf'));
	assert.equal(storage.rows.size, 0);
});
test('missing storage and quota failures fail closed without another backend', async () => {
	await assert.rejects(() => getFile(undefined, 'a.pdf'), FileStorageUnavailableError);
	await assert.rejects(() => putFile(undefined, 'a.pdf', new ArrayBuffer(1), 'application/pdf'), FileStorageUnavailableError);
	const unavailable = { async getWithMetadata() { throw new Error('daily limit'); }, async put() { throw new Error('storage limit'); } };
	await assert.rejects(() => getFile(unavailable, 'a.pdf'), FileStorageUnavailableError);
	await assert.rejects(() => putFile(unavailable, 'a.pdf', new ArrayBuffer(1), 'application/pdf'), FileStorageUnavailableError);
	const malformed = { async getWithMetadata() { return { value: new ArrayBuffer(1), metadata: { contentType: 'application/pdf', size: 99, sha256: 'bad' } }; } };
	await assert.rejects(() => getFile(malformed, 'a.pdf'), FileStorageUnavailableError);
});
