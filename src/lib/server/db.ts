import { site } from '#lib/site.js';
import type { D1Database } from '@cloudflare/workers-types';
import { LIMITS } from './limits.js';
import { parseStoredFields, type Answer, type FormField } from '../forms.js';

export interface Page {
	id: number;
	slug: string;
	title: string;
	eyebrow: string | null;
	subtitle: string | null;
	content: string;
	updated_at: string;
}

export const CONTENT_FIELD_TYPES = [
	'text',
	'textarea',
	'markdown',
	'number',
	'boolean',
	'url',
	'image',
] as const;
export interface ContentField {
	key: string;
	label: string;
	type: (typeof CONTENT_FIELD_TYPES)[number];
	required?: boolean;
}
export interface Collection {
	slug: string;
	title: string;
	fields: ContentField[];
}
export interface Entry {
	id: number;
	collection: string;
	slug: string;
	title: string;
	content: string;
	image_path: string | null;
	fields: Record<string, unknown>;
	sort_order: number;
	active: number;
	updated_at: string;
}

export function validateContentFields(value: unknown): ContentField[] {
	if (!Array.isArray(value) || value.length > 100)
		throw new Error('Fields must be an array of at most 100 definitions');
	const seen = new Set<string>();
	return value.map((item) => {
		if (!item || typeof item !== 'object')
			throw new Error('Invalid field definition');
		const f = item as Record<string, unknown>;
		if (
			typeof f.key !== 'string' ||
			!/^[a-z][a-z0-9_]{0,63}$/.test(f.key) ||
			seen.has(f.key)
		)
			throw new Error('Field keys must be unique lowercase identifiers');
		if (
			typeof f.label !== 'string' ||
			!f.label.trim() ||
			f.label.length > 200 ||
			!CONTENT_FIELD_TYPES.includes(f.type as ContentField['type'])
		)
			throw new Error('Invalid field label or type');
		if (f.required !== undefined && typeof f.required !== 'boolean')
			throw new Error('Invalid required flag');
		seen.add(f.key);
		return {
			key: f.key,
			label: f.label.trim(),
			type: f.type as ContentField['type'],
			required: f.required === true,
		};
	});
}
function validSlug(slug: string): void {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80)
		throw new Error('Invalid slug');
}
export async function getCollections(db: D1Database): Promise<Collection[]> {
	const rows = await db
		.prepare(
			`SELECT * FROM collections ORDER BY title, slug LIMIT ${LIMITS.d1.maxCollectionsPerPage}`,
		)
		.all<Omit<Collection, 'fields'> & { fields: string }>();
	return rows.results.map((r) => ({
		...r,
		fields: safeJson<ContentField[]>(r.fields, []),
	}));
}
export async function getCollection(
	db: D1Database,
	slug: string,
): Promise<Collection | null> {
	const row = await db
		.prepare('SELECT * FROM collections WHERE slug = ?')
		.bind(slug)
		.first<Omit<Collection, 'fields'> & { fields: string }>();
	return row
		? { ...row, fields: safeJson<ContentField[]>(row.fields, []) }
		: null;
}
export async function saveCollection(
	db: D1Database,
	input: Collection,
): Promise<void> {
	validSlug(input.slug);
	if (!input.title.trim() || input.title.length > 200)
		throw new Error('A collection title is required');
	const fields = validateContentFields(input.fields);
	await db
		.prepare(
			'INSERT INTO collections (slug,title,fields) VALUES (?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, fields=excluded.fields',
		)
		.bind(input.slug, input.title, JSON.stringify(fields))
		.run();
}
export async function deleteCollection(
	db: D1Database,
	slug: string,
): Promise<void> {
	await db.batch([
		db.prepare('DELETE FROM entries WHERE collection = ?').bind(slug),
		db.prepare('DELETE FROM collections WHERE slug = ?').bind(slug),
	]);
}
type EntryRow = Omit<Entry, 'fields'> & { fields: string };
const toEntry = (row: EntryRow): Entry => ({
	...row,
	fields: safeJson<Record<string, unknown>>(row.fields, {}),
});
export async function getEntries(
	db: D1Database,
	collection: string,
	activeOnly = true,
): Promise<Entry[]> {
	const rows = await db
		.prepare(
			`SELECT * FROM entries WHERE collection = ? ${activeOnly ? 'AND active = 1' : ''} ORDER BY sort_order,id LIMIT ${LIMITS.d1.maxEntriesPerPage}`,
		)
		.bind(collection)
		.all<EntryRow>();
	return rows.results.map(toEntry);
}
export async function getEntry(
	db: D1Database,
	collection: string,
	slug: string,
): Promise<Entry | null> {
	const row = await db
		.prepare('SELECT * FROM entries WHERE collection = ? AND slug = ?')
		.bind(collection, slug)
		.first<EntryRow>();
	return row ? toEntry(row) : null;
}
export async function getEntryById(
	db: D1Database,
	collection: string,
	id: number,
): Promise<Entry | null> {
	const row = await db
		.prepare('SELECT * FROM entries WHERE collection = ? AND id = ?')
		.bind(collection, id)
		.first<EntryRow>();
	return row ? toEntry(row) : null;
}
export function validateEntryInput(
	schema: Collection,
	input: Omit<Entry, 'id' | 'updated_at'>,
): Record<string, unknown> {
	validSlug(input.slug);
	if (input.collection !== schema.slug) throw new Error('Invalid collection');
	if (
		!input.title.trim() ||
		input.title.length > 200 ||
		input.content.length > 50000
	)
		throw new Error('Invalid entry title or content');
	if (![0, 1].includes(input.active) || !Number.isSafeInteger(input.sort_order))
		throw new Error('Invalid publication state or sort order');
	if (input.image_path !== null && !safeContentLink(input.image_path))
		throw new Error('Invalid image path');
	if (
		!input.fields ||
		typeof input.fields !== 'object' ||
		Array.isArray(input.fields)
	)
		throw new Error('Fields must be an object');
	const fields: Record<string, unknown> = {};
	for (const field of schema.fields) {
		const value = input.fields[field.key];
		if (value === undefined || value === null || value === '') {
			if (field.required) throw new Error(`${field.label} is required`);
			continue;
		}
		if (
			field.type === 'number'
				? typeof value !== 'number' || !Number.isFinite(value)
				: field.type === 'boolean'
					? typeof value !== 'boolean'
					: typeof value !== 'string'
		)
			throw new Error(`Invalid value for ${field.label}`);
		if (typeof value === 'string' && value.length > 50000)
			throw new Error(`${field.label} is too long`);
		if (
			(field.type === 'url' || field.type === 'image') &&
			(typeof value !== 'string' || !safeContentLink(value))
		)
			throw new Error(`${field.label} requires an HTTPS URL or site path`);
		fields[field.key] = value;
	}
	return fields;
}
function safeContentLink(value: string): boolean {
	if (
		/^\/(?!\/)[A-Za-z0-9._~\-\/%]*$/.test(value) &&
		!value.includes('..') &&
		!/%(?:2f|5c|2e)/i.test(value)
	)
		return true;
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
}
export async function saveEntry(
	db: D1Database,
	input: Omit<Entry, 'id' | 'updated_at'> & { id?: number },
): Promise<void> {
	validSlug(input.slug);
	const schema = await getCollection(db, input.collection);
	if (!schema) throw new Error('Collection not found');
	const fields = validateEntryInput(schema, input);
	if (input.id !== undefined) {
		if (!Number.isSafeInteger(input.id) || input.id < 1)
			throw new Error('Invalid entry id');
		const current = await getEntryById(db, input.collection, input.id);
		if (!current) throw new Error('Entry not found');
		await db
			.prepare(
				'UPDATE entries SET slug=?,title=?,content=?,image_path=?,fields=?,sort_order=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE collection=? AND id=?',
			)
			.bind(
				input.slug,
				input.title,
				input.content,
				input.image_path,
				JSON.stringify(fields),
				input.sort_order,
				input.active,
				input.collection,
				input.id,
			)
			.run();
		return;
	}
	await db
		.prepare(
			`INSERT INTO entries (collection,slug,title,content,image_path,fields,sort_order,active) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(collection,slug) DO UPDATE SET title=excluded.title,content=excluded.content,image_path=excluded.image_path,fields=excluded.fields,sort_order=excluded.sort_order,active=excluded.active,updated_at=CURRENT_TIMESTAMP`,
		)
		.bind(
			input.collection,
			input.slug,
			input.title,
			input.content,
			input.image_path,
			JSON.stringify(fields),
			input.sort_order,
			input.active,
		)
		.run();
}
export async function deleteEntry(
	db: D1Database,
	collection: string,
	id: number,
): Promise<void> {
	await db
		.prepare('DELETE FROM entries WHERE collection = ? AND id = ?')
		.bind(collection, id)
		.run();
}

