<script lang="ts">
	import { site } from '#lib/site.js';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle,
	} from '#lib/components/ui/card/index.js';
	import { AdminPageHeader } from '#lib/components/ui-customized/index.js';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Dashboard — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 py-10 max-w-4xl">
	<AdminPageHeader
		eyebrow="Content Manager"
		title="Dashboard"
		description="Manage collections, pages, forms, and site settings."
	/>

	<!-- Ledger stats -->
	<Card
		class="rounded-xl shadow-none ring-0 border border-cream-dark overflow-hidden bg-card py-0 gap-0 mb-10"
	>
		<CardContent class="p-0">
			<div
				class="grid grid-cols-1 divide-y divide-cream-dark sm:grid-cols-3 sm:divide-x sm:divide-y-0"
			>
				{#each [{ label: 'Collections', count: data.collectionCount, href: '/admin/collections' }, { label: 'Content Pages', count: data.pageCount, href: '/admin/pages' }, { label: 'Forms', count: data.formCount, href: '/admin/forms' }] as stat}
					<a
						href={stat.href}
						class="group px-8 py-7 flex flex-col hover:bg-cream/60 transition-colors"
					>
						<div
							class="font-display text-[3.4rem] font-light italic text-heading leading-[1] mb-1 group-hover:text-link transition-colors tabular-nums"
						>
							{stat.count}
						</div>
						<div
							class="h-px bg-gold/30 mb-3 w-8 group-hover:w-14 transition-all duration-500"
						></div>
						<div
							class="font-body text-[0.6rem] tracking-[0.2em] uppercase text-text-light"
						>
							{stat.label}
						</div>
					</a>
				{/each}
			</div>
		</CardContent>
	</Card>

	<!-- Quick actions -->
	<Card
		class="rounded-xl shadow-none ring-0 border border-cream-dark overflow-hidden bg-card py-0 gap-0"
	>
		<CardHeader
			class="px-5 py-3 border-b border-cream-dark bg-transparent rounded-none flex-row items-center gap-3"
		>
			<span class="block w-4 h-px bg-gold/50 shrink-0"></span>
			<CardTitle
				class="font-body text-[0.58rem] tracking-[0.28em] uppercase text-text-light font-normal"
				>Quick Actions</CardTitle
			>
		</CardHeader>
		<CardContent class="p-0">
			<div class="divide-y divide-cream-dark">
				{#each [{ href: '/admin/collections', label: 'Manage Collections', desc: 'Define content types and publish entries' }, { href: '/admin/pages', label: 'Edit Page Content', desc: 'Create and update content pages' }, { href: '/admin/settings', label: 'Update Settings', desc: 'Configure site values' }, { href: '/admin/forms', label: 'Manage Forms', desc: 'Create forms and manage responses' }] as action}
					<a
						href={action.href}
						class="flex items-center justify-between gap-4 px-6 py-4 hover:bg-cream/50 transition-colors group"
					>
						<div>
							<div
								class="font-body text-[0.88rem] font-medium text-heading group-hover:text-link transition-colors"
							>
								{action.label}
							</div>
							<div class="text-[0.75rem] text-text-light mt-0.5">
								{action.desc}
							</div>
						</div>
						<ChevronRightIcon
							size={14}
							class="text-text-light/30 shrink-0 group-hover:text-gold group-hover:translate-x-0.5 transition-all"
						/>
					</a>
				{/each}
			</div>
		</CardContent>
	</Card>
</div>
