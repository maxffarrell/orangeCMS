import { env } from 'cloudflare:workers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = env.DB;
	if (!db) return { pages: [] };
	const result = await db
		.prepare('SELECT slug, title, eyebrow, updated_at FROM pages ORDER BY id')
		.all<{ slug: string; title: string; eyebrow: string | null; updated_at: string }>();
	return { pages: result.results };
};