export interface Form {
	id: number;
	title: string;
	description: string | null;
	file_path: string;
	featured: number;
	sort_order: number;
}

export type Settings = Record<string, string>;
export async function getSettings(db: D1Database): Promise<Settings> {
	const result = await db
		.prepare('SELECT key,value FROM settings')
		.all<{ key: string; value: string }>();
	return Object.fromEntries(result.results.map((r) => [r.key, r.value]));
}
export async function getPages(db: D1Database): Promise<Page[]> {
	const result = await db
		.prepare(
			`SELECT * FROM pages ORDER BY title,slug LIMIT ${LIMITS.d1.maxPagesPerPage}`,
		)
		.all<Page>();
	return result.results;
}
export async function savePage(
	db: D1Database,
	input: Omit<Page, 'id' | 'updated_at'>,
): Promise<void> {
	validSlug(input.slug);
	if (
		!input.title.trim() ||
		input.title.length > 200 ||
		input.content.length > 50000
	)
		throw new Error('Invalid page title or content');
	await db
		.prepare(
			`INSERT INTO pages (slug,title,eyebrow,subtitle,content) VALUES (?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,eyebrow=excluded.eyebrow,subtitle=excluded.subtitle,content=excluded.content,updated_at=CURRENT_TIMESTAMP`,
		)
		.bind(input.slug, input.title, input.eyebrow, input.subtitle, input.content)
		.run();
}
export async function deletePage(db: D1Database, slug: string): Promise<void> {
	await db.prepare('DELETE FROM pages WHERE slug = ?').bind(slug).run();
}

