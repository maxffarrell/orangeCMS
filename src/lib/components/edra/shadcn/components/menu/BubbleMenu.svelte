<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { commands } from '../../../commands/index.js';
	import {
		BubbleMenu,
		getEditor,
		isTextSelection,
		useEditorTransaction
	} from '../../../tiptap/index.js';
	import { cn } from '#lib/utils.js';
	import Tooltip from '../Tooltip.svelte';
	import Link from '../tools/Link.svelte';
	import type { EditorView } from '@tiptap/pm/view';
	import type { EditorState } from '@tiptap/pm/state';
	import type { Editor } from '@tiptap/core';
	interface Props {
		class?: string;
	}
	const { class: className }: Props = $props();

	const editor = getEditor();

	const transaction = useEditorTransaction(editor);
	const commandsKeys = Object.keys(commands).filter(
		(c) => !['undo-redo', 'headings'].includes(c)
	);

	function isActive(command: (typeof commands)[string][number]): boolean {
		void transaction.version;
		return command.isActive?.(editor) ?? false;
	}
	function isClickable(command: (typeof commands)[string][number]): boolean {
		void transaction.version;
		return command.clickable?.(editor) ?? true;
	}
	const shouldShow = (props: {
		editor: Editor;
		element: HTMLElement;
		view: EditorView;
		state: EditorState;
		oldState?: EditorState;
		from: number;
		to: number;
	}) => {
		const { editor: propsEditor, view, state } = props;

		if (!propsEditor || !propsEditor.isEditable) return false;
		if (!view || view.dragging) return false;

		if (propsEditor.isActive('link')) return false;
		if (propsEditor.isActive('codeBlock')) return false;

		const { selection, doc } = state;
		const { empty, from, to } = selection;

		if (empty) return false;

		// Sometime check for `empty` is not enough.
		// Doubleclick an empty paragraph returns a node size of 2.
		// So we check also for an empty text size.
		const isEmptyTextBlock = !doc.textBetween(from, to).length && isTextSelection(selection);
		if (isEmptyTextBlock) return false;

		return true;
	};
</script>

<BubbleMenu
	pluginKey="edra-bubble-menu"
	{editor}
	{shouldShow}
	options={{
		shift: true,
		autoPlacement: {
			allowedPlacements: ['top', 'top-end', 'top-start']
		},
		strategy: 'absolute',
		scrollTarget: editor.view.dom.parentElement ?? window
	}}
	class={cn('flex w-fit items-center rounded-lg border bg-popover', className)}
>
	<Separator orientation="vertical" class="h-4!" />
	{#each commandsKeys as key (key)}
		{@const group = commands[key]}
			{#each group as command, idx (idx)}
				{#if command.name === 'paragraph'}
					<span></span>
				{:else if command.name === 'link'}
					<Link />
				{:else}
					{@const Icon = command.icon}
					<Tooltip tooltip={command.tooltip} shortCut={command.shortCut ?? ''}>
						<Button
							variant="ghost"
							size="icon"
							class={cn(isActive(command) && 'bg-muted text-primary')}
							disabled={!isClickable(command)}
							onclick={() => {
								command.onClick?.(editor);
							}}
						>
							<Icon />
						</Button>
					</Tooltip>
				{/if}
			{/each}
			<Separator orientation="vertical" class="h-4!" />
	{/each}
</BubbleMenu>
