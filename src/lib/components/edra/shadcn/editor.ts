import type { Extensions } from '@tiptap/core';
import { getDefaultExtensions } from '../extensions.ts';
import { useEditor } from '../tiptap/index.ts';

export interface EdraEditorProps {
	extensions?: Extensions;
	/** Initial content, interpreted as Markdown. */
	content?: string;
	placeholder?: string;
	onUpdate?: (markdown: string) => void;
}

/** Markdown-first Edra editor: content goes in and comes out as Markdown. */
export const createEditor = (props: EdraEditorProps = {}) => {
	const editor = useEditor({
		extensions: [...getDefaultExtensions({ placeholder: props.placeholder }), ...(props.extensions ?? [])],
		content: props.content ?? '',
		contentType: 'markdown',
		onUpdate: ({ editor: ed }) => props.onUpdate?.(ed.getMarkdown())
	});
	return editor;
};
