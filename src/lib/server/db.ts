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

export interface Tour {
	id: number;
	slug: string;
	title: string;
	tour_type: string | null;
	dates: string | null;
	content: string;
	image_path: string | null;
	booking_url: string | null;
	sort_order: number;
	active: number;
	updated_at: string;
}

export interface Form {
	id: number;
	title: string;
	description: string | null;
	file_path: string;
	featured: number;
	sort_order: number;
}

export interface Settings {
	phone: string;
	email: string;
	address: string;
	memberships: string;
}

export async function getSettings(db: D1Database): Promise<Settings> {
	const result = await db
		.prepare('SELECT key, value FROM settings')
		.all<{ key: string; value: string }>();
	return Object.fromEntries(result.results.map((r) => [r.key, r.value])) as unknown as Settings;
}

export async function getPage(db: D1Database, slug: string): Promise<Page | null> {
	return db.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<Page>();
}

export async function updatePage(
	db: D1Database,
	slug: string,
	data: Partial<Pick<Page, 'title' | 'eyebrow' | 'subtitle' | 'content'>>
): Promise<void> {
	const fields = Object.entries(data)
		.filter(([, v]) => v !== undefined)
		.map(([k]) => `${k} = ?`);
	const values = Object.values(data).filter((v) => v !== undefined);
	await db
		.prepare(`UPDATE pages SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`)
		.bind(...values, slug)
		.run();
}

export async function getTours(db: D1Database, activeOnly = true): Promise<Tour[]> {
	const q = activeOnly
		? `SELECT * FROM tours WHERE active = 1 ORDER BY sort_order, id LIMIT ${LIMITS.d1.maxToursPerPage}`
		: `SELECT * FROM tours ORDER BY sort_order, id LIMIT ${LIMITS.d1.maxToursPerPage}`;
	const result = await db.prepare(q).all<Tour>();
	return result.results;
}

export async function getTour(db: D1Database, slug: string): Promise<Tour | null> {
	return db.prepare('SELECT * FROM tours WHERE slug = ?').bind(slug).first<Tour>();
}

export async function getTourById(db: D1Database, id: number): Promise<Tour | null> {
	return db.prepare('SELECT * FROM tours WHERE id = ?').bind(id).first<Tour>();
}

export async function upsertTour(db: D1Database, tour: Omit<Tour, 'id' | 'updated_at'>): Promise<void> {
	await db
		.prepare(
			`INSERT INTO tours (slug, title, tour_type, dates, content, image_path, booking_url, sort_order, active)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(slug) DO UPDATE SET
			   title = excluded.title, tour_type = excluded.tour_type, dates = excluded.dates,
			   content = excluded.content, image_path = excluded.image_path, booking_url = excluded.booking_url,
			   sort_order = excluded.sort_order, active = excluded.active, updated_at = CURRENT_TIMESTAMP`
		)
		.bind(
			tour.slug, tour.title, tour.tour_type, tour.dates, tour.content,
			tour.image_path, tour.booking_url, tour.sort_order, tour.active
		)
		.run();
}

export async function deleteTour(db: D1Database, id: number): Promise<void> {
	await db.prepare('DELETE FROM tours WHERE id = ?').bind(id).run();
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
	try {
		const result = await db.prepare(FORM_LIST_SQL).all<FormListItem>();
		return result.results;
	} catch (e) {
		// Migration 0004 not applied yet: show every form as a plain PDF download
		// instead of taking the Forms page down.
		console.error('getForms: online-form tables unavailable, falling back', e);
		const result = await db
			.prepare(`SELECT * FROM forms ORDER BY sort_order, id LIMIT ${LIMITS.d1.maxFormsPerPage}`)
			.all<Form>();
		return result.results.map((f) => ({
			...f, slug: null, accepting: null, submission_count: 0, unread_count: 0
		}));
	}
}

export async function getFormById(db: D1Database, id: number): Promise<Form | null> {
	return db.prepare('SELECT * FROM forms WHERE id = ?').bind(id).first<Form>();
}

type SchemaRow = Omit<FormSchema, 'fields'> & { fields: string };
const toSchema = (row: SchemaRow | null): FormSchema | null =>
	row ? { ...row, fields: parseStoredFields(row.fields) } : null;

