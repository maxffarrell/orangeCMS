import { createHash, randomUUID } from 'node:crypto';
import {
	lstat,
	readFile,
	writeFile,
	appendFile,
	link,
	rm,
	realpath,
} from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getFileStorageKey } from '../src/lib/server/files.ts';

export const MAX_IMPORT_PAYLOAD_BYTES = 80 * 1024 * 1024;

/** Validate an offline backup and prepare Wrangler bulk JSON. Never contacts a provider. */
export async function prepareFilesImport({
	manifestPath,
	sourceDirectory,
	outputPath,
	maxPayloadBytes = MAX_IMPORT_PAYLOAD_BYTES,
}) {
	if (
		!Number.isInteger(maxPayloadBytes) ||
		maxPayloadBytes < 1024 ||
		maxPayloadBytes > MAX_IMPORT_PAYLOAD_BYTES
	)
		throw new Error('Invalid bulk payload limit');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	if (!Array.isArray(manifest.objects) || !manifest.objects.length)
		throw new Error('Manifest must contain an objects array');
	const source = await realpath(sourceDirectory);
	const destination = resolve(outputPath);
	const temporary = destination + '.tmp-' + randomUUID();
	const seen = new Set();
	let totalBytes = 0;
	let inferredTypes = 0;
	let payloadBytes = 3;
	try {
		await writeFile(temporary, '[', { flag: 'wx', mode: 0o600 });
		for (const [index, item] of manifest.objects.entries()) {
			const key = getFileStorageKey(item.key);
			if (seen.has(key)) throw new Error('Duplicate file key');
			seen.add(key);
			const path = resolve(source, item.key);
			const resolved = await realpath(path);
			const within = relative(source, resolved);
			if (
				within.startsWith('..') ||
				isAbsolute(within) ||
				(await lstat(path)).isSymbolicLink()
			)
				throw new Error('File escapes the selected backup directory');
			const bytes = await readFile(resolved);
			const hash = createHash('sha256').update(bytes).digest('hex');
			if (bytes.length !== item.size || hash !== item.sha256)
				throw new Error('Backup size or SHA-256 does not match manifest');
			if (bytes.length > 25 * 1024 * 1024)
				throw new Error('File exceeds KV value limit');
			totalBytes += bytes.length;
			if (totalBytes > 1024 * 1024 * 1024)
				throw new Error('Backup exceeds total Workers Free KV allowance');
			const suppliedType = item.contentType ?? item.http_metadata?.contentType;
			const extension = item.key.split('.').pop().toLowerCase();
			const contentType =
				suppliedType ??
				{
					pdf: 'application/pdf',
					jpg: 'image/jpeg',
					jpeg: 'image/jpeg',
					png: 'image/png',
					avif: 'image/avif',
					webp: 'image/webp',
					gif: 'image/gif',
				}[extension] ??
				'application/octet-stream';
			if (!suppliedType) inferredTypes++;
			if (
				typeof contentType !== 'string' ||
				contentType.length > 200 ||
				!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[\x20-\x7e]*)?$/i.test(
					contentType,
				)
			)
				throw new Error('Missing or invalid content type');
			const metadata = {
				contentType,
				size: bytes.length,
				sha256: hash,
				uploadedAt: new Date().toISOString(),
			};
			if (Buffer.byteLength(JSON.stringify(metadata)) > 1024)
				throw new Error('Metadata exceeds KV limit');
			const record =
				(index ? ',' : '') +
				JSON.stringify({
					key,
					value: bytes.toString('base64'),
					base64: true,
					metadata,
				});
			payloadBytes += Buffer.byteLength(record);
			if (payloadBytes > maxPayloadBytes)
				throw new Error(
					'Encoded bulk payload exceeds limit; split the manifest into reviewed batches below 80 MiB',
				);
			await appendFile(temporary, record);
		}
		await appendFile(temporary, ']\n');
		await link(temporary, destination);
		await rm(temporary);
		return {
			objects: seen.size,
			bytes: totalBytes,
			inferredTypes,
			payloadBytes,
			outputPath: destination,
		};
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const args = process.argv.slice(2);
	const option = (flag) => {
		const index = args.indexOf(flag);
		if (index < 0 || !args[index + 1]) throw new Error(`Required: ${flag}`);
		return args[index + 1];
	};
	const result = await prepareFilesImport({
		manifestPath: option('--manifest'),
		sourceDirectory: option('--source'),
		outputPath: option('--output'),
	});
	console.log(JSON.stringify(result));
	console.log(
		'Prepared locally only. Verify the deployment account is Workers Free before any import. This output contains file contents; keep it private.',
	);
}
