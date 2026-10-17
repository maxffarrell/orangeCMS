import { site } from '#lib/site.js';
// Minimal Model Context Protocol server (Streamable HTTP transport, stateless,
// JSON responses). Works with Claude (custom connectors / Claude Code) and
// ChatGPT (connectors, deep research via the `search` + `fetch` convention).
import type { D1Database } from '@cloudflare/workers-types';
import {
	FIELD_TYPES,
	formatAnswer,
	sanitizeFields,
	slugifyFormSlug
} from '../forms.js';
import { redactAnswers } from './privacy.js';
import {
	getFormById,
	getFormBySlug,
	getFormSchema,
	getForms,
	getPage,
	getSettings,
	getSubmissions,
	getTour,
	getTours,
	getVendors,
	MCP_WRITES_PER_HOUR,
	mcpWritesLastHour,
	recordAudit,
	saveForm,
	updatePage,
	updateSettings,
	upsertTour,
	upsertVendor,
	type Vendor
} from './db.js';

export const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
const SERVER_INFO = { name: site.mcpName, title: site.name, version: '1.0.0' };
const INSTRUCTIONS =
	'This site uses orangeCMS. Use list_tours / get_tour for published listings, ' +
	'list_vendors for partners, list_forms / get_form for published forms, and ' +
	'get_site_info for contact details. search and fetch cover everything by keyword. ' +
	'Tools marked as admin tools are only listed when the connection is authorised. ' +
	'Edit tools never change anything unless called with confirm: true; without it they return a preview of the changes.';

export interface McpContext {
	db: D1Database;
	origin: string;
	admin: boolean;
	/** Token may edit content (admin tools marked `write`). */
	canWrite?: boolean;
	/** api_tokens.id of the caller, or null for the MCP_ADMIN_TOKEN secret. */
	tokenId?: number | null;
}

interface Tool {
	name: string;
	title: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations: Record<string, boolean>;
	admin?: boolean;
	/** Edits content: needs a write-enabled token. */
	write?: boolean;
	run: (args: Record<string, unknown>, ctx: McpContext) => Promise<unknown>;
}

class ToolError extends Error {}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
	type: 'object',
	properties,
	required,
	additionalProperties: false
});

