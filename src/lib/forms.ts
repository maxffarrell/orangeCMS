// Shared form schema: field definitions authored in the admin dashboard,
// rendered on the public site, and validated on the server. Pure functions only,
// so it can be imported from both client and server code.

export const FIELD_TYPES = [
	'text',
	'email',
	'tel',
	'number',
	'date',
	'textarea',
	'select',
	'radio',
	'checkbox',
	'checkboxes',
	'heading'
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
	text: 'Short text',
	email: 'Email',
	tel: 'Phone',
	number: 'Number',
	date: 'Date',
	textarea: 'Long text',
	select: 'Dropdown',
	radio: 'Single choice (radio)',
	checkbox: 'Single checkbox',
	checkboxes: 'Multiple choice (checkboxes)',
	heading: 'Section heading'
};

export const CHOICE_TYPES: readonly FieldType[] = ['select', 'radio', 'checkboxes'];

export interface FormField {
	key: string;
	type: FieldType;
	label: string;
	required?: boolean;
	placeholder?: string;
	help?: string;
	options?: string[];
	width?: 'full' | 'half';
	/** Show this field only when another field currently equals a value. */
	showIf?: { field: string; equals: string };
	/**
	 * Personal data that needs extra care (date of birth, passport, health needs).
	 * Encrypted at rest, never emailed, and hidden from the MCP server.
	 */
	sensitive?: boolean;
	/** Date fields: limit the picker to past or future dates. */
	range?: 'past' | 'future';
}

export type AnswerValue = string | string[];
export interface Answer {
	key: string;
	label: string;
	/** Plain value, or an `enc:v1:` token when `sensitive` (see server/privacy.ts). */
	value: AnswerValue;
	sensitive?: boolean;
}

export const FORM_LIMITS = {
	maxFields: 60,
	maxOptions: 50,
	maxLabel: 600,
	maxHelp: 400,
	maxOption: 100,
	maxText: 500,
	maxTextarea: 5000
} as const;

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isFieldType(value: unknown): value is FieldType {
	return typeof value === 'string' && (FIELD_TYPES as readonly string[]).includes(value);
}

export function slugifyKey(label: string): string {
	const base = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 40);
	return /^[a-z]/.test(base) ? base : `field_${base}`.replace(/_$/, '').slice(0, 40);
}

export function slugifyFormSlug(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'form'
	);
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Validate and normalise untrusted field definitions (admin input, MCP input, stored JSON). */
export function sanitizeFields(input: unknown): { fields: FormField[]; error?: string } {
	if (!Array.isArray(input)) return { fields: [], error: 'Fields must be a list' };
	if (input.length > FORM_LIMITS.maxFields) {
		return { fields: [], error: `A form can have at most ${FORM_LIMITS.maxFields} fields` };
	}
	const fields: FormField[] = [];
	const seen = new Set<string>();
	for (const [i, raw] of input.entries()) {
		if (!raw || typeof raw !== 'object') return { fields: [], error: `Field ${i + 1} is invalid` };
		const r = raw as Record<string, unknown>;
		if (!isFieldType(r.type)) return { fields: [], error: `Field ${i + 1} has an unknown type` };
		const label = str(r.label, FORM_LIMITS.maxLabel);
		if (!label) return { fields: [], error: `Field ${i + 1} needs a label` };
		let key = str(r.key, 40) || slugifyKey(label);
		if (!KEY_RE.test(key)) key = slugifyKey(key);
		// Disambiguate duplicate keys rather than rejecting the whole form.
		const base = key;
		for (let n = 2; seen.has(key); n++) key = `${base.slice(0, 36)}_${n}`;
		seen.add(key);

		const field: FormField = { key, type: r.type, label };
		if (r.type !== 'heading') {
			if (r.required === true) field.required = true;
			const placeholder = str(r.placeholder, FORM_LIMITS.maxLabel);
			if (placeholder && !['select', 'radio', 'checkbox', 'checkboxes', 'date'].includes(r.type)) {
				field.placeholder = placeholder;
			}
		}
		const help = str(r.help, FORM_LIMITS.maxHelp);
		if (help) field.help = help;
		if (r.sensitive === true && r.type !== 'heading') field.sensitive = true;
		if (r.type === 'date' && (r.range === 'past' || r.range === 'future')) field.range = r.range;
		if (r.width === 'half' && r.type !== 'heading') field.width = 'half';

		if (CHOICE_TYPES.includes(r.type)) {
			const rawOptions = Array.isArray(r.options) ? r.options : [];
			const options = [
				...new Set(rawOptions.map((o) => str(o, FORM_LIMITS.maxOption)).filter(Boolean))
			].slice(0, FORM_LIMITS.maxOptions);
			if (options.length === 0) {
				return { fields: [], error: `"${label}" needs at least one option` };
			}
			field.options = options;
		}

		if (r.showIf && typeof r.showIf === 'object') {
			const s = r.showIf as Record<string, unknown>;
			const target = str(s.field, 40);
			const equals = str(s.equals, FORM_LIMITS.maxOption);
			// Only allow depending on an earlier field, which also rules out cycles.
			if (target && equals && seen.has(target) && target !== key) {
				field.showIf = { field: target, equals };
			}
		}
		fields.push(field);
	}
	return { fields };
}

