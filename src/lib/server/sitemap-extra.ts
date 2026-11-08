import type { D1Database } from '@cloudflare/workers-types';

/**
 * Public URLs that live outside `site.routes` (a consumer's own routes) and belong in
 * /sitemap.xml. Consumers replace this file; the shared core has none.
 */
export interface SitemapEntry {
	path: string;
	lastmod?: string;
}
export async function extraSitemapEntries(_db: D1Database): Promise<SitemapEntry[]> {
	return [];
}
