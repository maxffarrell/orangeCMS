import {
	site,
	pageHref,
	collectionHref,
	entryHref,
	formsHref,
} from '#lib/site.js';
// Minimal Model Context Protocol server (Streamable HTTP transport, stateless,
// JSON responses) for compatible MCP clients.
import type { D1Database } from '@cloudflare/workers-types';
import {
	FIELD_TYPES,
	formatAnswer,
	sanitizeFields,
	slugifyFormSlug,
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
	getCollections,
	getCollection,
	getEntries,
	getEntry,
	MCP_WRITES_PER_HOUR,
	mcpWritesLastHour,
	recordAudit,
	saveForm,
	savePage,
	saveEntry,
	saveCollection,
	updateSettings,
	validateContentFields,
	validateEntryInput,
	CONTENT_FIELD_TYPES,
} from './db.js';

export const SUPPORTED_VERSIONS = [
	'2025-06-18',
	'2025-03-26',
	'2024-11-05',
] as const;
const SERVER_INFO = { name: site.mcpName, title: site.name, version: '1.0.0' };
const INSTRUCTIONS =
	'This site uses orangeCMS. Discover content models with list_collections, then list_entries and get_entry. Use get_page, get_settings, list_forms and get_form for other published content. Admin tools require authorization. Writes return a preview unless confirm is true.';
const absolute = (origin: string, path: string | null) =>
	path ? new URL(path, origin).href : null;

export interface McpContext {
	db: D1Database;
	origin: string;
	admin: boolean;
	/** Token may edit content (admin tools marked `write`). */
	canWrite?: boolean;
	/** api_tokens.id of the caller, or null for the MCP_ADMIN_TOKEN secret. */
	tokenId?: number | null;
	/** Stable OAuth grant identity, separate from API token ids. */
	actorKey?: string;
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

const READ_ONLY = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
};
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
	type: 'object',
	properties,
	required,
	additionalProperties: false,
});

const str = (
	args: Record<string, unknown>,
	key: string,
	required = false,
): string => {
	const v = args[key];
	if (typeof v === 'string' && v.trim()) return v.trim();
	if (required) throw new ToolError(`"${key}" is required`);
	return '';
};
const num = (
	args: Record<string, unknown>,
	key: string,
): number | undefined => {
	const v = args[key];
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};
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

const formSummary = (
	f: Awaited<ReturnType<typeof getForms>>[number],
	origin: string,
) => ({
	id: f.id,
	title: f.title,
	description: f.description,
	type: f.slug ? 'online' : 'download',
	url: f.slug
		? absolute(origin, formsHref(f.slug))
		: f.file_path
			? `${origin}${f.file_path}`
			: null,
	slug: f.slug,
	accepting_responses: f.slug ? f.accepting === 1 : null,
	featured: f.featured === 1,
});

const fieldItemSchema = {
	type: 'object',
	properties: {
		key: {
			type: 'string',
			description:
				'Stable id (lowercase letters, digits, underscore). Derived from label if omitted.',
		},
		type: { type: 'string', enum: [...FIELD_TYPES] },
		label: { type: 'string' },
		required: { type: 'boolean' },
		placeholder: { type: 'string' },
		help: { type: 'string' },
		options: {
			type: 'array',
			items: { type: 'string' },
			description: 'Required for select, radio and checkboxes.',
		},
		width: { type: 'string', enum: ['full', 'half'] },
		sensitive: {
			type: 'boolean',
			description:
				'Mark personal data needing extra care (encrypted, never emailed or shown to AI).',
		},
		range: {
			type: 'string',
			enum: ['past', 'future'],
			description: 'Date fields only.',
		},
		showIf: {
			type: 'object',
			description: 'Show only when an EARLIER field equals a value.',
			properties: { field: { type: 'string' }, equals: { type: 'string' } },
			required: ['field', 'equals'],
		},
	},
	required: ['type', 'label'],
};