export async function getPage(
	db: D1Database,
	slug: string,
): Promise<Page | null> {
	return db
		.prepare('SELECT * FROM pages WHERE slug = ?')
		.bind(slug)
		.first<Page>();
}

export async function updatePage(
	db: D1Database,
	slug: string,
	data: Partial<Pick<Page, 'title' | 'eyebrow' | 'subtitle' | 'content'>>,
): Promise<void> {
	const allowed = ['title', 'eyebrow', 'subtitle', 'content'];
	const entries = Object.entries(data).filter(
		([key, value]) => allowed.includes(key) && value !== undefined,
	);
	if (!entries.length) return;
	const fields = entries.map(([key]) => `${key} = ?`);
	const values = entries.map(([, value]) => value);
	await db
		.prepare(
			`UPDATE pages SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`,
		)
		.bind(...values, slug)
		.run();
}

export interface FormListItem extends Form {
	/** Set when the form can be filled in online; null for download-only forms. */
	slug: string | null;
	accepting: number | null;
	submission_count: number;
	unread_count: number;
}

export interface FormSchema {
	form_id: number;
	slug: string;
	fields: FormField[];
	submit_label: string | null;
	success_message: string | null;
	accepting: number;
}

export interface FormSubmission {
	id: number;
	form_id: number;
	answers: Answer[];
	is_read: number;
	created_at: string;
}

