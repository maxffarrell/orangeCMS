<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		Breadcrumb,
		BreadcrumbItem,
		BreadcrumbLink,
		BreadcrumbList,
		BreadcrumbPage,
		BreadcrumbSeparator
	} from '#lib/components/ui/breadcrumb/index.js';

	interface Crumb {
		label: string;
		href?: string;
	}

	interface Props {
		title: string;
		eyebrow?: string;
		description?: string;
		meta?: string;
		breadcrumbs?: Crumb[];
		actions?: Snippet;
	}

	let { title, eyebrow, description, meta, breadcrumbs, actions }: Props = $props();
</script>

<header class="mb-8">
	{#if breadcrumbs?.length}
		<Breadcrumb class="mb-5">
			<BreadcrumbList class="text-[0.72rem]">
				{#each breadcrumbs as crumb, i}
					<BreadcrumbItem>
						{#if crumb.href && i < breadcrumbs.length - 1}
							<BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
						{:else}
							<BreadcrumbPage class="max-w-[24ch] truncate">{crumb.label}</BreadcrumbPage>
						{/if}
					</BreadcrumbItem>
					{#if i < breadcrumbs.length - 1}
						<BreadcrumbSeparator />
					{/if}
				{/each}
			</BreadcrumbList>
		</Breadcrumb>
	{/if}

	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="min-w-0">
			{#if eyebrow}
				<p class="mb-2 font-body text-[0.58rem] tracking-[0.28em] text-gold uppercase">{eyebrow}</p>
			{/if}
			<h1 class="font-display text-[2.2rem] leading-[1.05] font-light text-heading italic">{title}</h1>
			{#if meta}
				<p class="mt-1.5 font-mono text-[0.7rem] text-text-light">{meta}</p>
			{/if}
			{#if description}
				<p class="mt-2 max-w-[60ch] text-[0.8rem] text-text-light">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex shrink-0 items-center gap-2">
				{@render actions()}
			</div>
		{/if}
	</div>
	<div class="mt-4 h-px bg-gradient-to-r from-gold/40 via-gold/15 to-transparent"></div>
</header>
