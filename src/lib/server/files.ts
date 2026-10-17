import type { KVNamespace } from '@cloudflare/workers-types';

// KV only: the account must remain on Workers Free for provider-enforced free
// limits. No application setting can enforce the account's billing plan.
export const FILE_KEY_PREFIX = 'orangecms:files:';
const MAX_VALUE_BYTES = 25 * 1024 * 1024;
export interface FileMetadata {
	contentType: string;
	size: number;
	sha256: string;
	uploadedAt: string;
}
export interface StoredFile {
	body: ArrayBuffer;
	metadata: FileMetadata;
}
export type FileStorage = Pick<KVNamespace, 'getWithMetadata' | 'put'>;
export class InvalidFileKeyError extends Error {}
export class FileStorageUnavailableError extends Error {}

export function getFileStorageKey(key: string): string {
	const stored = FILE_KEY_PREFIX + key;
	if (
		!key ||
		/[\\\x00-\x1f\x7f]/.test(key) ||
		key.split('/').some((part) => !part || part === '.' || part === '..') ||
		new TextEncoder().encode(stored).byteLength > 512
	) {
		throw new InvalidFileKeyError('Invalid file key');
	}
	return stored;
}
const digest = async (body: ArrayBuffer): Promise<string> =>
	[...new Uint8Array(await crypto.subtle.digest('SHA-256', body))]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
function validContentType(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length <= 200 &&
		/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[\x20-\x7e]*)?$/i.test(value)
	);
}
export async function putFile(
	storage: FileStorage | undefined,
	key: string,
	body: ArrayBuffer,
	contentType: string,
): Promise<FileMetadata> {
	const stored = getFileStorageKey(key);
	if (!storage)
		throw new FileStorageUnavailableError('File storage unavailable');
	if (!validContentType(contentType) || body.byteLength > MAX_VALUE_BYTES)
		throw new Error('Invalid file data');
	const metadata: FileMetadata = {
		contentType,
		size: body.byteLength,
		sha256: await digest(body),
		uploadedAt: new Date().toISOString(),
	};
	try {
		await storage.put(stored, body, { metadata });
	} catch {
		throw new FileStorageUnavailableError(
			'File storage unavailable or its free limit has been reached',
		);
	}
	return metadata;
}
export async function getFile(
	storage: FileStorage | undefined,
	key: string,
): Promise<StoredFile | null> {
	const stored = getFileStorageKey(key);
	if (!storage)
		throw new FileStorageUnavailableError('File storage unavailable');
	try {
		const result = await storage.getWithMetadata<FileMetadata>(stored, {
			type: 'arrayBuffer',
		});
		if (result.value === null) return null;
		const metadata = result.metadata;
		if (
			!metadata ||
			!validContentType(metadata.contentType) ||
			metadata.size !== result.value.byteLength ||
			!/^[a-f0-9]{64}$/.test(metadata.sha256) ||
			!Number.isFinite(Date.parse(metadata.uploadedAt))
		) {
			throw new FileStorageUnavailableError('File metadata unavailable');
		}
		return { body: result.value, metadata };
	} catch {
		throw new FileStorageUnavailableError(
			'File storage unavailable or its free limit has been reached',
		);
	}
}