const FORM_LIST_SQL = `
	SELECT f.*, s.slug AS slug, s.accepting AS accepting,
	  (SELECT COUNT(*) FROM form_submissions x WHERE x.form_id = f.id) AS submission_count,
	  (SELECT COUNT(*) FROM form_submissions x WHERE x.form_id = f.id AND x.is_read = 0) AS unread_count
	FROM forms f LEFT JOIN form_schemas s ON s.form_id = f.id
	ORDER BY f.sort_order, f.id LIMIT ${LIMITS.d1.maxFormsPerPage}`;

export async function getForms(db: D1Database): Promise<FormListItem[]> {
	const result = await db.prepare(FORM_LIST_SQL).all<FormListItem>();
	return result.results;
}

export async function getFormById(
	db: D1Database,
	id: number,
): Promise<Form | null> {
	return db.prepare('SELECT * FROM forms WHERE id = ?').bind(id).first<Form>();
}

type SchemaRow = Omit<FormSchema, 'fields'> & { fields: string };
const toSchema = (row: SchemaRow | null): FormSchema | null =>
	row ? { ...row, fields: parseStoredFields(row.fields) } : null;

export async function getFormSchema(
	db: D1Database,
	formId: number,
): Promise<FormSchema | null> {
	return toSchema(
		await db
			.prepare('SELECT * FROM form_schemas WHERE form_id = ?')
			.bind(formId)
			.first<SchemaRow>(),
	);
}

export async function getFormBySlug(
	db: D1Database,
	slug: string,
): Promise<{ form: Form; schema: FormSchema } | null> {
	const row = await db
		.prepare('SELECT * FROM form_schemas WHERE slug = ?')
		.bind(slug)
		.first<SchemaRow>();
	const schema = toSchema(row);
	if (!schema) return null;
	const form = await getFormById(db, schema.form_id);
	return form ? { form, schema } : null;
}

export interface SaveFormInput {
	id?: number;
	title: string;
	description: string | null;
	file_path: string;
	featured: number;
	sort_order: number;
	/** Present for online forms; omit (or null) for download-only forms. */
	online: {
		slug: string;
		fields: FormField[];
		submit_label: string | null;
		success_message: string | null;
		accepting: number;
	} | null;
}

async function uniqueSlug(
	db: D1Database,
	wanted: string,
	formId?: number,
): Promise<string> {
	for (let n = 1; ; n++) {
		const candidate = n === 1 ? wanted : `${wanted.slice(0, 56)}-${n}`;
		const hit = await db
			.prepare('SELECT form_id FROM form_schemas WHERE slug = ?')
			.bind(candidate)
			.first<{ form_id: number }>();
		if (!hit || hit.form_id === formId) return candidate;
	}
}

/** Create or update a form and its online schema. Returns the form id. */
export async function saveForm(
	db: D1Database,
	input: SaveFormInput,
): Promise<number> {
	let id = input.id;
	if (id) {
		await db
			.prepare(
				'UPDATE forms SET title=?, description=?, file_path=?, featured=?, sort_order=? WHERE id=?',
			)
			.bind(
				input.title,
				input.description,
				input.file_path,
				input.featured,
				input.sort_order,
				id,
			)
			.run();
	} else {
		const res = await db
			.prepare(
				'INSERT INTO forms (title, description, file_path, featured, sort_order) VALUES (?,?,?,?,?)',
			)
			.bind(
				input.title,
				input.description,
				input.file_path,
				input.featured,
				input.sort_order,
			)
			.run();
		id = res.meta.last_row_id;
	}
	if (input.online) {
		const o = input.online;
		const slug = await uniqueSlug(db, o.slug, id);
		await db
			.prepare(
				`INSERT INTO form_schemas (form_id, slug, fields, submit_label, success_message, accepting)
				 VALUES (?,?,?,?,?,?)
				 ON CONFLICT(form_id) DO UPDATE SET slug = excluded.slug, fields = excluded.fields,
				   submit_label = excluded.submit_label, success_message = excluded.success_message,
				   accepting = excluded.accepting`,
			)
			.bind(
				id,
				slug,
				JSON.stringify(o.fields),
				o.submit_label,
				o.success_message,
				o.accepting,
			)
			.run();
	} else {
		// Switching back to download-only keeps past submissions but takes the form offline.
		await db
			.prepare('DELETE FROM form_schemas WHERE form_id = ?')
			.bind(id)
			.run();
	}
	return id;
}

