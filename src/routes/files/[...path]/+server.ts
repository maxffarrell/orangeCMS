import { env } from 'cloudflare:workers';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const r2 = env.FILES;
	if (!r2) error(503, 'File storage unavailable');

	const obj = await r2.get(params.path);
	if (!obj) error(404, 'File not found');

	const contentType = obj.httpMetadata?.contentType ?? 'application/octet-stream';

	return new Response(await obj.arrayBuffer(), {
		headers: {
			'content-type': contentType,
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
};
