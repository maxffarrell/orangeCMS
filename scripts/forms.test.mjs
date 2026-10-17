import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	sanitizeFields,
	parseStoredFields,
	validateSubmission,
	collectableFields,
	FORM_LIMITS,
} from '../src/lib/forms.ts';

function submit(fields, entries) {
	const data = new FormData();
	for (const [key, value] of entries) data.append(`f_${key}`, value);
	return validateSubmission(fields, data);
}

test('form definitions normalize duplicate keys, choices, and presentation-only headings', () => {
	const { fields, error } = sanitizeFields([
		{
			label: ' Name ',
			key: 'NAME',
			type: 'text',
			required: true,
			sensitive: true,
			width: 'half',
		},
		{
			label: 'Name',
			type: 'select',
			options: [' One ', 'One', '', 123, 'Two'],
		},
		{
			label: 'Section',
			type: 'heading',
			required: true,
			sensitive: true,
			width: 'half',
		},
	]);
	assert.equal(error, undefined);
	assert.deepEqual(
		fields.map((field) => field.key),
		['name', 'name_2', 'section'],
	);
	assert.deepEqual(fields[1].options, ['One', 'Two']);
	assert.deepEqual(fields[2], {
		key: 'section',
		type: 'heading',
		label: 'Section',
	});
});

test('malformed or oversized stored form schemas fail closed', () => {
	for (const input of [
		null,
		{},
		[null],
		[{ label: 'Test', type: 'unknown' }],
		[{ label: 'Test', type: 'select', options: [] }],
		Array(FORM_LIMITS.maxFields + 1).fill({}),
	]) {
		const result = sanitizeFields(input);
		assert.ok(result.error);
		assert.deepEqual(result.fields, []);
	}
	for (const stored of ['{', '{}', '[{"label":"Test","type":"unknown"}]', null])
		assert.deepEqual(parseStoredFields(stored), []);
});

test('conditions only reference prior fields and hidden required fields ignore forged values', () => {
	const { fields } = sanitizeFields([
		{ key: 'mode', label: 'Mode', type: 'select', options: ['Yes', 'No'] },
		{
			key: 'details',
			label: 'Details',
			type: 'text',
			required: true,
			sensitive: true,
			showIf: { field: 'mode', equals: 'Yes' },
		},
		{
			key: 'cycle',
			label: 'Cycle',
			type: 'text',
			showIf: { field: 'later', equals: 'Yes' },
		},
		{
			key: 'later',
			label: 'Later',
			type: 'text',
			showIf: { field: 'later', equals: 'Yes' },
		},
	]);
	assert.equal(fields[2].showIf, undefined);
	assert.equal(fields[3].showIf, undefined);
	const hidden = submit(fields, [
		['mode', 'No'],
		['details', 'forged'],
	]);
	assert.deepEqual(hidden.errors, {});
	assert.equal(hidden.values.details, undefined);
	assert.ok(!hidden.answers.some((answer) => answer.key === 'details'));
	assert.equal(
		submit(fields, [['mode', 'Yes']]).errors.details,
		'This field is required',
	);
	const visible = submit(fields, [
		['mode', 'Yes'],
		['details', '  value  '],
	]);
	assert.deepEqual(visible.answers[1], {
		key: 'details',
		label: 'Details',
		value: 'value',
		sensitive: true,
	});
});