const READ_TOOLS: Tool[] = [
	{
		name: 'list_collections',
		title: 'List collections',
		description:
			'Discover the configured content models and their field definitions.',
		inputSchema: obj({}),
		annotations: READ_ONLY,
		async run(_args, { db, origin }) {
			return (await getCollections(db)).map((c) => ({
				...c,
				url: absolute(origin, collectionHref(c.slug)),
			}));
		},
	},
	{
		name: 'list_entries',
		title: 'List entries',
		description: 'List published entries from a collection.',
		inputSchema: obj({ collection: { type: 'string' } }, ['collection']),
		annotations: READ_ONLY,
		async run(args, { db, origin }) {
			return (await getEntries(db, str(args, 'collection', true))).map((e) => ({
				...e,
				content: snippet(e.content),
				url: absolute(origin, entryHref(e.collection, e.slug)),
			}));
		},
	},
	{
		name: 'get_entry',
		title: 'Get an entry',
		description: 'Read one published entry and its custom fields.',
		inputSchema: obj(
			{ collection: { type: 'string' }, slug: { type: 'string' } },
			['collection', 'slug'],
		),
		annotations: READ_ONLY,
		async run(args, { db, origin }) {
			const e = await getEntry(
				db,
				str(args, 'collection', true),
				str(args, 'slug', true),
			);
			if (!e || !e.active) throw new ToolError('Entry not found');
			return { ...e, url: absolute(origin, entryHref(e.collection, e.slug)) };
		},
	},
	{
		name: 'get_page',
		title: 'Get a page',
		description: 'Read a page by its configured slug.',
		inputSchema: obj({ slug: { type: 'string' } }, ['slug']),
		annotations: READ_ONLY,
		async run(args, { db, origin }) {
			const p = await getPage(db, str(args, 'slug', true));
			if (!p) throw new ToolError('Page not found');
			return { ...p, url: absolute(origin, pageHref(p.slug)) };
		},
	},
	{
		name: 'list_forms',
		title: 'List forms',
		description:
			'List published forms. Online forms can be completed at their url; download forms link to a PDF.',
		inputSchema: obj({}),
		annotations: READ_ONLY,
		async run(_args, { db, origin }) {
			return (await getForms(db)).map((f) => formSummary(f, origin));
		},
	},
	{
		name: 'get_form',
		title: 'Get a form',
		description:
			'Get a form including every question (type, label, required, options, conditions).',
		inputSchema: obj(
			{ form: { type: 'string', description: 'Form slug or numeric id' } },
			['form'],
		),
		annotations: READ_ONLY,
		async run(args, { db, origin }) {
			const f = await resolveForm(db, str(args, 'form', true));
			if (!f) throw new ToolError('Form not found');
			return {
				id: f.form.id,
				title: f.form.title,
				description: f.form.description,
				url: f.schema
					? absolute(origin, formsHref(f.schema.slug))
					: f.form.file_path
						? `${origin}${f.form.file_path}`
						: null,
				online: !!f.schema,
				accepting_responses: f.schema ? f.schema.accepting === 1 : null,
				fields: f.schema?.fields ?? [],
			};
		},
	},
	{
		name: 'get_settings',
		title: 'Get settings',
		description: 'Get the public site settings configured by the site owner.',
		inputSchema: obj({}),
		annotations: READ_ONLY,
		async run(_args, { db }) {
			const values = await getSettings(db);
			return Object.fromEntries(
				site.publicSettings
					.filter((key) => key in values)
					.map((key) => [key, values[key]]),
			);
		},
	},
	{
		name: 'list_form_submissions',
		title: 'List form responses',
		description:
			'Admin: list recent responses submitted to an online form. Contains personal data; sensitive answers are always withheld and only visible in the admin dashboard.',
		inputSchema: obj(
			{
				form: { type: 'string', description: 'Form slug or numeric id' },
				limit: { type: 'integer', minimum: 1, maximum: 100 },
			},
			['form'],
		),
		annotations: READ_ONLY,
		admin: true,
		async run(args, { db }) {
			const f = await resolveForm(db, str(args, 'form', true));
			if (!f) throw new ToolError('Form not found');
			const subs = await getSubmissions(
				db,
				f.form.id,
				Math.min(Math.max(num(args, 'limit') ?? 25, 1), 100),
			);
			return subs.map((s) => ({
				id: s.id,
				submitted_at: s.created_at,
				read: s.is_read === 1,
				answers: Object.fromEntries(
					redactAnswers(s.answers).map((a) => [a.label, formatAnswer(a.value)]),
				),
			}));
		},
	},
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
			{
				...def.properties,
				confirm: {
					type: 'boolean',
					description:
						'Set true to apply the previewed changes. Default false (preview only).',
				},
			},
			def.required ?? [],
		),
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
		admin: true,
		write: true,
		async run(args, ctx) {
			const plan = await def.plan(args, ctx);
			const changes = Object.keys(plan.after)
				.filter(
					(k) =>
						JSON.stringify(plan.before[k] ?? null) !==
						JSON.stringify(plan.after[k] ?? null),
				)
				.map((k) => ({
					field: k,
					from: preview(plan.before[k]),
					to: preview(plan.after[k]),
				}));
			if (changes.length === 0)
				return {
					applied: false,
					target: plan.target,
					message: 'No changes: values already match.',
				};
			if (args.confirm !== true) {
				return {
					applied: false,
					dry_run: true,
					target: plan.target,
					changes,
					next: 'Call again with the same arguments plus confirm: true to apply.',
				};
			}
			const tokenId = ctx.tokenId ?? null;
			if (
				(await mcpWritesLastHour(ctx.db, tokenId, ctx.actorKey)) >=
				MCP_WRITES_PER_HOUR
			) {
				throw new ToolError(
					`Edit limit reached (${MCP_WRITES_PER_HOUR} per hour per token). Try again later.`,
				);
			}
			const extra = (await plan.apply()) ?? {};
			await recordAudit(
				ctx.db,
				tokenId,
				def.name,
				plan.target,
				changes,
				ctx.actorKey,
			);
			return { applied: true, target: plan.target, changes, ...extra };
		},
	};
}

