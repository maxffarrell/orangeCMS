<script lang="ts">
	import { site } from '#lib/site.js';
	import { AdminPageHeader } from '#lib/components/ui-customized/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import FormEditor from '#lib/components/FormEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{data.form?.title ?? 'Form'} — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 pt-10 max-w-3xl">
	<AdminPageHeader title={data.form?.title ?? ''} breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Forms', href: '/admin/forms' }, { label: data.form?.title ?? 'Edit' }]}>
		{#snippet actions()}
			{#if data.schema}
				<Button variant="outline-dark" href="/admin/forms/{data.form?.id}/submissions"><InboxIcon data-icon="inline-start" /> Responses</Button>
			{/if}
		{/snippet}
	</AdminPageHeader>
	{#key data.form?.id}
		<FormEditor form={data.form} schema={data.schema} />
	{/key}
</div>
