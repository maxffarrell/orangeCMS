<script lang="ts">
	import { site } from '#lib/site.js';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { AdminPageHeader, AdminSection, ConfirmDelete } from '#lib/components/ui-customized/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import FileDropZone from '#lib/components/FileDropZone.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let saving = $state(false);
	let activeChecked = $state(untrack(() => data.vendor.active === 1));
	let name = $state(untrack(() => data.vendor.name));
	let sortOrder = $state(untrack(() => String(data.vendor.sort_order)));
	let description = $state(untrack(() => data.vendor.description ?? ''));
</script>

<svelte:head><title>{data.vendor.name} — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 pt-10 max-w-3xl">
	<AdminPageHeader title={data.vendor.name ?? ''} breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Vendors', href: '/admin/vendors' }, { label: data.vendor.name }]}>
		{#snippet actions()}
			<ConfirmDelete name={data.vendor.name} label="Delete" />
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
				if (result.type === 'success') toast.success('Vendor saved successfully.');
				else if (result.type === 'failure') toast.error((result.data as Record<string, string>)?.error ?? 'Something went wrong.');
			};
		}}
		class="flex flex-col gap-5"
	>
		<input type="hidden" name="slug" value={data.vendor.slug} />

		<AdminSection title="Identity" contentClass="flex flex-col gap-4">
				<div>
					<Label for="name">Name <span class="text-red-400 normal-case tracking-normal font-body">*</span></Label>
					<Input id="name" name="name" type="text" required bind:value={name} />
					<p class="mt-1.5 text-[0.68rem] font-mono text-text-light">slug: {data.vendor.slug}</p>
				</div>
				<div>
					<Label for="sort_order">Sort Order</Label>
					<Input id="sort_order" name="sort_order" type="number" bind:value={sortOrder} class="w-24" />
				</div>
				<div class="flex items-center gap-3 pt-1">
					<Switch id="active" name="active" bind:checked={activeChecked} />
					<Label for="active" class="cursor-pointer">Active (visible on site)</Label>
				</div>
			</AdminSection>

		<AdminSection title="Images" contentClass="flex flex-col gap-6">
				<div>
					<FileDropZone name="logo_path" value={data.vendor.logo_path ?? ''} accept="image/*" prefix="vendors/" label="Logo" />
				</div>
				<div>
					<FileDropZone name="photo_path" value={data.vendor.photo_path ?? ''} accept="image/*" prefix="vendors/" label="Feature Photo" />
				</div>
			</AdminSection>

		<AdminSection title="Description">
				<Textarea name="description" rows={4} bind:value={description} placeholder="Short description shown on the vendor card…" />
			</AdminSection>

		<div class="flex gap-3">
			<Button type="submit" variant="gold" disabled={saving} class="gap-2">
				{#if saving}<Spinner class="size-3.5" />{/if}
				Save Changes
			</Button>
			<Button variant="outline" href="/admin/vendors">Cancel</Button>
		</div>
	</form>
</div>
