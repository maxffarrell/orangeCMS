<script lang="ts">
	import { site } from '#lib/site.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import {
		Table,
		TableHeader,
		TableBody,
		TableRow,
		TableHead,
		TableCell,
	} from '#lib/components/ui/table/index.js';
	import {
		Empty,
		EmptyDescription,
		EmptyHeader,
		EmptyMedia,
		EmptyTitle,
	} from '#lib/components/ui/empty/index.js';
	import { AdminPageHeader } from '#lib/components/ui-customized/index.js';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const headClass =
		'text-[0.58rem] tracking-[0.25em] uppercase text-text-light';
</script>

<svelte:head><title>Pages — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 py-10 max-w-4xl">
	<AdminPageHeader
		eyebrow="Content"
		title="Pages"
		meta="{data.pages.length} {data.pages.length === 1 ? 'page' : 'pages'}"
		description="Edit the headline, intro, and body copy for each public page."
	/>

	{#if form && 'error' in form}<p role="alert">{form.error}</p>{/if}
	<form
		method="POST"
		action="?/create"
		class="mb-8 flex flex-wrap items-end gap-4"
	>
		<label
			>Title<input
				name="title"
				required
				class="block rounded border border-border bg-background p-2"
			/></label
		><label
			>Slug<input
				name="slug"
				pattern="[a-z0-9]+(-[a-z0-9]+)*"
				required
				class="block rounded border border-border bg-background p-2"
			/></label
		><Button type="submit">Create page</Button>
	</form>
	<Card
		class="rounded-xl shadow-none ring-0 border border-cream-dark overflow-hidden bg-card py-0 gap-0"
	>
		<CardContent class="p-0">
			{#if data.pages.length === 0}
				<Empty class="border-0 py-16">
					<EmptyHeader>
						<EmptyMedia variant="icon"><FileTextIcon /></EmptyMedia>
						<EmptyTitle class="font-display text-[1.3rem] italic font-light"
							>No pages on record</EmptyTitle
						>
						<EmptyDescription
							>Create a page below, then map its slug to a public path in your
							site configuration.</EmptyDescription
						>
					</EmptyHeader>
				</Empty>
			{:else}
				<Table>
					<TableHeader>
						<TableRow
							class="border-b border-gold/30 bg-[#f5ede0]/50 hover:bg-[#f5ede0]/50 dark:bg-white/[0.03]"
						>
							<TableHead class="pl-5 {headClass}">Page</TableHead>
							<TableHead class="hidden lg:table-cell {headClass}"
								>Last Updated</TableHead
							>
							<TableHead class="pr-5 {headClass}"
								><span class="sr-only">Actions</span></TableHead
							>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each data.pages as p (p.slug)}
							<TableRow
								class="border-b border-cream-dark last:border-0 hover:bg-cream/40"
							>
								<TableCell class="pl-5">
									<a
										href="/admin/pages/{p.slug}"
										class="font-body text-[0.9rem] font-medium text-heading hover:text-link transition-colors"
										>{p.title}</a
									>
									{#if p.eyebrow}
										<div
											class="font-body text-[0.65rem] tracking-[0.12em] uppercase text-text-light mt-0.5"
										>
											{p.eyebrow}
										</div>
									{/if}
								</TableCell>
								<TableCell class="hidden lg:table-cell">
									<span class="text-[0.75rem] text-text-light">
										{p.updated_at
											? new Date(p.updated_at).toLocaleDateString('en-US', {
													month: 'short',
													day: 'numeric',
													year: 'numeric',
												})
											: '—'}
									</span>
								</TableCell>
								<TableCell class="pr-5 text-right">
									<Button
										variant="ghost"
										size="sm"
										href="/admin/pages/{p.slug}"
										class="text-text-mid hover:text-heading"
									>
										<PencilIcon data-icon="inline-start" />
										<span class="max-sm:sr-only">Edit</span>
									</Button>
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</CardContent>
	</Card>
</div>