/** Optional string arg: undefined if absent, ToolError if wrong type or too long. */
function optText(
	args: Record<string, unknown>,
	key: string,
	max: number,
): string | undefined {
	const v = args[key];
	if (v === undefined) return undefined;
	if (typeof v !== 'string') throw new ToolError(`"${key}" must be a string`);
	if (v.length > max)
		throw new ToolError(`"${key}" is too long (max ${max} characters)`);
	return v.trim();
}
const optBool = (
	args: Record<string, unknown>,
	key: string,
): boolean | undefined => {
	const v = args[key];
	if (v === undefined) return undefined;
	if (typeof v !== 'boolean')
		throw new ToolError(`"${key}" must be true or false`);
	return v;
};
const optInt = (
	args: Record<string, unknown>,
	key: string,
): number | undefined => {
	const v = args[key];
	if (v === undefined) return undefined;
	if (typeof v !== 'number' || !Number.isInteger(v) || v < -10000 || v > 10000)
		throw new ToolError(`"${key}" must be an integer`);
	return v;
};
/** https URL, or a site-relative /path (no protocol-relative //, no ..). Empty clears it. */
function optLink(
	args: Record<string, unknown>,
	key: string,
	httpsOnly = false,
): string | null | undefined {
	const v = optText(args, key, 500);
	if (v === undefined) return undefined;
	if (v === '') return null;
	if (
		!httpsOnly &&
		/^\/(?!\/)[A-Za-z0-9._~\-\/%]*$/.test(v) &&
		!v.includes('..')
	)
		return v;
	try {
		const u = new URL(v);
		if (u.protocol === 'https:') return u.toString();
	} catch {
		/* falls through */
	}
	throw new ToolError(
		httpsOnly
			? `"${key}" must be an https:// URL`
			: `"${key}" must be an https:// URL or a /site/path`,
	);
}
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const contentFieldSchema = {
	type: 'object',
	properties: {
		key: { type: 'string' },
		label: { type: 'string' },
		type: { type: 'string', enum: [...CONTENT_FIELD_TYPES] },
		required: { type: 'boolean' },
	},
	required: ['key', 'label', 'type'],
	additionalProperties: false,
};
const customValuesSchema = {
	type: 'object',
	additionalProperties: { type: ['string', 'number', 'boolean', 'null'] },
};
const writeTools: Tool[] = [
	writeTool({
		name: 'save_collection',
		title: 'Create or update a collection',
		description:
			'Define a content model. The fields array replaces the model definitions.',
		properties: {
			slug: { type: 'string' },
			title: { type: 'string' },
			fields: { type: 'array', items: contentFieldSchema },
		},
		required: ['slug'],
		async plan(args, { db }) {
			const slug = str(args, 'slug', true);
			if (!SLUG_RE.test(slug) || slug.length > 80)
				throw new ToolError('Invalid slug');
			const cur = await getCollection(db, slug);
			const title = optText(args, 'title', 200) || cur?.title;
			if (!title) throw new ToolError('Title is required');
			let fields = cur?.fields ?? [];
			if (args.fields !== undefined) {
				try {
					fields = validateContentFields(args.fields);
				} catch (e) {
					throw new ToolError(
						e instanceof Error ? e.message : 'Invalid fields',
					);
				}
			}
			const next = { slug, title, fields };
			return {
				target: `collection:${slug}${cur ? '' : ' (new)'}`,
				before: cur ? { ...cur } : {},
				after: next,
				apply: () => saveCollection(db, next),
			};
		},
	}),
	writeTool({
		name: 'save_entry',
		title: 'Create or update an entry',
		description:
			'Save content in a collection; omitted properties keep their current values. Set active false to unpublish.',
		properties: {
			collection: { type: 'string' },
			slug: { type: 'string' },
			title: { type: 'string' },
			content: { type: 'string' },
			image_path: { type: 'string' },
			fields: customValuesSchema,
			sort_order: { type: 'integer' },
			active: { type: 'boolean' },
		},
		required: ['collection', 'slug'],
		async plan(args, { db }) {
			const collection = str(args, 'collection', true),
				slug = str(args, 'slug', true);
			if (!SLUG_RE.test(slug) || slug.length > 80)
				throw new ToolError('Invalid slug');
			const schema = await getCollection(db, collection);
			if (!schema) throw new ToolError('Collection not found');
			const cur = await getEntry(db, collection, slug),
				title = optText(args, 'title', 200) || cur?.title;
			if (!title) throw new ToolError('Title is required');
			if (
				args.fields !== undefined &&
				(!args.fields ||
					typeof args.fields !== 'object' ||
					Array.isArray(args.fields))
			)
				throw new ToolError('Fields must be an object');
			const image = optLink(args, 'image_path');
			const next = {
				collection,
				slug,
				title,
				content: optText(args, 'content', 50000) ?? cur?.content ?? '',
				image_path: image === undefined ? (cur?.image_path ?? null) : image,
				fields: (args.fields ?? cur?.fields ?? {}) as Record<string, unknown>,
				sort_order: optInt(args, 'sort_order') ?? cur?.sort_order ?? 0,
				active:
					optBool(args, 'active') === undefined
						? (cur?.active ?? 1)
						: args.active
							? 1
							: 0,
			};
			try {
				next.fields = validateEntryInput(schema, next);
			} catch (e) {
				throw new ToolError(e instanceof Error ? e.message : 'Invalid entry');
			}
			return {
				target: `entry:${collection}/${slug}${cur ? '' : ' (new)'}`,
				before: cur ? { ...cur } : {},
				after: next,
				apply: () => saveEntry(db, next),
			};
		},
	}),
	writeTool({
		name: 'save_page',
		title: 'Create or update a page',
		description:
			'Create or update a page by slug. Configure its public route in site configuration.',
		properties: {
			slug: { type: 'string' },
			title: { type: 'string' },
			eyebrow: { type: 'string' },
			subtitle: { type: 'string' },
			content: { type: 'string' },
		},
		required: ['slug'],
		async plan(args, { db }) {
			const slug = str(args, 'slug', true);
			if (!SLUG_RE.test(slug) || slug.length > 80)
				throw new ToolError('Invalid slug');
			const cur = await getPage(db, slug),
				title = optText(args, 'title', 200) || cur?.title;
			if (!title) throw new ToolError('Title is required');
			const next = {
				slug,
				title,
				eyebrow: optText(args, 'eyebrow', 120) ?? cur?.eyebrow ?? null,
				subtitle: optText(args, 'subtitle', 500) ?? cur?.subtitle ?? null,
				content: optText(args, 'content', 50000) ?? cur?.content ?? '',
			};
			return {
				target: `page:${slug}${cur ? '' : ' (new)'}`,
				before: cur ? { ...cur } : {},
				after: next,
				apply: () => savePage(db, next),
			};
		},
	}),
	writeTool({
		name: 'save_settings',
		title: 'Update site settings',
		description: 'Update configured site settings by key.',
		properties: {
			values: { type: 'object', additionalProperties: { type: 'string' } },
		},
		required: ['values'],
		async plan(args, { db }) {
			if (
				!args.values ||
				typeof args.values !== 'object' ||
				Array.isArray(args.values)
			)
				throw new ToolError('Values must be an object');
			const cur = await getSettings(db),
				after: Record<string, string> = {};
			const allowed = new Set(site.settingsFields.map((f) => f.key));
			for (const [key, value] of Object.entries(args.values)) {
				if (!allowed.has(key)) throw new ToolError('Unknown setting');
				if (typeof value !== 'string' || value.length > 5000)
					throw new ToolError(
						'Setting values must be strings of at most 5000 characters',
					);
				after[key] = value;
			}
			return {
				target: 'settings',
				before: Object.fromEntries(Object.keys(after).map((k) => [k, cur[k]])),
				after,
				apply: () => updateSettings(db, after),
			};
		},
	}),
];

