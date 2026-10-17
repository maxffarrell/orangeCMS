import { env } from 'cloudflare:workers';
import { error } from '@sveltejs/kit';
import { putFile, InvalidFileKeyError } from '#lib/server/files.js';
import { LIMITS } from '#lib/server/limits.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!env.FILES_KV) error(503, 'File storage unavailable');

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

	const base =
		file.name
			.replace(/\.[^.]+$/, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 100) || 'file';
	const key = `${prefix}${base}-${crypto.randomUUID()}.${ext}`;

	try {
		await putFile(env.FILES_KV, key, await file.arrayBuffer(), file.type);
	} catch (failure) {
		if (failure instanceof InvalidFileKeyError)
			error(400, 'Invalid storage prefix');
		error(503, 'File storage unavailable');
	}

	return Response.json({ path: `/files/${key}` });
};
