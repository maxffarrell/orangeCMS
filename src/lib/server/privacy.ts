// Privacy helpers for form responses: field-level encryption for sensitive answers,
// redaction for channels that must never carry them (email, MCP), and retention.
import type { D1Database } from '@cloudflare/workers-types';
import { WITHHELD, type Answer, type AnswerValue } from '../forms.js';

const PREFIX = 'enc:v1:';
export const DEFAULT_RETENTION_DAYS = 365;
export const MIN_RETENTION_DAYS = 30;

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** AES-256-GCM key from the FORM_DATA_KEY secret (base64, 32 bytes), or null when unset/invalid. */
export async function getDataKey(secret: string | undefined): Promise<CryptoKey | null> {
	if (!secret) return null;
	try {
		const raw = fromB64(secret.trim());
		if (raw.length !== 32) return null;
		return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
	} catch {
		return null;
	}
}

const aad = (formId: number, key: string) => new TextEncoder().encode(`form:${formId}:${key}`);

async function encrypt(key: CryptoKey, formId: number, field: string, value: AnswerValue): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = new TextEncoder().encode(JSON.stringify(value));
	const ct = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(formId, field) }, key, data)
	);
	return `${PREFIX}${toB64(iv)}:${toB64(ct)}`;
}

async function decrypt(key: CryptoKey, formId: number, field: string, token: string): Promise<AnswerValue> {
	const [iv, ct] = token.slice(PREFIX.length).split(':');
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: fromB64(iv), additionalData: aad(formId, field) },
		key,
		fromB64(ct)
	);
	return JSON.parse(new TextDecoder().decode(plain)) as AnswerValue;
}

/** Encrypt the answers flagged sensitive, ready to store. */
export async function protectAnswers(key: CryptoKey, formId: number, answers: Answer[]): Promise<Answer[]> {
	return Promise.all(
		answers.map(async (a) =>
			a.sensitive ? { ...a, value: await encrypt(key, formId, a.key, a.value) } : a
		)
	);
}

/** Decrypt for an authenticated admin. Undecryptable values (lost/rotated key) are labelled, not thrown. */
export async function revealAnswers(key: CryptoKey | null, formId: number, answers: Answer[]): Promise<Answer[]> {
	return Promise.all(
		answers.map(async (a) => {
			if (!a.sensitive || typeof a.value !== 'string' || !a.value.startsWith(PREFIX)) return a;
			if (!key) return { ...a, value: '[encryption key not configured]' };
			try {
				return { ...a, value: await decrypt(key, formId, a.key, a.value) };
			} catch {
				return { ...a, value: '[unable to decrypt]' };
			}
		})
	);
}

/** For channels that must never carry sensitive data (email, MCP). Never decrypts. */
export function redactAnswers(answers: Answer[]): Answer[] {
	return answers.map((a) => (a.sensitive ? { ...a, value: WITHHELD } : a));
}

export async function getRetentionDays(db: D1Database): Promise<number> {
	try {
		const row = await db
			.prepare("SELECT value FROM settings WHERE key = 'submission_retention_days'")
			.first<{ value: string }>();
		const days = parseInt(row?.value ?? '');
		return Number.isFinite(days) ? Math.max(days, MIN_RETENTION_DAYS) : DEFAULT_RETENTION_DAYS;
	} catch {
		return DEFAULT_RETENTION_DAYS;
	}
}

export async function setRetentionDays(db: D1Database, days: number): Promise<number> {
	const value = Math.max(Math.round(days) || DEFAULT_RETENTION_DAYS, MIN_RETENTION_DAYS);
	await db
		.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('submission_retention_days', ?)")
		.bind(String(value))
		.run();
	return value;
}

/** Delete responses older than the retention period. Runs opportunistically (no cron needed). */
export async function purgeExpiredSubmissions(db: D1Database): Promise<number> {
	try {
		const days = await getRetentionDays(db);
		const res = await db
			.prepare("DELETE FROM form_submissions WHERE created_at < datetime('now', ?)")
			.bind(`-${days} days`)
			.run();
		return res.meta.changes ?? 0;
	} catch (e) {
		console.error('retention purge failed', e);
		return 0;
	}
}
