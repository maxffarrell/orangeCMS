<script lang="ts">
	import { site } from '#lib/site.js';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { AdminPageHeader, AdminSection } from '#lib/components/ui-customized/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import FileDropZone from '#lib/components/FileDropZone.svelte';
	import MarkdownEditor from '#lib/components/MarkdownEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let saving = $state(false);
	let activeChecked = $state(untrack(() => data.tour?.active === 1));
	let titleValue = $state(untrack(() => data.tour?.title ?? ''));
	let tourType = $state(untrack(() => data.tour?.tour_type ?? ''));
	let dates = $state(untrack(() => data.tour?.dates ?? ''));
	let bookingUrl = $state(untrack(() => data.tour?.booking_url ?? ''));
	let sortOrder = $state(untrack(() => String(data.tour?.sort_order ?? 0)));
	let content = $state(untrack(() => data.tour?.content ?? ''));

	const slugPreview = $derived(titleValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
</script>

<svelte:head><title>{data.tour?.title ?? 'Tour'} — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 pt-10 max-w-3xl">
	<AdminPageHeader title={data.tour?.title ?? ''} meta="/tours/{slugPreview}" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Tours', href: '/admin/tours' }, { label: data.tour?.title ?? 'Edit' }]}>
		{#snippet actions()}
			<Button variant="outline" size="sm" href="/tours/{data.tour?.slug}" target="_blank"><ExternalLinkIcon data-icon="inline-start" /> Preview</Button>
		{/snippet}
	</AdminPageHeader>
	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				await update({ reset: false });
				if (result.type === 'success') toast.success('Tour saved successfully.');
				else if (result.type === 'failure') toast.error((result.data as Record<string, string>)?.error ?? 'Something went wrong.');
			};
		}}
		class="flex flex-col gap-5"
	>
		<AdminSection title="Identity">
				<div>
					<Label for="title">Title</Label>
					<Input id="title" name="title" type="text" bind:value={titleValue} required />
				</div>
			</AdminSection>

		<AdminSection title="Details">
				<div class="flex flex-col gap-4">
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<Label for="tour_type">Type</Label>
							<Input id="tour_type" name="tour_type" type="text" bind:value={tourType} placeholder="e.g. Workshop" />
						</div>
						<div>
							<Label for="dates">Dates</Label>
							<Input id="dates" name="dates" type="text" bind:value={dates} placeholder="e.g. May – September 2025" />
						</div>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<FileDropZone name="image_path" value={data.tour?.image_path ?? ''} accept="image/*" prefix="images/" label="Tour Image" />
						</div>
						<div>
							<Label for="booking_url">Booking URL</Label>
							<Input id="booking_url" name="booking_url" type="url" bind:value={bookingUrl} placeholder="https://..." class="font-mono text-[0.88rem]" />
						</div>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<Label for="sort_order">Sort Order</Label>
							<Input id="sort_order" name="sort_order" type="number" bind:value={sortOrder} min="0" class="font-mono text-[0.88rem]" />
						</div>
						<div class="flex flex-col gap-2">
							<Label>Status</Label>
							<input type="hidden" name="active" value={activeChecked ? '1' : '0'} />
							<div class="flex items-center gap-3">
								<Switch bind:checked={activeChecked} />
								<span class="text-[0.82rem] text-text-mid">{activeChecked ? 'Active' : 'Inactive'}</span>
							</div>
						</div>
					</div>
				</div>
			</AdminSection>

		<AdminSection title="Content">
				<Label for="content">Markdown</Label>
				<MarkdownEditor name="content" value={content} class="mt-1" />
				<p class="mt-2.5 text-[0.7rem] text-text-light">
					Use <code class="bg-cream-dark px-1 rounded text-heading font-mono">{'{PHONE}'}</code>,
					<code class="bg-cream-dark px-1 rounded text-heading font-mono">{'{EMAIL}'}</code>,
					<code class="bg-cream-dark px-1 rounded text-heading font-mono">{'{ADDRESS}'}</code> for dynamic contact info.
				</p>
			</AdminSection>

		<div class="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t border-cream-dark bg-cream/90 px-1 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
			<Button variant="gold" type="submit" disabled={saving}>
				{#if saving}<Spinner class="mr-1.5" />{/if}
				{saving ? 'Saving…' : 'Save Changes'}
			</Button>
			<Button variant="ghost" href="/admin/tours" class="text-text-light hover:text-heading">Cancel</Button>
		</div>
	</form>
</div>
