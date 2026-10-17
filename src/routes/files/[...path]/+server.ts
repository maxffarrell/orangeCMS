import { env } from 'cloudflare:workers';
import { error } from '@sveltejs/kit';
import { getFile, InvalidFileKeyError } from '#lib/server/files.js';
import type { RequestHandler } from './$types';

const serve: RequestHandler = async ({ params, request }) => {
	let file;
	try {
		file = await getFile(env.FILES_KV, params.path);
	} catch (failure) {
		if (failure instanceof InvalidFileKeyError) error(404, 'File not found');
		error(503, 'File storage unavailable');
	}
	if (!file) error(404, 'File not found');
	const etag = `"${file.metadata.sha256}"`;
	const headers = {
		'content-type': file.metadata.contentType,
		'cache-control': 'public, max-age=31536000, immutable',
		etag: etag,
		'x-content-type-options': 'nosniff',
	};
	const matches = request.headers
		.get('If-None-Match')
		?.split(',')
		.some(
			(value) =>
				value.trim() === '*' || value.trim().replace(/^W\//, '') === etag,
		);
	if (matches) return new Response(null, { status: 304, headers });
	return new Response(request.method === 'HEAD' ? null : file.body, {
		headers: { ...headers, 'content-length': String(file.metadata.size) },
	});
};
export const GET = serve;
export const HEAD = serve;