const saveFormTool = writeTool({
	name: 'save_form',
	title: 'Create or update an online form',
	description:
		'Create an online form, or update one by form id (omitted properties keep their current value; ' +
		'`fields` replaces the whole question list). Questions are validated.',
	properties: {
		form_id: {
			type: 'integer',
			description: 'Existing form id to update; omit to create',
		},
		title: { type: 'string' },
		description: { type: 'string' },
		fields: { type: 'array', items: fieldItemSchema },
		slug: { type: 'string', description: 'Form URL slug' },
		submit_label: { type: 'string' },
		success_message: { type: 'string' },
		accepting: {
			type: 'boolean',
			description: 'Whether the form accepts responses',
		},
		featured: { type: 'boolean' },
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
		const title = (optText(args, 'title', 200) || existing?.title || '').slice(
			0,
			200,
		);
		if (!title) throw new ToolError('"title" is required');
		if (!fields.some((f) => f.type !== 'heading'))
			throw new ToolError('Add at least one question');

		const next = {
			title,
			description:
				args.description !== undefined
					? optText(args, 'description', 500) || null
					: (existing?.description ?? null),
			featured:
				args.featured !== undefined
					? optBool(args, 'featured')
						? 1
						: 0
					: (existing?.featured ?? 0),
			slug: slugifyFormSlug(str(args, 'slug') || prev?.slug || title),
			fields,
			submit_label:
				args.submit_label !== undefined
					? optText(args, 'submit_label', 60) || null
					: (prev?.submit_label ?? null),
			success_message:
				args.success_message !== undefined
					? optText(args, 'success_message', 1000) || null
					: (prev?.success_message ?? null),
			accepting:
				args.accepting !== undefined
					? optBool(args, 'accepting')
						? 1
						: 0
					: (prev?.accepting ?? 1),
		};
		const before = existing
			? {
					title: existing.title,
					description: existing.description,
					featured: existing.featured,
					slug: prev?.slug,
					fields: prev?.fields,
					submit_label: prev?.submit_label,
					success_message: prev?.success_message,
					accepting: prev?.accepting,
				}
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
					online: {
						slug: next.slug,
						fields: next.fields,
						submit_label: next.submit_label,
						success_message: next.success_message,
						accepting: next.accepting,
					},
				});
				const f = await resolveForm(db, String(savedId));
				return {
					id: savedId,
					url: f?.schema ? absolute(origin, formsHref(f.schema.slug)) : null,
				};
			},
		};
	},
});

