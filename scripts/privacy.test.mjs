import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { serverModules } from './test-support/server.mjs';
const cleanup = [];
const { privacy } = await serverModules({ after: (fn) => cleanup.push(fn) });
after(async () => {
	for (const fn of cleanup) await fn();
});
const secret = Buffer.alloc(32, 7).toString('base64');
const answers = [
	{ key: 'public', label: 'Public', value: 'Visible' },
	{ key: 'private', label: 'Private', value: ['One', 'Two'], sensitive: true },
];

test('encryption configuration accepts only a valid 256-bit key', async () => {
	for (const invalid of [
		undefined,
		'',
		'not-base64!',
		Buffer.alloc(16).toString('base64'),
	])
		assert.equal(await privacy.getDataKey(invalid), null);
	const key = await privacy.getDataKey(secret);
	assert.equal(key.algorithm.name, 'AES-GCM');
	assert.equal(key.extractable, false);
});

test('sensitive answers encrypt with fresh nonces, round-trip arrays, and leave public answers unchanged', async () => {
	const key = await privacy.getDataKey(secret);
	const protectedAnswers = await privacy.protectAnswers(key, 12, answers);
	const repeated = await privacy.protectAnswers(key, 12, answers);
	assert.deepEqual(protectedAnswers[0], answers[0]);
	assert.match(protectedAnswers[1].value, /^enc:v1:/);
	assert.notEqual(protectedAnswers[1].value, repeated[1].value);
	assert.notEqual(protectedAnswers[1].value, JSON.stringify(answers[1].value));
	assert.deepEqual(
		await privacy.revealAnswers(key, 12, protectedAnswers),
		answers,
	);
	assert.deepEqual(answers[1].value, ['One', 'Two']);
});

test('encrypted answers are bound to the form, field, key, and ciphertext', async () => {
	const key = await privacy.getDataKey(secret);
	const protectedAnswers = await privacy.protectAnswers(key, 12, answers);
	const otherKey = await privacy.getDataKey(
		Buffer.alloc(32, 8).toString('base64'),
	);
	for (const [decryptKey, formId, input] of [
		[key, 13, protectedAnswers],
		[otherKey, 12, protectedAnswers],
		[
			key,
			12,
			[protectedAnswers[0], { ...protectedAnswers[1], key: 'different' }],
		],
		[
			key,
			12,
			[
				protectedAnswers[0],
				{ ...protectedAnswers[1], value: 'enc:v1:invalid:invalid' },
			],
		],
	]) {
		const result = await privacy.revealAnswers(decryptKey, formId, input);
		assert.equal(result[1].value, '[unable to decrypt]');
		assert.deepEqual(result[0], answers[0]);
	}
	assert.equal(
		(await privacy.revealAnswers(null, 12, protectedAnswers))[1].value,
		'[encryption key not configured]',
	);
});

test('notification and API redaction removes sensitive plaintext and ciphertext without mutating stored answers', async () => {
	const key = await privacy.getDataKey(secret);
	const encrypted = await privacy.protectAnswers(key, 12, answers);
	for (const input of [answers, encrypted]) {
		const redacted = privacy.redactAnswers(input);
		assert.deepEqual(redacted[0], answers[0]);
		assert.equal(redacted[1].value, '[withheld: sensitive]');
		assert.notEqual(input[1].value, '[withheld: sensitive]');
	}
});