export async function deleteForm(db: D1Database, id: number): Promise<void> {
	await db.batch([
		db.prepare('DELETE FROM form_submissions WHERE form_id = ?').bind(id),
		db.prepare('DELETE FROM form_schemas WHERE form_id = ?').bind(id),
		db.prepare('DELETE FROM forms WHERE id = ?').bind(id),
	]);
}

export async function addSubmission(
	db: D1Database,
	formId: number,
	answers: Answer[],
): Promise<void> {
	await db
		.prepare('INSERT INTO form_submissions (form_id, answers) VALUES (?, ?)')
		.bind(formId, JSON.stringify(answers))
		.run();
}

export async function getSubmissions(
	db: D1Database,
	formId: number,
	limit = 100,
): Promise<FormSubmission[]> {
	const result = await db
		.prepare(
			'SELECT * FROM form_submissions WHERE form_id = ? ORDER BY id DESC LIMIT ?',
		)
		.bind(formId, limit)
		.all<Omit<FormSubmission, 'answers'> & { answers: string }>();
	return result.results.map((r) => ({
		...r,
		answers: safeJson<Answer[]>(r.answers, []),
	}));
}

export async function setSubmissionRead(
	db: D1Database,
	id: number,
	read: boolean,
): Promise<void> {
	await db
		.prepare('UPDATE form_submissions SET is_read = ? WHERE id = ?')
		.bind(read ? 1 : 0, id)
		.run();
}

export async function deleteSubmission(
	db: D1Database,
	id: number,
): Promise<void> {
	await db.prepare('DELETE FROM form_submissions WHERE id = ?').bind(id).run();
}

function safeJson<T>(json: string, fallback: T): T {
	try {
		return JSON.parse(json) as T;
	} catch {
		return fallback;
	}
}

export async function updateSettings(
	db: D1Database,
	settings: Settings,
): Promise<void> {
	const stmts = Object.entries(settings).map(([k, v]) =>
		db
			.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
			.bind(k, v),
	);
	await db.batch(stmts);
}

export interface ApiToken {
	id: number;
	name: string;
	prefix: string;
	created_at: string;
	last_used_at: string | null;
	revoked_at: string | null;
	can_write: number;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(value),
	);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Create a bearer token. The plaintext is returned once and never stored. Read-only unless canWrite. */
