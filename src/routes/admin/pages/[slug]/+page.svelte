<script lang="ts">
	import { site } from '#lib/site.js';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { AdminPageHeader, AdminSection } from '#lib/components/ui-customized/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import MarkdownEditor from '#lib/components/MarkdownEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let saving = $state(false);
	let eyebrow = $state(untrack(() => data.page?.eyebrow ?? ''));
	let subtitle = $state(untrack(() => data.page?.subtitle ?? ''));
	let content = $state(untrack(() => data.page?.content ?? ''));
</script>

<svelte:head><title>{data.page?.title ?? 'Page'} — {site.adminName}</title></svelte:head>

<div class="px-4 sm:px-6 lg:px-12 pt-10 max-w-3xl">
	<AdminPageHeader title={data.page?.title ?? ''} meta="/{data.page?.slug}" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Pages', href: '/admin/pages' }, { label: data.page?.title ?? 'Edit' }]}>
		{#snippet actions()}
			<Button variant="outline" size="sm" href="/{data.page?.slug}" target="_blank"><ExternalLinkIcon data-icon="inline-start" /> Preview</Button>
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
				if (result.type === 'success') toast.success('Page saved successfully.');
				else if (result.type === 'failure') toast.error((result.data as Record<string, string>)?.error ?? 'Something went wrong.');
			};
		}}
		class="flex flex-col gap-5"
	>
		<AdminSection title="Page Details">
				<div class="flex flex-col gap-5">
					<div>
						<Label for="eyebrow">Eyebrow</Label>
						<Input id="eyebrow" name="eyebrow" type="text" bind:value={eyebrow} placeholder="e.g. Our Story" />
					</div>
					<div>
						<Label for="subtitle">Subtitle</Label>
						<Input id="subtitle" name="subtitle" type="text" bind:value={subtitle} placeholder="Short description below the page title" />
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
			<Button variant="ghost" href="/admin/pages" class="text-text-light hover:text-heading">Cancel</Button>
		</div>
	</form>
</div>
