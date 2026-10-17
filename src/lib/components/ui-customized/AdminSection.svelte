<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '#lib/components/ui/card/index.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		title?: string;
		description?: string;
		class?: string;
		contentClass?: string;
		children: Snippet;
	}
	let { title, description, class: className, contentClass, children }: Props = $props();
</script>

<Card
	class={cn(
		'gap-0 rounded-xl border border-cream-dark bg-card py-0 shadow-[0_1px_2px_rgba(11,29,53,0.04)] ring-0',
		className
	)}
>
	{#if title}
		<CardHeader class="gap-1 border-b border-cream-dark bg-cream/30 px-6 pt-5 pb-4">
			<div class="flex items-center gap-4">
				<CardTitle class="font-display text-[1.05rem] leading-none font-light text-heading italic">
					{title}
				</CardTitle>
				<span class="h-px flex-1 bg-gold/25"></span>
			</div>
			{#if description}
				<CardDescription class="text-[0.72rem] text-text-light">{description}</CardDescription>
			{/if}
		</CardHeader>
	{/if}
	<CardContent class={cn('px-6 py-5', contentClass)}>
		{@render children()}
	</CardContent>
</Card>
