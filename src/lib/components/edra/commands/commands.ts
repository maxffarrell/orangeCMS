import Bold from '@lucide/svelte/icons/bold';
import Code from '@lucide/svelte/icons/code';
import Heading1 from '@lucide/svelte/icons/heading-1';
import Heading2 from '@lucide/svelte/icons/heading-2';
import Heading3 from '@lucide/svelte/icons/heading-3';
import Italic from '@lucide/svelte/icons/italic';
import Link from '@lucide/svelte/icons/link-2';
import List from '@lucide/svelte/icons/list';
import ListOrdered from '@lucide/svelte/icons/list-ordered';
import Pilcrow from '@lucide/svelte/icons/pilcrow';
import Quote from '@lucide/svelte/icons/quote';
import Redo from '@lucide/svelte/icons/redo-2';
import StrikeThrough from '@lucide/svelte/icons/strikethrough';
import Undo from '@lucide/svelte/icons/undo-2';
import { isTextSelection } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { ISMAC } from '../utils.js';
import strings from '../strings.js';
import { type Editor } from '../tiptap/index.ts';
import { FileCode } from '@lucide/svelte';
import type { Component } from 'svelte';

export interface EdraCommand {
	name: string;
	icon: Component<{ class?: string }>;
	tooltip: string;
	shortCut?: string;
	onClick?: (editor: Editor) => void;
	turnInto?: (editor: Editor, node: Node, pos: number) => void;
	isActive?: (editor: Editor) => boolean;
	clickable?: (editor: Editor) => boolean;
}

