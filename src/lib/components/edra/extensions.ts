import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import Typography from '@tiptap/extension-typography';
import { Markdown } from '@tiptap/markdown';
import strings from './strings.ts';

// orangeCMS trims Edra's default set to what Markdown can represent, because page and entry
// content is stored (and rendered on the public site) as Markdown. Colors, alignment, underline,
// sub/superscript, embeds, AI, math and diagrams are intentionally left out: they would be lost
// on save. Every extension here round-trips through @tiptap/markdown.
export interface DefaultExtensionsOptions {
	placeholder?: string;
}

export function getDefaultExtensions(
	options: DefaultExtensionsOptions = {},
): Extensions {
	return [
		StarterKit.configure({
			orderedList: { HTMLAttributes: { class: 'list-decimal' } },
			bulletList: { HTMLAttributes: { class: 'list-disc' } },
			heading: { levels: [1, 2, 3] },
			underline: false,
			link: {
				openOnClick: false,
				autolink: true,
				linkOnPaste: true,
				// Only web/mail links; blocks javascript: and data: URLs.
				isAllowedUri: (url) => /^(https?:|mailto:|tel:|\/|#)/i.test(url),
				HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
			},
		}),
		Placeholder.configure({
			emptyEditorClass: 'is-empty',
			placeholder: ({ node }) =>
				node.type.name === 'heading'
					? strings.editor.headingPlaceholder
					: (options.placeholder ?? strings.editor.paragraphPlaceholder),
		}),
		Typography,
		Markdown,
	] as Extensions;
}

export default getDefaultExtensions();
