<script lang="ts">
	import { site } from '#lib/site.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#lib/components/ui/table/index.js';
	import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#lib/components/ui/empty/index.js';
	import { AdminPageHeader, ConfirmDelete, StatusToggle } from '#lib/components/ui-customized/index.js';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { AdminSection } from '#lib/components/ui-customized/index.js';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const headClass = 'text-[0.58rem] tracking-[0.25em] uppercase text-text-light';
</script>

<svelte:head><title>Forms — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 py-10 max-w-5xl">
	<AdminPageHeader eyebrow="Content" title="Forms" meta="{data.forms.length} {data.forms.length === 1 ? 'form' : 'forms'}">
		{#snippet actions()}
			<Button variant="gold" href="/admin/forms/new"><PlusIcon data-icon="inline-start" /> New Form</Button>
		{/snippet}
	</AdminPageHeader>

	{#if !data.encryptionReady}
		<Alert class="mb-6 border-gold/50">
			<AlertDescription>
				<strong>Sensitive details are switched off.</strong> Questions marked sensitive are not shown to clients until the <code>FORM_DATA_KEY</code> encryption secret is set. See the README → Privacy section.
			</AlertDescription>
		</Alert>
	{/if}

	<Card class="rounded-xl shadow-none ring-0 border border-cream-dark overflow-hidden bg-card py-0 gap-0">
		<CardContent class="p-0">
			{#if data.forms.length === 0}
				<Empty class="border-0 py-16">
					<EmptyHeader>
						<EmptyMedia variant="icon"><ClipboardListIcon /></EmptyMedia>
						<EmptyTitle class="font-display text-[1.3rem] italic font-light">No forms yet</EmptyTitle>
						<EmptyDescription>Build online forms clients can fill in, or upload PDFs to download.</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="gold" href="/admin/forms/new"><PlusIcon data-icon="inline-start" /> Add your first form</Button>
					</EmptyContent>
				</Empty>
			{:else}
				<Table class="table-fixed w-full">
					<TableHeader>
						<TableRow class="border-b border-gold/30 bg-[#f5ede0]/50 hover:bg-[#f5ede0]/50 dark:bg-white/[0.03]">
							<TableHead class="pl-5 w-auto {headClass}">Title</TableHead>
							<TableHead class="hidden sm:table-cell sm:w-32 {headClass}">Display</TableHead>
							<TableHead class="sm:w-36 pr-5 {headClass}"><span class="sr-only">Actions</span></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each data.forms as f (f.id)}
							<TableRow class="border-b border-cream-dark last:border-0 hover:bg-cream/30">
								<TableCell class="min-w-0 pl-5 whitespace-normal">
									<div class="flex items-center gap-3 min-w-0">
										<div class="size-8 rounded-md bg-navy/5 dark:bg-white/5 flex items-center justify-center text-text-light shrink-0">
											<FileTextIcon class="size-4" />
										</div>
										<div class="min-w-0">
											<a href="/admin/forms/{f.id}" class="block font-body text-[0.88rem] font-medium text-heading hover:text-link transition-colors break-words">{f.title}</a>
											{#if f.description}
												<div class="font-body text-[0.72rem] text-text-light mt-0.5 truncate">{f.description}</div>
											{/if}
											<div class="mt-1 flex items-center gap-2">
												<Badge variant="outline">{f.slug ? 'Online form' : 'PDF download'}</Badge>
												{#if f.slug && f.accepting === 0}<Badge variant="secondary">Closed</Badge>{/if}
											</div>
											<div class="mt-1.5 sm:hidden"><StatusToggle id={f.id} on={!!f.featured} onLabel="Featured" offLabel="Standard" tone="gold" /></div>
										</div>
									</div>
								</TableCell>
								<TableCell class="hidden sm:table-cell">
									<StatusToggle id={f.id} on={!!f.featured} onLabel="Featured" offLabel="Standard" tone="gold" />
								</TableCell>
								<TableCell class="pr-5">
									<div class="flex items-center justify-end gap-1">
										{#if f.slug}
											<Button variant="ghost" size="sm" href="/admin/forms/{f.id}/submissions" class="text-text-mid hover:text-heading">
												<InboxIcon data-icon="inline-start" />
												<span class="max-sm:sr-only">{f.submission_count}{#if f.unread_count} ({f.unread_count} new){/if}</span>
											</Button>
										{/if}
										<Button variant="ghost" size="sm" href="/admin/forms/{f.id}" class="text-text-mid hover:text-heading">
											<PencilIcon data-icon="inline-start" /> <span class="max-sm:sr-only">Edit</span>
										</Button>
										<ConfirmDelete id={f.id} name={f.title} iconOnly />
									</div>
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</CardContent>
	</Card>

	<AdminSection title="Privacy: response retention" description="Form responses are deleted automatically after this many days." class="mt-6">
		<form
			method="POST"
			action="?/retention"
			use:enhance={() => async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') toast.success('Retention period saved.');
				else if (result.type === 'failure') toast.error((result.data as Record<string, string>)?.error ?? 'Could not save.');
			}}
			class="flex flex-wrap items-end gap-3"
		>
			<div>
				<Label for="days">Delete responses after (days)</Label>
				<Input id="days" name="days" type="number" min={data.minRetention} value={data.retentionDays} class="w-40 font-mono" />
			</div>
			<Button type="submit" variant="outline-dark">Save</Button>
		</form>
	</AdminSection>
</div>
