import { sanitizeFields, slugifyFormSlug } from '../forms.js';
import type { SaveFormInput } from './db.js';

const text = (data: FormData, name: string) => ((data.get(name) as string | null) ?? '').trim();

/** Parse the admin form editor POST into a validated SaveFormInput. */
export function parseFormInput(data: FormData, id?: number): SaveFormInput | { error: string } {
	const title = text(data, 'title');
	if (!title) return { error: 'Title is required' };

	const online = text(data, 'mode') === 'online';
	const file_path = text(data, 'file_path');
	if (!online && !file_path) return { error: 'Upload a PDF, or switch this form to an online form' };

	let schema: SaveFormInput['online'] = null;
	if (online) {
		let raw: unknown;
		try {
			raw = JSON.parse(text(data, 'fields') || '[]');
		} catch {
			return { error: 'Form fields could not be read. Please reload and try again.' };
		}
		const { fields, error } = sanitizeFields(raw);
		if (error) return { error };
		if (!fields.some((f) => f.type !== 'heading')) return { error: 'Add at least one question' };
		schema = {
			slug: slugifyFormSlug(text(data, 'slug') || title),
			fields,
			submit_label: text(data, 'submit_label').slice(0, 60) || null,
			success_message: text(data, 'success_message').slice(0, 1000) || null,
			accepting: data.get('accepting') === '0' ? 0 : 1
		};
	}

	return {
		id,
		title: title.slice(0, 200),
		description: text(data, 'description').slice(0, 500) || null,
		file_path,
		featured: data.get('featured') === '1' ? 1 : 0,
		sort_order: parseInt(text(data, 'sort_order')) || 0,
		online: schema
	};
}
