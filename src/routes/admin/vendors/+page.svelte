<script lang="ts">
	import { site } from '#lib/site.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { Avatar, AvatarFallback, AvatarImage } from '#lib/components/ui/avatar/index.js';
	import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#lib/components/ui/table/index.js';
	import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#lib/components/ui/empty/index.js';
	import { AdminPageHeader, ConfirmDelete, StatusToggle } from '#lib/components/ui-customized/index.js';
	import BuildingIcon from '@lucide/svelte/icons/building-2';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const headClass = 'text-[0.58rem] tracking-[0.25em] uppercase text-text-light';
	const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
</script>

<svelte:head><title>Vendors — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 py-10 max-w-5xl">
	<AdminPageHeader eyebrow="Content" title="Vendors" meta="{data.vendors.length} preferred {data.vendors.length === 1 ? 'partner' : 'partners'}">
		{#snippet actions()}
			<Button variant="gold" href="/admin/vendors/new"><PlusIcon data-icon="inline-start" /> New Vendor</Button>
		{/snippet}
	</AdminPageHeader>

	<Card class="rounded-xl shadow-none ring-0 border border-cream-dark overflow-hidden bg-card py-0 gap-0">
		<CardContent class="p-0">
			{#if data.vendors.length === 0}
				<Empty class="border-0 py-16">
					<EmptyHeader>
						<EmptyMedia variant="icon"><BuildingIcon /></EmptyMedia>
						<EmptyTitle class="font-display text-[1.3rem] italic font-light">No vendors yet</EmptyTitle>
						<EmptyDescription>Showcase the organizations you partner with.</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="gold" href="/admin/vendors/new"><PlusIcon data-icon="inline-start" /> Add your first vendor</Button>
					</EmptyContent>
				</Empty>
			{:else}
				<Table class="table-fixed w-full">
					<TableHeader>
						<TableRow class="border-b border-gold/30 bg-[#f5ede0]/50 hover:bg-[#f5ede0]/50 dark:bg-white/[0.03]">
							<TableHead class="pl-5 w-auto {headClass}">Vendor</TableHead>
							<TableHead class="hidden sm:table-cell sm:w-32 {headClass}">Status</TableHead>
							<TableHead class="sm:w-36 pr-5 {headClass}"><span class="sr-only">Actions</span></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each data.vendors as v (v.id)}
							<TableRow class="border-b border-cream-dark last:border-0 hover:bg-cream/30">
								<TableCell class="min-w-0 pl-5 whitespace-normal">
									<div class="flex items-center gap-3 min-w-0">
										<Avatar class="size-9 rounded-md bg-navy after:rounded-md">
											{#if v.logo_path}<AvatarImage src={v.logo_path} alt="" class="object-contain p-1 rounded-md" />{/if}
											<AvatarFallback class="rounded-md bg-navy text-gold text-[0.65rem] font-medium">{initials(v.name)}</AvatarFallback>
										</Avatar>
										<div class="min-w-0">
											<a href="/admin/vendors/{v.id}" class="block font-body text-[0.88rem] font-medium text-heading hover:text-link transition-colors break-words">{v.name}</a>
											<div class="hidden sm:block font-mono text-[0.65rem] text-text-light mt-0.5 truncate">/vendors#{v.slug}</div>
											<div class="mt-1.5 sm:hidden"><StatusToggle id={v.id} on={!!v.active} onLabel="Active" offLabel="Hidden" /></div>
										</div>
									</div>
								</TableCell>
								<TableCell class="hidden sm:table-cell">
									<StatusToggle id={v.id} on={!!v.active} onLabel="Active" offLabel="Hidden" />
								</TableCell>
								<TableCell class="pr-5">
									<div class="flex items-center justify-end gap-1">
										<Button variant="ghost" size="sm" href="/admin/vendors/{v.id}" class="text-text-mid hover:text-heading">
											<PencilIcon data-icon="inline-start" /> <span class="max-sm:sr-only">Edit</span>
										</Button>
										<ConfirmDelete id={v.id} name={v.name} iconOnly />
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
