<script lang="ts">
	import { site } from '#lib/site.js';
	import { enhance } from '$app/forms';
	import { Button } from '#lib/components/ui/button/index.js';
	import { AdminPageHeader, AdminSection } from '#lib/components/ui-customized/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import FileDropZone from '#lib/components/FileDropZone.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let saving = $state(false);
	let activeChecked = $state(true);
	let name = $state('');
	const slug = $derived(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
</script>

<svelte:head><title>New Vendor — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 pt-10 max-w-3xl">
	<AdminPageHeader title="New Vendor" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Vendors', href: '/admin/vendors' }, { label: 'New Vendor' }]} />
	{#if form?.error}
		<Alert variant="destructive" class="mb-6"><AlertDescription>{form.error}</AlertDescription></Alert>
	{/if}

	<form method="POST" action="?/save" use:enhance={() => { saving = true; return async ({ update }) => { saving = false; await update(); }; }} class="flex flex-col gap-5">
		<input type="hidden" name="slug" value={slug} />

		<AdminSection title="Identity" contentClass="flex flex-col gap-4">
				<div>
					<Label for="name">Name <span class="text-red-400 normal-case tracking-normal font-body">*</span></Label>
					<Input id="name" name="name" type="text" required placeholder="e.g. Example Listing" bind:value={name} />
					{#if slug}
						<p class="mt-1.5 text-[0.68rem] font-mono text-text-light">slug: {slug}</p>
					{/if}
				</div>
				<div>
					<Label for="sort_order">Sort Order</Label>
					<Input id="sort_order" name="sort_order" type="number" value="0" class="w-24" />
				</div>
				<div class="flex items-center gap-3 pt-1">
					<Switch id="active" name="active" bind:checked={activeChecked} />
					<Label for="active" class="cursor-pointer">Active (visible on site)</Label>
				</div>
			</AdminSection>

		<AdminSection title="Images" contentClass="flex flex-col gap-6">
				<div>
					<FileDropZone name="logo_path" accept="image/*" prefix="vendors/" label="Logo" />
				</div>
				<div>
					<FileDropZone name="photo_path" accept="image/*" prefix="vendors/" label="Feature Photo" />
				</div>
			</AdminSection>

		<AdminSection title="Description">
				<Textarea name="description" rows={4} placeholder="Short description shown on the vendor card…" />
			</AdminSection>

		<div class="flex gap-3">
			<Button type="submit" variant="gold" disabled={saving} class="gap-2">
				{#if saving}<Spinner class="size-3.5" />{/if}
				Save Vendor
			</Button>
			<Button variant="outline" href="/admin/vendors">Cancel</Button>
		</div>
	</form>
</div>
