import { env } from 'cloudflare:workers';
import { site } from '#lib/site.js';
import { getEntries, getForms } from '#lib/server/db.js';
import { extraSitemapEntries, type SitemapEntry } from '#lib/server/sitemap-extra.js';
import type { RequestHandler } from './$types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fill = (path: string, slug: string) => path.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/, encodeURIComponent(slug));

export const GET: RequestHandler = async ({ url }) => {
	const entries = new Map<string, SitemapEntry>();
	const add = (e: SitemapEntry) => { if (!entries.has(e.path)) entries.set(e.path, e); };
	for (const r of site.routes) if (!r.path.includes(':')) add({ path: r.path });
	const db = env.DB;
	if (db) {
		try {
			for (const r of site.routes) {
				if (r.kind === 'entry' && r.collection)
					for (const e of await getEntries(db, r.collection, true))
						add({ path: fill(r.path, e.slug), lastmod: e.updated_at?.slice(0, 10) });
				if (r.kind === 'form')
					for (const f of await getForms(db)) if (f.slug) add({ path: fill(r.path, f.slug) });
			}
			for (const e of await extraSitemapEntries(db)) add(e);
		} catch {
			// Serve the static pages even if the database is unavailable.
		}
	}
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...entries.values()]
		.map((e) => `<url><loc>${esc(url.origin + e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
		.join('\n')}\n</urlset>\n`;
	return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