export function parseStoredFields(json: string | null | undefined): FormField[] {
	if (!json) return [];
	try {
		return sanitizeFields(JSON.parse(json)).fields;
	} catch {
		return [];
	}
}

/** Current value of a field as a comparable string (checkboxes: matches if any selected). */
export function fieldMatches(value: AnswerValue | undefined | null, equals: string): boolean {
	if (Array.isArray(value)) return value.includes(equals);
	return value === equals;
}

export function isVisible(field: FormField, values: Record<string, AnswerValue | undefined>): boolean {
	if (!field.showIf) return true;
	return fieldMatches(values[field.showIf.field], field.showIf.equals);
}

export interface ValidationResult {
	answers: Answer[];
	errors: Record<string, string>;
	values: Record<string, AnswerValue>;
}

/** Validate a submission against a schema. Hidden (showIf) fields are ignored. */
export function validateSubmission(fields: FormField[], data: FormData): ValidationResult {
	const errors: Record<string, string> = {};
	const values: Record<string, AnswerValue> = {};
	const answers: Answer[] = [];

	for (const field of fields) {
		if (field.type === 'heading') continue;
		if (!isVisible(field, values)) continue;
		const name = `f_${field.key}`;
		let value: AnswerValue;

		if (field.type === 'checkboxes') {
			value = data.getAll(name).filter((v): v is string => typeof v === 'string');
			values[field.key] = value;
			const bad = value.some((v) => !field.options?.includes(v));
			if (bad) errors[field.key] = 'Please choose from the listed options';
			else if (field.required && value.length === 0) errors[field.key] = 'Please choose at least one';
			if (value.length === 0 && !field.required) continue;
		} else if (field.type === 'checkbox') {
			const checked = data.get(name) !== null;
			value = checked ? 'Yes' : 'No';
			values[field.key] = value;
			if (field.required && !checked) errors[field.key] = 'This box must be checked';
		} else {
			const raw = data.get(name);
			value = typeof raw === 'string' ? raw.trim() : '';
			values[field.key] = value;
			const max = field.type === 'textarea' ? FORM_LIMITS.maxTextarea : FORM_LIMITS.maxText;
			if (value === '') {
				if (field.required) errors[field.key] = 'This field is required';
				else continue;
			} else if (value.length > max) {
				errors[field.key] = `Please keep this under ${max} characters`;
			} else if (field.type === 'email' && !EMAIL_RE.test(value)) {
				errors[field.key] = 'Enter a valid email address';
			} else if (field.type === 'number' && !Number.isFinite(Number(value))) {
				errors[field.key] = 'Enter a number';
			} else if (field.type === 'date' && (!DATE_RE.test(value) || Number.isNaN(Date.parse(value)))) {
				errors[field.key] = 'Enter a valid date';
			} else if ((field.type === 'select' || field.type === 'radio') && !field.options?.includes(value)) {
				errors[field.key] = 'Please choose from the listed options';
			}
		}
		answers.push(
			field.sensitive
				? { key: field.key, label: field.label, value, sensitive: true }
				: { key: field.key, label: field.label, value }
		);
	}
	return { answers, errors, values };
}

export function formatAnswer(value: AnswerValue): string {
	return Array.isArray(value) ? value.join(', ') : value;
}

/** Fields a visitor may be asked for. Sensitive fields are withheld unless they can be encrypted. */
export function collectableFields(fields: FormField[], canEncrypt: boolean): FormField[] {
	return canEncrypt ? fields : fields.filter((f) => !f.sensitive);
}

export const WITHHELD = '[withheld: sensitive]';