test('submission validation rejects forged choices, invalid scalar values, and oversized text', () => {
	const fields = [
		{ key: 'email', label: 'Email', type: 'email', required: true },
		{ key: 'count', label: 'Count', type: 'number' },
		{ key: 'date', label: 'Date', type: 'date' },
		{ key: 'choice', label: 'Choice', type: 'radio', options: ['One'] },
		{ key: 'many', label: 'Many', type: 'checkboxes', options: ['One'] },
		{ key: 'agree', label: 'Agree', type: 'checkbox', required: true },
		{ key: 'text', label: 'Text', type: 'text' },
		{ key: 'body', label: 'Body', type: 'textarea' },
	];
	const result = submit(fields, [
		['email', 'bad'],
		['count', 'Infinity'],
		['date', '2025-13-01'],
		['choice', 'Other'],
		['many', 'Other'],
		['text', 'x'.repeat(FORM_LIMITS.maxText + 1)],
		['body', 'x'.repeat(FORM_LIMITS.maxTextarea + 1)],
	]);
	assert.deepEqual(
		Object.keys(result.errors).sort(),
		fields.map((field) => field.key).sort(),
	);
	const valid = submit(fields, [
		['email', ' member@example.com '],
		['count', '0'],
		['date', '2025-01-01'],
		['choice', 'One'],
		['many', 'One'],
		['agree', 'on'],
		['text', 'x'.repeat(FORM_LIMITS.maxText)],
		['body', 'x'.repeat(FORM_LIMITS.maxTextarea)],
	]);
	assert.deepEqual(valid.errors, {});
	assert.equal(valid.values.count, '0');
	assert.equal(valid.values.email, 'member@example.com');
});

test('multi-select answers drive conditional fields while missing and file values cannot satisfy required text', () => {
	const fields = [
		{
			key: 'choices',
			label: 'Choices',
			type: 'checkboxes',
			options: ['One', 'Two'],
			required: true,
		},
		{
			key: 'detail',
			label: 'Detail',
			type: 'text',
			required: true,
			showIf: { field: 'choices', equals: 'Two' },
		},
	];
	assert.ok(submit(fields, []).errors.choices);
	assert.equal(submit(fields, [['choices', 'One']]).errors.detail, undefined);
	const result = submit(fields, [
		['choices', 'One'],
		['choices', 'Two'],
		['detail', new Blob(['uploaded'])],
	]);
	assert.equal(result.errors.detail, 'This field is required');
	assert.deepEqual(result.values.choices, ['One', 'Two']);
});

test('sensitive fields are collectible only when encryption is configured', () => {
	const fields = [
		{ key: 'public', label: 'Public', type: 'text' },
		{ key: 'private', label: 'Private', type: 'text', sensitive: true },
	];
	assert.deepEqual(collectableFields(fields, false), [fields[0]]);
	assert.deepEqual(collectableFields(fields, true), fields);
	assert.equal(fields.length, 2);
});

test('date validation rejects impossible calendar dates and enforces inclusive past and future ranges', (t) => {
	t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 5, 15, 12) });
	const date = { key: 'date', label: 'Date', type: 'date', required: true };
	for (const invalid of [
		'2026-02-29',
		'2026-02-31',
		'2026-04-31',
		'2026-00-01',
		'2026-01-00',
		'2026-1-01',
		'2026-01-01T00:00:00Z',
	]) {
		assert.equal(
			submit([date], [['date', invalid]]).errors.date,
			'Enter a valid date',
		);
	}
	assert.deepEqual(submit([date], [['date', '2024-02-29']]).errors, {});
	assert.deepEqual(
		submit([{ ...date, range: 'past' }], [['date', '2026-06-15']]).errors,
		{},
	);
	assert.deepEqual(
		submit([{ ...date, range: 'future' }], [['date', '2026-06-15']]).errors,
		{},
	);
	assert.ok(
		submit([{ ...date, range: 'past' }], [['date', '2026-06-16']]).errors.date,
	);
	assert.ok(
		submit([{ ...date, range: 'future' }], [['date', '2026-06-14']]).errors
			.date,
	);
	assert.deepEqual(
		submit([{ ...date, range: 'past' }], [['date', '2026-06-14']]).errors,
		{},
	);
	assert.deepEqual(
		submit([{ ...date, range: 'future' }], [['date', '2026-06-16']]).errors,
		{},
	);
});

test('a forged sensitive answer is omitted when encryption is unavailable', () => {
	const fields = [
		{ key: 'message', label: 'Message', type: 'text', required: true },
		{
			key: 'private',
			label: 'Private',
			type: 'text',
			sensitive: true,
			required: true,
		},
	];
	const result = submit(collectableFields(fields, false), [
		['message', 'Hello'],
		['private', 'forged private value'],
	]);
	assert.deepEqual(result.errors, {});
	assert.deepEqual(result.answers, [
		{ key: 'message', label: 'Message', value: 'Hello' },
	]);
	assert.equal(result.values.private, undefined);
});