export const commands: Record<string, EdraCommand[]> = {
	'undo-redo': [
		{
			icon: Undo,
			name: 'undo',
			tooltip: strings.command.undo,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}Z`,
			onClick: (editor) => {
				editor.chain().focus().undo().run();
			},
			clickable: (editor) => {
				return editor.can().undo();
			}
		},
		{
			icon: Redo,
			name: 'redo',
			tooltip: strings.command.redo,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}Y`,
			onClick: (editor) => {
				editor.chain().focus().redo().run();
			},
			clickable: (editor) => {
				return editor.can().redo();
			}
		}
	],
	headings: [
		{
			icon: Heading1,
			name: 'h1',
			tooltip: strings.command.h1,
			shortCut: `${ISMAC ? '⌘⌥' : 'Ctrl+Alt+'}1`,
			onClick: (editor) => {
				editor.chain().focus().toggleHeading({ level: 1 }).run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setHeading({ level: 1 }).run();
			},
			clickable: (editor) => {
				return editor.can().toggleHeading({ level: 1 });
			},
			isActive: (editor) => {
				return editor.isActive('heading', { level: 1 });
			}
		},
		{
			icon: Heading2,
			name: 'h2',
			tooltip: strings.command.h2,
			shortCut: `${ISMAC ? '⌘⌥' : 'Ctrl+Alt+'}2`,
			onClick: (editor) => {
				editor.chain().focus().toggleHeading({ level: 2 }).run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setHeading({ level: 2 }).run();
			},
			clickable: (editor) => {
				return editor.can().toggleHeading({ level: 2 });
			},
			isActive: (editor) => {
				return editor.isActive('heading', { level: 2 });
			}
		},
		{
			icon: Heading3,
			name: 'h3',
			tooltip: strings.command.h3,
			shortCut: `${ISMAC ? '⌘⌥' : 'Ctrl+Alt+'}3`,
			onClick: (editor) => {
				editor.chain().focus().toggleHeading({ level: 3 }).run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setHeading({ level: 3 }).run();
			},
			clickable: (editor) => {
				return editor.can().toggleHeading({ level: 3 });
			},
			isActive: (editor) => {
				return editor.isActive('heading', { level: 3 });
			}
		},
	],
	'text-formatting': [
		{
			icon: Link,
			name: 'link',
			tooltip: strings.command.link,
			onClick: (editor) => {
				if (editor.isActive('link')) {
					editor.chain().focus().unsetLink().run();
				} else {
					const url = window.prompt('Enter the URL of the link:');
					if (url) {
						editor.chain().focus().toggleLink({ href: url }).run();
					}
				}
			},
			isActive: (editor) => {
				return editor.isActive('link');
			}
		},
		{
			icon: Pilcrow,
			name: 'paragraph',
			tooltip: 'Paragraph',
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}0`,
			onClick: (editor) => {
				editor.chain().focus().setParagraph().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setParagraph().run();
			},
			clickable: (editor) => {
				return editor.can().setParagraph();
			},
			isActive: (editor) => {
				return editor.isActive('paragraph');
			}
		},
		{
			icon: Bold,
			name: 'bold',
			tooltip: strings.command.bold,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}B`,
			onClick: (editor) => {
				editor.chain().focus().toggleBold().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setMark('bold').run();
			},
			clickable: (editor) => {
				return editor.can().toggleBold();
			},
			isActive: (editor) => {
				return editor.isActive('bold');
			}
		},
		{
			icon: Italic,
			name: 'italic',
			tooltip: strings.command.italic,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}I`,
			onClick: (editor) => {
				editor.chain().focus().toggleItalic().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setMark('italic').run();
			},
			clickable: (editor) => {
				return editor.can().toggleItalic();
			},
			isActive: (editor) => {
				return editor.isActive('italic');
			}
		},
		{
			icon: StrikeThrough,
			name: 'strikethrough',
			tooltip: strings.command.strikethrough,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}S`,
			onClick: (editor) => {
				editor.chain().focus().toggleStrike().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).setMark('strike').run();
			},
			clickable: (editor) => {
				return editor.can().toggleStrike();
			},
			isActive: (editor) => {
				return editor.isActive('strike');
			}
		},
		{
			icon: Quote,
			name: 'blockQuote',
			tooltip: strings.command.blockQuote,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}B`,
			onClick: (editor) => {
				editor.chain().focus().toggleBlockquote().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleBlockquote().run();
			},
			clickable: (editor) => {
				return editor.can().toggleBlockquote();
			},
			isActive: (editor) => {
				return editor.isActive('blockquote');
			}
		},
		{
			icon: Code,
			name: 'code',
			tooltip: strings.command.code,
			shortCut: `${ISMAC ? '⌘' : 'Ctrl+'}E`,
			onClick: (editor) => {
				editor.chain().focus().toggleCode().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleCodeBlock().run();
			},
			clickable: (editor) => {
				return editor.can().toggleCode();
			},
			isActive: (editor) => {
				return editor.isActive('code');
			}
		},
		{
			icon: FileCode,
			name: 'codeBlock',
			tooltip: strings.command.codeBlock,
			shortCut: `${ISMAC ? '⌘⌥' : 'Ctrl+Shift+'}C`,
			onClick: (editor) => {
				editor.chain().focus().toggleCodeBlock({ language: 'plaintext' }).run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleCodeBlock({ language: 'plaintext' }).run();
			},
			clickable: (editor) => {
				return editor.can().toggleCodeBlock({ language: 'plaintext' });
			},
			isActive: (editor) => {
				return editor.isActive('codeBlock');
			}
		},
	],
	lists: [
		{
			icon: List,
			name: 'bulletList',
			tooltip: strings.command.bulletList,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}8`,
			onClick: (editor) => {
				editor.chain().focus().toggleBulletList().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleBulletList().run();
			},
			isActive: (editor) => editor.isActive('bulletList')
		},
		{
			icon: ListOrdered,
			name: 'orderedList',
			tooltip: strings.command.orderedList,
			shortCut: `${ISMAC ? '⌘⇧' : 'Ctrl+Shift+'}7`,
			onClick: (editor) => {
				editor.chain().focus().toggleOrderedList().run();
			},
			turnInto: (editor, node, pos) => {
				editor.chain().setNodeSelection(pos).toggleOrderedList().run();
			},
			clickable: (editor) => {
				return editor.can().toggleOrderedList();
			},
			isActive: (editor) => {
				return editor.isActive('orderedList');
			}
		},
	]
};