const str = (args: Record<string, unknown>, key: string, required = false): string => {
	const v = args[key];
	if (typeof v === 'string' && v.trim()) return v.trim();
	if (required) throw new ToolError(`"${key}" is required`);
	return '';
};
const num = (args: Record<string, unknown>, key: string): number | undefined => {
	const v = args[key];
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};
const like = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
const snippet = (text: string | null | undefined, n = 300) =>
	(text ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

async function resolveForm(db: D1Database, ref: string) {
	const bySlug = await getFormBySlug(db, ref);
	if (bySlug) return bySlug;
	const id = parseInt(ref);
	const form = Number.isInteger(id) ? await getFormById(db, id) : null;
	if (!form) return null;
	const schema = await getFormSchema(db, form.id);
	return { form, schema };
}

const formSummary = (f: Awaited<ReturnType<typeof getForms>>[number], origin: string) => ({
	id: f.id,
	title: f.title,
	description: f.description,
	type: f.slug ? 'online' : 'download',
	url: f.slug ? `${origin}/forms/${f.slug}` : f.file_path ? `${origin}${f.file_path}` : null,
	slug: f.slug,
	accepting_responses: f.slug ? f.accepting === 1 : null,
	featured: f.featured === 1
});

const vendorSummary = (v: Vendor, origin: string) => ({
	slug: v.slug,
	name: v.name,
	description: v.description,
	logo: v.logo_path ? `${origin}${v.logo_path}` : null
});

const fieldItemSchema = {
	type: 'object',
	properties: {
		key: { type: 'string', description: 'Stable id (lowercase letters, digits, underscore). Derived from label if omitted.' },
		type: { type: 'string', enum: [...FIELD_TYPES] },
		label: { type: 'string' },
		required: { type: 'boolean' },
		placeholder: { type: 'string' },
		help: { type: 'string' },
		options: { type: 'array', items: { type: 'string' }, description: 'Required for select, radio and checkboxes.' },
		width: { type: 'string', enum: ['full', 'half'] },
		sensitive: { type: 'boolean', description: 'Mark personal data needing extra care (encrypted, never emailed or shown to AI).' },
		range: { type: 'string', enum: ['past', 'future'], description: 'Date fields only.' },
		showIf: {
			type: 'object',
			description: 'Show only when an EARLIER field equals a value.',
			properties: { field: { type: 'string' }, equals: { type: 'string' } },
			required: ['field', 'equals']
		}
	},
	required: ['type', 'label']
};

const READ_TOOLS: Tool[] = [
	{
		name: 'search',
		title: 'Search the site',
		description:
			'Search tours, vendors, forms and pages by keyword. Returns result ids to pass to `fetch`.',
		inputSchema: obj({ query: { type: 'string', description: 'Keywords to search for' } }, ['query']),
		annotations: READ_ONLY,
		async run(args, { db, origin }) {
			const q = like(str(args, 'query', true));
			const [tours, vendors, forms, pages] = await Promise.all([
				db.prepare("SELECT slug, title FROM tours WHERE active = 1 AND (title LIKE ?1 ESCAPE '\\' OR tour_type LIKE ?1 ESCAPE '\\' OR content LIKE ?1 ESCAPE '\\') LIMIT 10").bind(q).all<{ slug: string; title: string }>(),
				db.prepare("SELECT slug, name FROM vendors WHERE active = 1 AND (name LIKE ?1 ESCAPE '\\' OR description LIKE ?1 ESCAPE '\\') LIMIT 10").bind(q).all<{ slug: string; name: string }>(),
				db.prepare("SELECT f.id, f.title, s.slug FROM forms f LEFT JOIN form_schemas s ON s.form_id = f.id WHERE f.title LIKE ?1 ESCAPE '\\' OR f.description LIKE ?1 ESCAPE '\\' LIMIT 10").bind(q).all<{ id: number; title: string; slug: string | null }>(),
				db.prepare("SELECT slug, title FROM pages WHERE title LIKE ?1 ESCAPE '\\' OR content LIKE ?1 ESCAPE '\\' LIMIT 10").bind(q).all<{ slug: string; title: string }>()
			]);
			const results = [
				...tours.results.map((t) => ({ id: `tour:${t.slug}`, title: t.title, url: `${origin}/tours/${t.slug}` })),
				...vendors.results.map((v) => ({ id: `vendor:${v.slug}`, title: v.name, url: `${origin}/vendors` })),
				...forms.results.map((f) => ({ id: `form:${f.slug ?? f.id}`, title: f.title, url: f.slug ? `${origin}/forms/${f.slug}` : `${origin}/forms` })),
				...pages.results.map((p) => ({ id: `page:${p.slug}`, title: p.title, url: `${origin}/${p.slug === 'home' ? '' : p.slug}` }))
			];
			return { results };
		}
	},
	{
		name: 'fetch',
		title: 'Fetch a result',
		description: 'Fetch the full content of a result returned by `search` (ids look like tour:slug, vendor:slug, form:slug, page:slug).',
		inputSchema: obj({ id: { type: 'string' } }, ['id']),
		annotations: READ_ONLY,
		async run(args, { db, origin }) {
			const id = str(args, 'id', true);
			const [kind, ...rest] = id.split(':');
			const ref = rest.join(':');
			if (kind === 'tour') {
				const t = await getTour(db, ref);
				if (!t || !t.active) throw new ToolError('Tour not found');
				return { id, title: t.title, text: t.content, url: `${origin}/tours/${t.slug}`, metadata: { type: t.tour_type, dates: t.dates } };
			}
			if (kind === 'vendor') {
				const v = (await getVendors(db)).find((x) => x.slug === ref);
				if (!v) throw new ToolError('Vendor not found');
				return { id, title: v.name, text: v.description ?? '', url: `${origin}/vendors`, metadata: {} };
			}
			if (kind === 'form') {
				const f = await resolveForm(db, ref);
				if (!f) throw new ToolError('Form not found');
				return { id, title: f.form.title, text: f.form.description ?? '', url: f.schema ? `${origin}/forms/${f.schema.slug}` : `${origin}/forms`, metadata: { fields: f.schema?.fields ?? [] } };
			}
			if (kind === 'page') {
				const p = await getPage(db, ref);
				if (!p) throw new ToolError('Page not found');
				return { id, title: p.title, text: p.content, url: `${origin}/${p.slug}`, metadata: {} };
			}
			throw new ToolError('Unknown id');
		}
	},
	{
		name: 'list_tours',
		title: 'List tours',
		description: 'List active tours with dates and type. Use get_tour for the full itinerary.',
		inputSchema: obj({}),
		annotations: READ_ONLY,
		async run(_args, { db, origin }) {
			return (await getTours(db)).map((t) => ({
				slug: t.slug, title: t.title, type: t.tour_type, dates: t.dates,
				summary: snippet(t.content), url: `${origin}/tours/${t.slug}`, booking_url: t.booking_url
			}));
		}
	},
	{
		name: 'get_tour',
		title: 'Get a tour',
		description: 'Get the full details (markdown itinerary and pricing) of one tour.',
		inputSchema: obj({ slug: { type: 'string' } }, ['slug']),
		annotations: READ_ONLY,
		async run(args, { db, origin }) {
			const t = await getTour(db, str(args, 'slug', true));
			if (!t || !t.active) throw new ToolError('Tour not found');
			return { slug: t.slug, title: t.title, type: t.tour_type, dates: t.dates, content: t.content, url: `${origin}/tours/${t.slug}`, booking_url: t.booking_url };
		}
	},
	{
		name: 'list_vendors',
		title: 'List preferred vendors',
		description: "List the site owner’s vendors and partners.",
		inputSchema: obj({}),
		annotations: READ_ONLY,
		async run(_args, { db, origin }) {
			return (await getVendors(db)).map((v) => vendorSummary(v, origin));
		}
	},
	{
		name: 'list_forms',
		title: 'List forms',
		description: 'List client forms. Online forms can be completed at their url; download forms link to a PDF.',
		inputSchema: obj({}),
		annotations: READ_ONLY,
		async run(_args, { db, origin }) {
			return (await getForms(db)).map((f) => formSummary(f, origin));
		}
	},
	{
		name: 'get_form',
		title: 'Get a form',
		description: 'Get a form including every question (type, label, required, options, conditions).',
		inputSchema: obj({ form: { type: 'string', description: 'Form slug or numeric id' } }, ['form']),
		annotations: READ_ONLY,
		async run(args, { db, origin }) {
			const f = await resolveForm(db, str(args, 'form', true));
			if (!f) throw new ToolError('Form not found');
			return {
				id: f.form.id,
				title: f.form.title,
				description: f.form.description,
				url: f.schema ? `${origin}/forms/${f.schema.slug}` : f.form.file_path ? `${origin}${f.form.file_path}` : null,
				online: !!f.schema,
				accepting_responses: f.schema ? f.schema.accepting === 1 : null,
				fields: f.schema?.fields ?? []
			};
		}
	},
	{
		name: 'get_site_info',
		title: 'Get contact info',
		description: 'Get the organization phone, email, address and memberships.',
		inputSchema: obj({}),
		annotations: READ_ONLY,
		async run(_args, { db }) {
			return getSettings(db);
		}
	},
	{
		name: 'list_form_submissions',
		title: 'List form responses',
		description: 'Admin: list recent responses submitted to an online form. Contains client personal data; sensitive answers are always withheld and only visible in the admin dashboard.',
		inputSchema: obj({ form: { type: 'string', description: 'Form slug or numeric id' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['form']),
		annotations: READ_ONLY,
		admin: true,
		async run(args, { db }) {
			const f = await resolveForm(db, str(args, 'form', true));
			if (!f) throw new ToolError('Form not found');
			const subs = await getSubmissions(db, f.form.id, Math.min(Math.max(num(args, 'limit') ?? 25, 1), 100));
			return subs.map((s) => ({
				id: s.id, submitted_at: s.created_at, read: s.is_read === 1,
				answers: Object.fromEntries(redactAnswers(s.answers).map((a) => [a.label, formatAnswer(a.value)]))
			}));
		}
	}
];

// ---- Edit tools ------------------------------------------------------------------------
// Every edit goes through writeTool: it validates, computes a field-by-field diff, returns it
// as a preview unless `confirm: true`, and on apply enforces an hourly cap and writes an audit row.

interface WritePlan {
	target: string;
	before: Record<string, unknown>;
	after: Record<string, unknown>;
	apply: () => Promise<Record<string, unknown> | void>;
}

const preview = (v: unknown) => {
	const t = typeof v === 'string' ? v : JSON.stringify(v ?? null);
	return t.length > 300 ? `${t.slice(0, 300)}… (${t.length} chars)` : t;
};

function writeTool(def: {
	name: string;
	title: string;
	description: string;
	properties: Record<string, unknown>;
	required?: string[];
	plan: (args: Record<string, unknown>, ctx: McpContext) => Promise<WritePlan>;
}): Tool {
	return {
		name: def.name,
		title: def.title,
		description: `Admin (edit): ${def.description} Returns a preview of the changes; nothing is saved until called again with confirm: true.`,
		inputSchema: obj(
			{ ...def.properties, confirm: { type: 'boolean', description: 'Set true to apply the previewed changes. Default false (preview only).' } },
			def.required ?? []
		),
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		admin: true,
		write: true,
		async run(args, ctx) {
			const plan = await def.plan(args, ctx);
			const changes = Object.keys(plan.after)
				.filter((k) => JSON.stringify(plan.before[k] ?? null) !== JSON.stringify(plan.after[k] ?? null))
				.map((k) => ({ field: k, from: preview(plan.before[k]), to: preview(plan.after[k]) }));
			if (changes.length === 0) return { applied: false, target: plan.target, message: 'No changes: values already match.' };
			if (args.confirm !== true) {
				return { applied: false, dry_run: true, target: plan.target, changes, next: 'Call again with the same arguments plus confirm: true to apply.' };
			}
			const tokenId = ctx.tokenId ?? null;
			if ((await mcpWritesLastHour(ctx.db, tokenId)) >= MCP_WRITES_PER_HOUR) {
				throw new ToolError(`Edit limit reached (${MCP_WRITES_PER_HOUR} per hour per token). Try again later.`);
			}
			const extra = (await plan.apply()) ?? {};
			await recordAudit(ctx.db, tokenId, def.name, plan.target, changes);
			return { applied: true, target: plan.target, changes, ...extra };
		}
	};
}

/** Optional string arg: undefined if absent, ToolError if wrong type or too long. */
function optText(args: Record<string, unknown>, key: string, max: number): string | undefined {
	const v = args[key];
	if (v === undefined) return undefined;
	if (typeof v !== 'string') throw new ToolError(`"${key}" must be a string`);
	if (v.length > max) throw new ToolError(`"${key}" is too long (max ${max} characters)`);
	return v.trim();
}
const optBool = (args: Record<string, unknown>, key: string): boolean | undefined => {
	const v = args[key];
	if (v === undefined) return undefined;
	if (typeof v !== 'boolean') throw new ToolError(`"${key}" must be true or false`);
	return v;
};
const optInt = (args: Record<string, unknown>, key: string): number | undefined => {
	const v = args[key];
	if (v === undefined) return undefined;
	if (typeof v !== 'number' || !Number.isInteger(v) || v < -10000 || v > 10000) throw new ToolError(`"${key}" must be an integer`);
	return v;
};
/** https URL, or a site-relative /path (no protocol-relative //, no ..). Empty clears it. */
function optLink(args: Record<string, unknown>, key: string, httpsOnly = false): string | null | undefined {
	const v = optText(args, key, 500);
	if (v === undefined) return undefined;
	if (v === '') return null;
	if (!httpsOnly && /^\/(?!\/)[A-Za-z0-9._~\-\/%]*$/.test(v) && !v.includes('..')) return v;
	try {
		const u = new URL(v);
		if (u.protocol === 'https:') return u.toString();
	} catch { /* falls through */ }
	throw new ToolError(httpsOnly ? `"${key}" must be an https:// URL` : `"${key}" must be an https:// URL or a /site/path`);
}
const toSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const writeTools: Tool[] = [
	writeTool({
		name: 'save_tour',
		title: 'Create or update a tour',
		description:
			'Create a tour, or update one by `slug` (omitted properties keep their value). Without `slug` it is derived from `title`; ' +
			'an existing tour with that slug is updated. Tours cannot be deleted via MCP; set active: false to hide one.',
		properties: {
			slug: { type: 'string', description: 'Existing tour slug to update' },
			title: { type: 'string' },
			tour_type: { type: 'string' },
			dates: { type: 'string' },
			content: { type: 'string', description: 'Markdown itinerary and pricing' },
			image_path: { type: 'string', description: 'https URL or /files/... path' },
			booking_url: { type: 'string', description: 'https URL' },
			sort_order: { type: 'integer' },
			active: { type: 'boolean' }
		},
		async plan(args, { db }) {
			const title = optText(args, 'title', 200);
			const given = optText(args, 'slug', 80);
			if (given && !SLUG_RE.test(given)) throw new ToolError('"slug" must be lowercase letters, digits and hyphens');
			const slug = given || (title ? toSlug(title) : '');
			if (!slug) throw new ToolError('Provide "slug" or "title"');
			const cur = await getTour(db, slug);
			if (!cur && !title) throw new ToolError('"title" is required to create a tour');
			const next = {
				slug,
				title: title || cur!.title,
				tour_type: optText(args, 'tour_type', 80) ?? cur?.tour_type ?? null,
				dates: optText(args, 'dates', 120) ?? cur?.dates ?? null,
				content: optText(args, 'content', 50_000) ?? cur?.content ?? '',
				image_path: optLink(args, 'image_path') ?? cur?.image_path ?? null,
				booking_url: optLink(args, 'booking_url', true) ?? cur?.booking_url ?? null,
				sort_order: optInt(args, 'sort_order') ?? cur?.sort_order ?? 0,
				active: optBool(args, 'active') === undefined ? cur?.active ?? 1 : args.active ? 1 : 0
			};
			const before = cur ? { ...cur } : {};
			return { target: `tour:${slug}${cur ? '' : ' (new)'}`, before, after: next, apply: () => upsertTour(db, next) };
		}
	}),
	writeTool({
		name: 'save_vendor',
		title: 'Create or update a vendor',
		description:
			'Create a preferred vendor, or update one by `slug` (omitted properties keep their value). Vendors cannot be deleted via MCP; set active: false to hide one.',
		properties: {
			slug: { type: 'string', description: 'Vendor slug (required; existing slug updates that vendor)' },
			name: { type: 'string' },
			description: { type: 'string' },
			logo_path: { type: 'string', description: 'https URL or /files/... path' },
			photo_path: { type: 'string', description: 'https URL or /files/... path' },
			sort_order: { type: 'integer' },
			active: { type: 'boolean' }
		},
		required: ['slug'],
		async plan(args, { db }) {
			const slug = str(args, 'slug', true);
			if (!SLUG_RE.test(slug) || slug.length > 80) throw new ToolError('"slug" must be lowercase letters, digits and hyphens');
			const cur = await db.prepare('SELECT * FROM vendors WHERE slug = ?').bind(slug).first<Vendor>();
			const name = optText(args, 'name', 200) || cur?.name;
			if (!name) throw new ToolError('"name" is required to create a vendor');
			const next = {
				name,
				slug,
				logo_path: optLink(args, 'logo_path') ?? cur?.logo_path ?? null,
				photo_path: optLink(args, 'photo_path') ?? cur?.photo_path ?? null,
				description: optText(args, 'description', 5000) ?? cur?.description ?? null,
				sort_order: optInt(args, 'sort_order') ?? cur?.sort_order ?? 0,
				active: optBool(args, 'active') === undefined ? cur?.active ?? 1 : args.active ? 1 : 0
			};
			return {
				target: `vendor:${slug}${cur ? '' : ' (new)'}`,
				before: cur ? { ...cur } : {},
				after: next,
				apply: () => upsertVendor(db, cur ? ({ ...next, id: cur.id } as unknown as Omit<Vendor, 'id'>) : next)
			};
		}
	}),
	writeTool({
		name: 'update_page',
		title: 'Edit a site page',
		description: 'Edit an existing page (about, services, privacy, …) by slug: `eyebrow`, `subtitle`, markdown `content`. Pages cannot be created or deleted via MCP.',
		properties: {
			slug: { type: 'string' },
			eyebrow: { type: 'string' },
			subtitle: { type: 'string' },
			content: { type: 'string', description: 'Markdown' }
		},
		required: ['slug'],
		async plan(args, { db }) {
			const slug = str(args, 'slug', true);
			const cur = await getPage(db, slug);
			if (!cur) throw new ToolError('Page not found');
			const patch = {
				eyebrow: optText(args, 'eyebrow', 120),
				subtitle: optText(args, 'subtitle', 500),
				content: optText(args, 'content', 50_000)
			};
			const after = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
			const before = Object.fromEntries(Object.keys(after).map((k) => [k, cur[k as keyof typeof cur]]));
			return { target: `page:${slug}`, before, after, apply: () => updatePage(db, slug, after) };
		}
	}),
	writeTool({
		name: 'update_site_settings',
		title: 'Edit contact settings',
		description:
			'Edit the organization phone, email, address or memberships. NOTE: `email` is where client form responses are delivered, so double-check it.',
		properties: {
			phone: { type: 'string' },
			email: { type: 'string' },
			address: { type: 'string' },
			memberships: { type: 'string' }
		},
		async plan(args, { db }) {
			const cur = await getSettings(db);
			const patch = {
				phone: optText(args, 'phone', 40),
				email: optText(args, 'email', 200),
				address: optText(args, 'address', 300),
				memberships: optText(args, 'memberships', 300)
			};
			if (patch.email !== undefined && !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(patch.email)) {
				throw new ToolError('"email" must be a single valid email address');
			}
			const after = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
			if (Object.values(after).some((v) => v === '')) throw new ToolError('Settings cannot be emptied');
			const before = Object.fromEntries(Object.keys(after).map((k) => [k, cur[k as keyof typeof cur]]));
			return {
				target: 'settings',
				before,
				after,
				apply: () => updateSettings(db, { phone: cur.phone, email: cur.email, address: cur.address, memberships: cur.memberships, ...after })
			};
		}
	})
];

const saveFormTool = writeTool({
	name: 'save_form',
	title: 'Create or update an online form',
	description:
		'Create an online form, or update one by form id (omitted properties keep their current value; ' +
		'`fields` replaces the whole question list). Questions are validated.',
	properties: {
		form_id: { type: 'integer', description: 'Existing form id to update; omit to create' },
		title: { type: 'string' },
		description: { type: 'string' },
		fields: { type: 'array', items: fieldItemSchema },
		slug: { type: 'string', description: 'URL slug under /forms/' },
		submit_label: { type: 'string' },
		success_message: { type: 'string' },
		accepting: { type: 'boolean', description: 'Whether the form accepts responses' },
		featured: { type: 'boolean' }
	},
	async plan(args, { db, origin }) {
		const id = num(args, 'form_id');
		const existing = id ? await getFormById(db, id) : null;
		if (id && !existing) throw new ToolError('Form not found');
		const prev = existing ? await getFormSchema(db, existing.id) : null;

		let fields = prev?.fields ?? [];
		if (args.fields !== undefined) {
			const res = sanitizeFields(args.fields);
			if (res.error) throw new ToolError(res.error);
			fields = res.fields;
		}
		const title = (optText(args, 'title', 200) || existing?.title || '').slice(0, 200);
		if (!title) throw new ToolError('"title" is required');
		if (!fields.some((f) => f.type !== 'heading')) throw new ToolError('Add at least one question');

		const next = {
			title,
			description: args.description !== undefined ? (optText(args, 'description', 500) || null) : existing?.description ?? null,
			featured: args.featured !== undefined ? (optBool(args, 'featured') ? 1 : 0) : existing?.featured ?? 0,
			slug: slugifyFormSlug(str(args, 'slug') || prev?.slug || title),
			fields,
			submit_label: args.submit_label !== undefined ? (optText(args, 'submit_label', 60) || null) : prev?.submit_label ?? null,
			success_message: args.success_message !== undefined ? (optText(args, 'success_message', 1000) || null) : prev?.success_message ?? null,
			accepting: args.accepting !== undefined ? (optBool(args, 'accepting') ? 1 : 0) : prev?.accepting ?? 1
		};
		const before = existing
			? { title: existing.title, description: existing.description, featured: existing.featured, slug: prev?.slug, fields: prev?.fields, submit_label: prev?.submit_label, success_message: prev?.success_message, accepting: prev?.accepting }
			: {};
		return {
			target: existing ? `form:${existing.id}` : 'form (new)',
			before,
			after: next,
			async apply() {
				const savedId = await saveForm(db, {
					id: existing?.id,
					title: next.title,
					description: next.description,
					file_path: existing?.file_path ?? '',
					featured: next.featured,
					sort_order: existing?.sort_order ?? 0,
					online: { slug: next.slug, fields: next.fields, submit_label: next.submit_label, success_message: next.success_message, accepting: next.accepting }
				});
				const f = await resolveForm(db, String(savedId));
				return { id: savedId, url: f?.schema ? `${origin}/forms/${f.schema.slug}` : null };
			}
		};
	}
});

const TOOLS: Tool[] = [...READ_TOOLS, ...writeTools, saveFormTool];

const text = (value: unknown) => ({ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) });

const visible = (t: Tool, ctx: McpContext) => (!t.admin || ctx.admin) && (!t.write || !!ctx.canWrite);

async function callTool(params: Record<string, unknown> | undefined, ctx: McpContext) {
	const tool = TOOLS.find((t) => t.name === params?.name && visible(t, ctx));
	if (!tool) return { error: { code: -32602, message: `Unknown tool: ${String(params?.name)}` } };
	const args = (params?.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
	try {
		return { result: { content: [text(await tool.run(args, ctx))] } };
	} catch (e) {
		if (e instanceof ToolError) return { result: { isError: true, content: [text(e.message)] } };
		console.error('mcp tool failed', tool.name, e);
		return { result: { isError: true, content: [text('The tool failed unexpectedly.')] } };
	}
}

type Id = string | number | null;
interface RpcRequest { jsonrpc?: string; id?: Id; method?: string; params?: Record<string, unknown> }
export interface RpcResponse { jsonrpc: '2.0'; id: Id; result?: unknown; error?: { code: number; message: string } }

/** Handle one JSON-RPC message. Returns null for notifications and responses. */
export async function handleRpc(msg: RpcRequest, ctx: McpContext): Promise<RpcResponse | null> {
	if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
		return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
	}
	if (msg.id === undefined || typeof msg.method !== 'string') return null;
	const id = msg.id;
	const ok = (result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result });
	const err = (code: number, message: string): RpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });

	switch (msg.method) {
		case 'initialize': {
			const wanted = msg.params?.protocolVersion;
			const version = SUPPORTED_VERSIONS.find((v) => v === wanted) ?? SUPPORTED_VERSIONS[0];
			return ok({
				protocolVersion: version,
				capabilities: { tools: { listChanged: false } },
				serverInfo: SERVER_INFO,
				instructions: INSTRUCTIONS
			});
		}
		case 'ping':
			return ok({});
		case 'tools/list':
			return ok({
				tools: TOOLS.filter((t) => visible(t, ctx)).map(({ run: _run, admin: _admin, write: _write, ...t }) => t)
			});
		case 'tools/call': {
			const res = await callTool(msg.params, ctx);
			return 'error' in res && res.error ? err(res.error.code, res.error.message) : ok(res.result);
		}
		default:
			return err(-32601, `Method not found: ${msg.method}`);
	}
}
