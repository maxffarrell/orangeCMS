<script lang="ts">
	import { site } from '#lib/site.js';
	import { enhance } from '$app/forms';
	import { Button } from '#lib/components/ui/button/index.js';
	import { AdminPageHeader, AdminSection } from '#lib/components/ui-customized/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import FileDropZone from '#lib/components/FileDropZone.svelte';
	import MarkdownEditor from '#lib/components/MarkdownEditor.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let saving = $state(false);
	let activeChecked = $state(true);
	let title = $state('');
	const slugPreview = $derived(title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
</script>

<svelte:head><title>New Tour — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 pt-10 max-w-3xl">
	<AdminPageHeader title="New Tour" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Tours', href: '/admin/tours' }, { label: 'New Tour' }]} />
	{#if form?.error}
		<Alert variant="destructive" class="mb-6">
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update();
			};
		}}
		class="flex flex-col gap-5"
	>
		<AdminSection title="Identity">
				<div>
					<Label for="title">Title <span class="text-red-400 normal-case tracking-normal font-body">*</span></Label>
					<Input id="title" name="title" type="text" required placeholder="e.g. Example Listing" bind:value={title} />
					{#if slugPreview}
						<p class="mt-1.5 text-[0.68rem] font-mono text-text-light">/tours/{slugPreview}</p>
					{/if}
				</div>
			</AdminSection>

		<AdminSection title="Details">
				<div class="flex flex-col gap-4">
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<Label for="tour_type">Type</Label>
							<Input id="tour_type" name="tour_type" type="text" placeholder="e.g. Workshop" />
						</div>
						<div>
							<Label for="dates">Dates</Label>
							<Input id="dates" name="dates" type="text" placeholder="e.g. May – September 2025" />
						</div>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<FileDropZone name="image_path" accept="image/*" prefix="images/" label="Tour Image" />
						</div>
						<div>
							<Label for="booking_url">Booking URL</Label>
							<Input id="booking_url" name="booking_url" type="url" placeholder="https://..." class="font-mono text-[0.88rem]" />
						</div>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<Label for="sort_order">Sort Order</Label>
							<Input id="sort_order" name="sort_order" type="number" value="0" min="0" class="font-mono text-[0.88rem]" />
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
				<MarkdownEditor name="content" class="mt-1" />
				<p class="mt-2.5 text-[0.7rem] text-text-light">
					Use <code class="bg-cream-dark px-1 rounded text-heading font-mono">{'{PHONE}'}</code>,
					<code class="bg-cream-dark px-1 rounded text-heading font-mono">{'{EMAIL}'}</code>,
					<code class="bg-cream-dark px-1 rounded text-heading font-mono">{'{ADDRESS}'}</code> for dynamic contact info.
				</p>
			</AdminSection>

		<div class="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t border-cream-dark bg-cream/90 px-1 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
			<Button variant="gold" type="submit" disabled={saving}>
				{#if saving}<Spinner class="mr-1.5" />{/if}
				{saving ? 'Creating…' : 'Create Tour'}
			</Button>
			<Button variant="ghost" href="/admin/tours" class="text-text-light hover:text-heading">Cancel</Button>
		</div>
	</form>
</div>