const TOOLS: Tool[] = [...READ_TOOLS, ...writeTools, saveFormTool];

const text = (value: unknown) => ({
	type: 'text',
	text: typeof value === 'string' ? value : JSON.stringify(value),
});

const visible = (t: Tool, ctx: McpContext) =>
	(!t.admin || ctx.admin) && (!t.write || !!ctx.canWrite);

async function callTool(
	params: Record<string, unknown> | undefined,
	ctx: McpContext,
) {
	const tool = TOOLS.find((t) => t.name === params?.name && visible(t, ctx));
	if (!tool)
		return {
			error: { code: -32602, message: `Unknown tool: ${String(params?.name)}` },
		};
	const args = (
		params?.arguments && typeof params.arguments === 'object'
			? params.arguments
			: {}
	) as Record<string, unknown>;
	try {
		return { result: { content: [text(await tool.run(args, ctx))] } };
	} catch (e) {
		if (e instanceof ToolError)
			return { result: { isError: true, content: [text(e.message)] } };
		console.error('mcp tool failed', tool.name, e);
		return {
			result: {
				isError: true,
				content: [text('The tool failed unexpectedly.')],
			},
		};
	}
}

type Id = string | number | null;
interface RpcRequest {
	jsonrpc?: string;
	id?: Id;
	method?: string;
	params?: Record<string, unknown>;
}
export interface RpcResponse {
	jsonrpc: '2.0';
	id: Id;
	result?: unknown;
	error?: { code: number; message: string };
}

