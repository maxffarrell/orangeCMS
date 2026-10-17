import { marked } from 'marked';
import type { Settings } from '#lib/server/db.js';

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(char) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
				char
			]!,
	);

/** Insert configured public settings as text after rendering Markdown. */
export function renderContent(content: string, settings: Settings): string {
	const values: string[] = [];
	// Placeholders become opaque tokens before parsing, so setting values cannot
	// introduce Markdown, HTML, or attributes into the rendered document.
	const source = content.replace(
		/\{\{setting:([a-z][a-z0-9_]*)\}\}/g,
		(_, key: string) => {
			values.push(escapeHtml(settings[key] ?? ''));
			return `ORANGECMSSETTINGTOKEN${values.length - 1}END`;
		},
	);
	const html = marked(source) as string;
	return html.replace(
		/<[^>]*>|ORANGECMSSETTINGTOKEN(\d+)END/g,
		(part, index: string | undefined) =>
			index === undefined
				? part.replace(/ORANGECMSSETTINGTOKEN\d+END/g, '')
				: (values[Number(index)] ?? part),
	);
}
