<script lang="ts">
	import { Edra, createEditor } from '#lib/components/edra/shadcn/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { cn } from '#lib/utils.js';

	// Rich-text editing for Markdown content, built on Edra (Tiptap). Markdown goes in and comes
	// out; the hidden input posts it with the surrounding <form>, and it also renders server-side
	// so the form still holds the saved value before the editor hydrates.
	interface Props {
		name?: string;
		value?: string;
		content?: string;
		placeholder?: string;
		class?: string;
		toolbar?: boolean;
		minHeight?: string;
	}

	let {
		name = '',
		value = '',
		content = $bindable(''),
		placeholder = 'Enter your message...',
		class: className = '',
		toolbar = true,
		minHeight = '200px'
	}: Props = $props();

	const initial = value || content;
	let markdown = $state(initial);
	$effect(() => {
		content = markdown;
	});

	const editor = createEditor({
		content: initial,
		placeholder,
		onUpdate: (md) => (markdown = md)
	});
</script>

<div class={cn('rounded-md border bg-background shadow-sm', className)}>
	{#if editor}
		<Edra {editor}>
			{#if toolbar}
				<div class="sticky top-0 z-10 rounded-t-md border-b bg-card p-1.5">
					<Edra.Toolbar class="w-full flex-wrap gap-1" />
				</div>
			{/if}
			<Edra.BubbleMenu />
			<Edra.Content class="prose prose-sm sm:prose-base max-w-none p-4 focus:outline-none" style="min-height: {minHeight}" />
		</Edra>
	{:else}
		<Textarea
			class="block w-full resize-y rounded-none border-0 bg-transparent p-4 font-mono text-sm shadow-none"
			style="min-height: {minHeight}"
			{placeholder}
			bind:value={markdown}
		/>
	{/if}
	<input type="hidden" {name} value={markdown} />
</div>