/** Handle one JSON-RPC message. Returns null for notifications and responses. */
export async function handleRpc(
	msg: RpcRequest,
	ctx: McpContext,
): Promise<RpcResponse | null> {
	if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
		return {
			jsonrpc: '2.0',
			id: null,
			error: { code: -32600, message: 'Invalid Request' },
		};
	}
	if (msg.id === undefined || typeof msg.method !== 'string') return null;
	const id = msg.id;
	const ok = (result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result });
	const err = (code: number, message: string): RpcResponse => ({
		jsonrpc: '2.0',
		id,
		error: { code, message },
	});

	switch (msg.method) {
		case 'initialize': {
			const wanted = msg.params?.protocolVersion;
			const version =
				SUPPORTED_VERSIONS.find((v) => v === wanted) ?? SUPPORTED_VERSIONS[0];
			return ok({
				protocolVersion: version,
				capabilities: { tools: { listChanged: false } },
				serverInfo: SERVER_INFO,
				instructions: INSTRUCTIONS,
			});
		}
		case 'ping':
			return ok({});
		case 'tools/list':
			return ok({
				tools: TOOLS.filter((t) => visible(t, ctx)).map(
					({ run: _run, admin: _admin, write: _write, ...t }) => t,
				),
			});
		case 'tools/call': {
			const res = await callTool(msg.params, ctx);
			return 'error' in res && res.error
				? err(res.error.code, res.error.message)
				: ok(res.result);
		}
		default:
			return err(-32601, `Method not found: ${msg.method}`);
	}
}
