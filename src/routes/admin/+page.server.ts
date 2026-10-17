import { env } from 'cloudflare:workers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = env.DB;
	if (!db) return { tourCount: 0, pageCount: 0, formCount: 0 };

	const [tours, pages, forms] = await Promise.all([
		db.prepare('SELECT COUNT(*) as count FROM tours WHERE active = 1').first<{ count: number }>(),
		db.prepare('SELECT COUNT(*) as count FROM pages').first<{ count: number }>(),
		db.prepare('SELECT COUNT(*) as count FROM forms').first<{ count: number }>()
	]);

	return {
		tourCount: tours?.count ?? 0,
		pageCount: pages?.count ?? 0,
		formCount: forms?.count ?? 0
	};
};
