import TiptapRoot from './components/Tiptap.svelte';
import TiptapContent from './components/TiptapContent.svelte';

export { default as EditorContent } from './components/EditorContent.svelte';
export { getEditor } from './components/editorContext.js';
export { Editor } from './Editor.ts';
export { useEditor } from './hooks/useEditor.svelte.js';
export { useEditorState } from './hooks/useEditorState.svelte.js';
export { useEditorTransaction } from './hooks/useEditorTransaction.svelte.js';

export const Tiptap = Object.assign(TiptapRoot, { Content: TiptapContent });

export * from '@tiptap/core';
export * from './components/menus/index.ts';
