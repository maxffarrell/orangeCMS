<script lang="ts">
	import { site } from '#lib/site.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#lib/components/ui/table/index.js';
	import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#lib/components/ui/empty/index.js';
	import { AdminPageHeader, ConfirmDelete, StatusToggle } from '#lib/components/ui-customized/index.js';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const headClass = 'text-[0.58rem] tracking-[0.25em] uppercase text-text-light';
</script>

<svelte:head><title>Tours — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 py-10 max-w-5xl">
	<AdminPageHeader eyebrow="Content" title="Tours" meta="{data.tours.length} {data.tours.length === 1 ? 'tour' : 'tours'}">
		{#snippet actions()}
			<Button variant="gold" href="/admin/tours/new"><PlusIcon data-icon="inline-start" /> New Tour</Button>
		{/snippet}
	</AdminPageHeader>

	<Card class="rounded-xl shadow-none ring-0 border border-cream-dark overflow-hidden bg-card py-0 gap-0">
		<CardContent class="p-0">
			{#if data.tours.length === 0}
				<Empty class="border-0 py-16">
					<EmptyHeader>
						<EmptyMedia variant="icon"><GlobeIcon /></EmptyMedia>
						<EmptyTitle class="font-display text-[1.3rem] italic font-light">No tours yet</EmptyTitle>
						<EmptyDescription>Tours you add here appear on the homepage and tours page.</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="gold" href="/admin/tours/new"><PlusIcon data-icon="inline-start" /> Add your first tour</Button>
					</EmptyContent>
				</Empty>
			{:else}
				<Table>
					<TableHeader>
						<TableRow class="border-b border-gold/30 bg-[#f5ede0]/50 hover:bg-[#f5ede0]/50 dark:bg-white/[0.03]">
							<TableHead class="hidden lg:table-cell w-16 pl-5 {headClass}"><span class="sr-only">Image</span></TableHead>
							<TableHead class={headClass}>Tour</TableHead>
							<TableHead class="hidden lg:table-cell {headClass}">Type</TableHead>
							<TableHead class="hidden lg:table-cell {headClass}">Dates</TableHead>
							<TableHead class={headClass}>Status</TableHead>
							<TableHead class="text-right pr-5 {headClass}"><span class="sr-only">Actions</span></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each data.tours as tour (tour.id)}
							<TableRow class="border-b border-cream-dark last:border-0 hover:bg-cream/30">
								<TableCell class="hidden lg:table-cell pl-5">
									<div class="w-12 h-9 rounded-md overflow-hidden bg-gradient-to-br from-navy to-teal shrink-0">
										{#if tour.image_path}
											<img src={tour.image_path} alt="" class="w-full h-full object-cover" onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
										{/if}
									</div>
								</TableCell>
								<TableCell class="whitespace-normal">
									<a href="/admin/tours/{tour.id}" class="font-body text-[0.88rem] font-medium text-heading hover:text-link transition-colors">{tour.title}</a>
									<div class="hidden sm:block font-mono text-[0.65rem] text-text-light mt-0.5">/tours/{tour.slug}</div>
								</TableCell>
								<TableCell class="hidden lg:table-cell text-[0.78rem] text-text-mid">{tour.tour_type ?? '—'}</TableCell>
								<TableCell class="hidden lg:table-cell text-[0.75rem] text-text-mid">{tour.dates ?? '—'}</TableCell>
								<TableCell>
									<StatusToggle id={tour.id} on={!!tour.active} onLabel="Active" offLabel="Inactive" />
								</TableCell>
								<TableCell class="pr-5">
									<div class="flex items-center justify-end gap-1">
										<Button variant="ghost" size="sm" href="/admin/tours/{tour.id}" class="text-text-mid hover:text-heading">
											<PencilIcon data-icon="inline-start" /> <span class="max-sm:sr-only">Edit</span>
										</Button>
										<ConfirmDelete id={tour.id} name={tour.title} iconOnly />
									</div>
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</CardContent>
	</Card>
</div>