export async function createApiToken(
	db: D1Database,
	name: string,
	canWrite = false,
): Promise<string> {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const token = `${site.tokenPrefix}${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
	const res = await db
		.prepare(
			'INSERT INTO api_tokens (name, prefix, token_hash) VALUES (?, ?, ?)',
		)
		.bind(name, token.slice(0, 11), await sha256Hex(token))
		.run();
	if (canWrite) {
		await db
			.prepare(
				'INSERT OR REPLACE INTO api_token_grants (token_id, can_write) VALUES (?, 1)',
			)
			.bind(res.meta.last_row_id)
			.run();
	}
	return token;
}

export async function listApiTokens(db: D1Database): Promise<ApiToken[]> {
	const result = await db
		.prepare(
			`SELECT t.id, t.name, t.prefix, t.created_at, t.last_used_at, t.revoked_at, COALESCE(g.can_write, 0) AS can_write
			   FROM api_tokens t LEFT JOIN api_token_grants g ON g.token_id = t.id
			  ORDER BY t.id DESC LIMIT 100`,
		)
		.all<ApiToken>();
	return result.results;
}

export async function revokeApiToken(
	db: D1Database,
	id: number,
): Promise<void> {
	await db
		.prepare(
			'UPDATE api_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL',
		)
		.bind(id)
		.run();
}

export interface TokenAuth {
	id: number;
	canWrite: boolean;
}

/**
 * Resolve a bearer token to its identity, or null if unknown/revoked. A failed lookup is a
 * single indexed read and never writes, so junk requests cannot burn D1 write quota.
 */
export async function verifyApiToken(
	db: D1Database,
	token: string,
): Promise<TokenAuth | null> {
	try {
		const row = await db
			.prepare(
				`SELECT t.id, t.last_used_at, COALESCE(g.can_write, 0) AS can_write
				   FROM api_tokens t LEFT JOIN api_token_grants g ON g.token_id = t.id
				  WHERE t.token_hash = ? AND t.revoked_at IS NULL`,
			)
			.bind(await sha256Hex(token))
			.first<{ id: number; last_used_at: string | null; can_write: number }>();
		if (!row) return null;
		// Record usage at most hourly to stay well inside D1's free write quota.
		const stale =
			!row.last_used_at ||
			Date.now() - Date.parse(`${row.last_used_at}Z`) > 3_600_000;
		if (stale) {
			await db
				.prepare(
					'UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
				)
				.bind(row.id)
				.run();
		}
		return { id: row.id, canWrite: row.can_write === 1 };
	} catch (e) {
		console.error('verifyApiToken failed', e);
		return null;
	}
}

// Edits applied through MCP are capped per token per hour, and the audit table is trimmed to
// the newest rows, so a leaked write token cannot run up D1 usage on the free tier.
export const MCP_WRITES_PER_HOUR = 30;
const AUDIT_KEEP = 500;

export interface AuditEntry {
	id: number;
	actor_key: string | null;
	token_id: number | null;
	token_name: string | null;
	tool: string;
	target: string | null;
	changes: string | null;
	created_at: string;
}

export async function mcpWritesLastHour(
	db: D1Database,
	tokenId: number | null,
	actorKey?: string,
): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM mcp_audit
			  WHERE actor_key IS ? AND token_id IS ? AND created_at > datetime('now', '-1 hour')`,
		)
		.bind(actorKey ?? null, tokenId)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

export async function recordAudit(
	db: D1Database,
	tokenId: number | null,
	tool: string,
	target: string,
	changes: unknown,
	actorKey?: string,
): Promise<void> {
	await db.batch([
		db
			.prepare(
				'INSERT INTO mcp_audit (token_id, tool, target, changes, actor_key) VALUES (?, ?, ?, ?, ?)',
			)
			.bind(
				tokenId,
				tool,
				target.slice(0, 200),
				JSON.stringify(changes).slice(0, 4000),
				actorKey ?? null,
			),
		db.prepare(
			`DELETE FROM mcp_audit WHERE id <= (SELECT id FROM mcp_audit ORDER BY id DESC LIMIT 1 OFFSET ${AUDIT_KEEP})`,
		),
	]);
}

export async function listAudit(
	db: D1Database,
	limit = 50,
): Promise<AuditEntry[]> {
	const result = await db
		.prepare(
			`SELECT a.id, a.token_id, a.actor_key, COALESCE(t.name, CASE WHEN a.actor_key IS NOT NULL THEN 'OAuth connection' END) AS token_name, a.tool, a.target, a.changes, a.created_at
			   FROM mcp_audit a LEFT JOIN api_tokens t ON t.id = a.token_id
			  ORDER BY a.id DESC LIMIT ?`,
		)
		.bind(limit)
		.all<AuditEntry>();
	return result.results;
}
