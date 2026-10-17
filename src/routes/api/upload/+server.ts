import { env } from 'cloudflare:workers';
import { error } from '@sveltejs/kit';
import { LIMITS } from '#lib/server/limits.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const r2 = env.FILES;
	if (!r2) error(503, 'File storage unavailable');

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const prefix = String(formData.get('prefix') ?? '');
	if (prefix && !/^(?:[a-z0-9_-]+\/)+$/i.test(prefix))
		error(400, 'Invalid storage prefix');

	if (!(file instanceof File) || file.size === 0)
		error(400, 'No file provided');

	const isImage = file.type.startsWith('image/');
	const allowedTypes = isImage
		? LIMITS.upload.allowedImageTypes
		: LIMITS.upload.allowedPdfTypes;
	const maxBytes = isImage
		? LIMITS.upload.maxImageBytes
		: LIMITS.upload.maxPdfBytes;

	if (!(allowedTypes as readonly string[]).includes(file.type)) {
		error(
			415,
			`Unsupported file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}`,
		);
	}

	if (file.size > maxBytes) {
		const mb = (maxBytes / 1024 / 1024).toFixed(0);
		error(413, `File too large. Maximum size is ${mb} MB`);
	}

	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	const allowedExtensions = isImage
		? LIMITS.upload.allowedImageExtensions
		: LIMITS.upload.allowedPdfExtensions;

	if (!(allowedExtensions as readonly string[]).includes(ext)) {
		error(
			415,
			`Unsupported file extension: .${ext}. Allowed: ${allowedExtensions.join(', ')}`,
		);
	}

	const base = file.name
		.replace(/\.[^.]+$/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	const key = `${prefix}${base}-${Date.now()}.${ext}`;

	await r2.put(key, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type },
	});

	return Response.json({ path: `/files/${key}` });
};
