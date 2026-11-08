import { site } from '#lib/site.js';
import type { AgentConfig } from '#lib/agent.js';
import { DEFAULT_CONTENT_SIGNALS } from '#lib/agent.js';
import type { Handle } from '@sveltejs/kit/hooks';

/** `site.agent` is optional so consumer site.ts files that predate it keep working. */
export const agentConfig = (): AgentConfig => (site as { agent?: AgentConfig }).agent ?? {};
export const contentSignals = () => agentConfig().contentSignals ?? DEFAULT_CONTENT_SIGNALS;

/** The skill served to agents: the site's own, else a generic one built from its identity. */
export function agentSkill() {
	const configured = agentConfig().skill;
	if (configured) return configured;
	const slug =
		site.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
	return {
		name: slug,
		description: `Find and read the public content of ${site.name} via the website or its MCP endpoint.`,
		body: `---\nname: ${slug}\ndescription: Find and read the public content of ${site.name} via the website or its MCP endpoint.\n---\n\n# ${site.name}\n\n${site.description}\n\n## Read the site\n\n- Every public page can be fetched as Markdown by sending \`Accept: text/markdown\`.\n- \`/sitemap.xml\` lists all public pages.\n\n## MCP\n\n\`POST /mcp\` (Streamable HTTP, JSON) exposes published content with no credentials. Call \`tools/list\` to discover tools. Administrative access is at \`/mcp/authorized\` with OAuth (\`/.well-known/oauth-authorization-server\`); request edit scope only when editing is the task.\n`
	};
}

export async function sha256Hex(text: string): Promise<string> {
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** RFC 8288 Link header advertising the machine-readable descriptions of the site. */
export const DISCOVERY_LINKS = [
	'</.well-known/api-catalog>; rel="api-catalog"',
	'</sitemap.xml>; rel="sitemap"; type="application/xml"',
	'</.well-known/mcp/server-card.json>; rel="describedby"; type="application/json"',
	'</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"'
].join(', ');

const SKIP = /^\/(admin|api|mcp|oauth|files|\.well-known|cdn-cgi|_app)(\/|$)/;

/** Whether the client prefers Markdown over HTML (Accept: text/markdown). */
export function wantsMarkdown(accept: string | null): boolean {
	if (!accept) return false;
	let md = 0;
	let html = 0;
	for (const part of accept.split(',')) {
		const [type, ...params] = part.trim().toLowerCase().split(';');
		const q = Number(params.map((p) => p.trim()).find((p) => p.startsWith('q='))?.slice(2) ?? 1);
		if (type === 'text/markdown') md = Math.max(md, q);
		else if (type === 'text/html' || type === 'application/xhtml+xml') html = Math.max(html, q);
	}
	return md > 0 && md >= html;
}

const decode = (s: string) =>
	s
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&amp;/g, '&');

/** Small, dependency-free HTML to Markdown conversion for server-rendered pages. */
export function htmlToMarkdown(html: string, origin: string): string {
	const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '');
	let body = /<main[\s\S]*?>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
	body = body
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(script|style|svg|nav|footer|form|noscript|template|button)\b[\s\S]*?<\/\1>/gi, '');
	const abs = (href: string) => {
		try { return new URL(href, origin).href; } catch { return href; }
	};
	body = body
		.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => `\n\n${'#'.repeat(Number(l))} ${t}\n\n`)
		.replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => (t.replace(/<[^>]+>/g, '').trim() ? `[${t.replace(/<[^>]+>/g, '').trim()}](${abs(decode(h))})` : ''))
		.replace(/<img\b[^>]*?alt="([^"]*)"[^>]*>/gi, (_, a) => (a ? `*${a}*` : ''))
		.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
		.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
		.replace(/<li\b[^>]*>/gi, '\n- ')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|section|article|ul|ol|tr|header|figure|blockquote)>/gi, '\n\n')
		.replace(/<[^>]+>/g, '');
	const text = decode(body)
		.split('\n')
		.map((l) => l.replace(/[ \t]+/g, ' ').trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return (/^# /m.test(text) || !title ? text : `# ${title}\n\n${text}`) + '\n';
}

/** Adds discovery Link headers to pages and serves Markdown to clients that ask for it. */
export const agentReadiness: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const readOnly = event.request.method === 'GET' || event.request.method === 'HEAD';
	if (!readOnly || SKIP.test(event.url.pathname) || response.status !== 200) return response;
	if (!response.headers.get('content-type')?.includes('text/html')) return response;
	if (!wantsMarkdown(event.request.headers.get('accept'))) {
		const headers = new Headers(response.headers);
		headers.append('Link', DISCOVERY_LINKS);
		return new Response(response.body, { status: response.status, headers });
	}
	const markdown = htmlToMarkdown(await response.text(), event.url.origin);
	const headers = new Headers(response.headers);
	headers.set('Content-Type', 'text/markdown; charset=utf-8');
	headers.set('Vary', 'Accept');
	headers.set('x-markdown-tokens', String(Math.ceil(markdown.length / 4)));
	headers.append('Link', DISCOVERY_LINKS);
	headers.delete('content-length');
	headers.delete('content-encoding');
	return new Response(event.request.method === 'HEAD' ? null : markdown, { status: 200, headers });
};
