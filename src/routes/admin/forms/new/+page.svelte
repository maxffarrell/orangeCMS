<script lang="ts">
	import { site } from '#lib/site.js';
	import { AdminPageHeader } from '#lib/components/ui-customized/index.js';
	import FormEditor from '#lib/components/FormEditor.svelte';
</script>

<svelte:head><title>New Form — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 pt-10 max-w-3xl">
	<AdminPageHeader title="New Form" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Forms', href: '/admin/forms' }, { label: 'New Form' }]} />
	<FormEditor />
</div>