export async function getFormSchema(db: D1Database, formId: number): Promise<FormSchema | null> {
	return toSchema(
		await db.prepare('SELECT * FROM form_schemas WHERE form_id = ?').bind(formId).first<SchemaRow>()
	);
}

export async function getFormBySlug(
	db: D1Database,
	slug: string
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

async function uniqueSlug(db: D1Database, wanted: string, formId?: number): Promise<string> {
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
export async function saveForm(db: D1Database, input: SaveFormInput): Promise<number> {
	let id = input.id;
	if (id) {
		await db
			.prepare('UPDATE forms SET title=?, description=?, file_path=?, featured=?, sort_order=? WHERE id=?')
			.bind(input.title, input.description, input.file_path, input.featured, input.sort_order, id)
			.run();
	} else {
		const res = await db
			.prepare('INSERT INTO forms (title, description, file_path, featured, sort_order) VALUES (?,?,?,?,?)')
			.bind(input.title, input.description, input.file_path, input.featured, input.sort_order)
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
				   accepting = excluded.accepting`
			)
			.bind(id, slug, JSON.stringify(o.fields), o.submit_label, o.success_message, o.accepting)
			.run();
	} else {
		// Switching back to download-only keeps past submissions but takes the form offline.
		await db.prepare('DELETE FROM form_schemas WHERE form_id = ?').bind(id).run();
	}
	return id;
}

export async function deleteForm(db: D1Database, id: number): Promise<void> {
	await db.batch([
		db.prepare('DELETE FROM form_submissions WHERE form_id = ?').bind(id),
		db.prepare('DELETE FROM form_schemas WHERE form_id = ?').bind(id),
		db.prepare('DELETE FROM forms WHERE id = ?').bind(id)
	]);
}

export async function addSubmission(db: D1Database, formId: number, answers: Answer[]): Promise<void> {
	await db
		.prepare('INSERT INTO form_submissions (form_id, answers) VALUES (?, ?)')
		.bind(formId, JSON.stringify(answers))
		.run();
}

export async function getSubmissions(
	db: D1Database,
	formId: number,
	limit = 100
): Promise<FormSubmission[]> {
	const result = await db
		.prepare('SELECT * FROM form_submissions WHERE form_id = ? ORDER BY id DESC LIMIT ?')
		.bind(formId, limit)
		.all<Omit<FormSubmission, 'answers'> & { answers: string }>();
	return result.results.map((r) => ({ ...r, answers: safeJson<Answer[]>(r.answers, []) }));
}

export async function setSubmissionRead(db: D1Database, id: number, read: boolean): Promise<void> {
	await db.prepare('UPDATE form_submissions SET is_read = ? WHERE id = ?').bind(read ? 1 : 0, id).run();
}

export async function deleteSubmission(db: D1Database, id: number): Promise<void> {
	await db.prepare('DELETE FROM form_submissions WHERE id = ?').bind(id).run();
}

function safeJson<T>(json: string, fallback: T): T {
	try {
		return JSON.parse(json) as T;
	} catch {
		return fallback;
	}
}

export interface Vendor {
	id: number;
	name: string;
	slug: string;
	logo_path: string | null;
	photo_path: string | null;
	description: string | null;
	sort_order: number;
	active: number;
}

export async function getVendors(db: D1Database, activeOnly = true): Promise<Vendor[]> {
	const q = activeOnly
		? `SELECT * FROM vendors WHERE active = 1 ORDER BY sort_order, id LIMIT ${LIMITS.d1.maxVendorsPerPage}`
		: `SELECT * FROM vendors ORDER BY sort_order, id LIMIT ${LIMITS.d1.maxVendorsPerPage}`;
	const result = await db.prepare(q).all<Vendor>();
	return result.results;
}

export async function getVendorById(db: D1Database, id: number): Promise<Vendor | null> {
	return db.prepare('SELECT * FROM vendors WHERE id = ?').bind(id).first<Vendor>();
}

export async function upsertVendor(db: D1Database, vendor: Omit<Vendor, 'id'>): Promise<void> {
	if ((vendor as Vendor & { id?: number }).id) {
		const v = vendor as Vendor;
		await db
			.prepare('UPDATE vendors SET name=?, slug=?, logo_path=?, photo_path=?, description=?, sort_order=?, active=? WHERE id=?')
			.bind(v.name, v.slug, v.logo_path, v.photo_path, v.description, v.sort_order, v.active, v.id)
			.run();
	} else {
		await db
			.prepare('INSERT INTO vendors (name, slug, logo_path, photo_path, description, sort_order, active) VALUES (?,?,?,?,?,?,?)')
			.bind(vendor.name, vendor.slug, vendor.logo_path, vendor.photo_path, vendor.description, vendor.sort_order, vendor.active)
			.run();
	}
}

export async function deleteVendor(db: D1Database, id: number): Promise<void> {
	await db.prepare('DELETE FROM vendors WHERE id = ?').bind(id).run();
}

export async function updateSettings(db: D1Database, settings: Settings): Promise<void> {
	const stmts = Object.entries(settings).map(([k, v]) =>
		db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v)
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
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Create a bearer token. The plaintext is returned once and never stored. Read-only unless canWrite. */
export async function createApiToken(db: D1Database, name: string, canWrite = false): Promise<string> {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const token = `${site.tokenPrefix}${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
	const res = await db
		.prepare('INSERT INTO api_tokens (name, prefix, token_hash) VALUES (?, ?, ?)')
		.bind(name, token.slice(0, 11), await sha256Hex(token))
		.run();
	if (canWrite) {
		await db
			.prepare('INSERT OR REPLACE INTO api_token_grants (token_id, can_write) VALUES (?, 1)')
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
			  ORDER BY t.id DESC LIMIT 100`
		)
		.all<ApiToken>();
	return result.results;
}

export async function revokeApiToken(db: D1Database, id: number): Promise<void> {
	await db
		.prepare('UPDATE api_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL')
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
export async function verifyApiToken(db: D1Database, token: string): Promise<TokenAuth | null> {
	try {
		const row = await db
			.prepare(
				`SELECT t.id, t.last_used_at, COALESCE(g.can_write, 0) AS can_write
				   FROM api_tokens t LEFT JOIN api_token_grants g ON g.token_id = t.id
				  WHERE t.token_hash = ? AND t.revoked_at IS NULL`
			)
			.bind(await sha256Hex(token))
			.first<{ id: number; last_used_at: string | null; can_write: number }>();
		if (!row) return null;
		// Record usage at most hourly to stay well inside D1's free write quota.
		const stale = !row.last_used_at || Date.now() - Date.parse(`${row.last_used_at}Z`) > 3_600_000;
		if (stale) {
			await db.prepare('UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(row.id).run();
		}
		return { id: row.id, canWrite: row.can_write === 1 };
	} catch (e) {
		console.error('verifyApiToken failed (are migrations 0005/0007 applied?)', e);
		return null;
	}
}

// Edits applied through MCP are capped per token per hour, and the audit table is trimmed to
// the newest rows, so a leaked write token cannot run up D1 usage on the free tier.
export const MCP_WRITES_PER_HOUR = 30;
const AUDIT_KEEP = 500;

export interface AuditEntry {
	id: number;
	token_id: number | null;
	token_name: string | null;
	tool: string;
	target: string | null;
	changes: string | null;
	created_at: string;
}

export async function mcpWritesLastHour(db: D1Database, tokenId: number | null): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM mcp_audit
			  WHERE token_id IS ? AND created_at > datetime('now', '-1 hour')`
		)
		.bind(tokenId)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

export async function recordAudit(
	db: D1Database,
	tokenId: number | null,
	tool: string,
	target: string,
	changes: unknown
): Promise<void> {
	await db.batch([
		db
			.prepare('INSERT INTO mcp_audit (token_id, tool, target, changes) VALUES (?, ?, ?, ?)')
			.bind(tokenId, tool, target.slice(0, 200), JSON.stringify(changes).slice(0, 4000)),
		db.prepare(`DELETE FROM mcp_audit WHERE id <= (SELECT id FROM mcp_audit ORDER BY id DESC LIMIT 1 OFFSET ${AUDIT_KEEP})`)
	]);
}

export async function listAudit(db: D1Database, limit = 50): Promise<AuditEntry[]> {
	const result = await db
		.prepare(
			`SELECT a.id, a.token_id, t.name AS token_name, a.tool, a.target, a.changes, a.created_at
			   FROM mcp_audit a LEFT JOIN api_tokens t ON t.id = a.token_id
			  ORDER BY a.id DESC LIMIT ?`
		)
		.bind(limit)
		.all<AuditEntry>();
	return result.results;
}
