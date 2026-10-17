<script lang="ts">
	import { site } from '#lib/site.js';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Settings — {site.adminName}</title></svelte:head>
<div class="container max-w-3xl space-y-6 py-10">
	<h1 class="text-3xl font-semibold">Settings</h1>
	<p>
		Setting fields are defined in your site configuration. Use their uppercase
		keys in Markdown template variables.
	</p>
	{#if form?.success}<p role="status">
			Settings saved.
		</p>{/if}{#if form && 'error' in form}<p role="alert">{form.error}</p>{/if}
	<form method="POST" action="?/save" class="space-y-5">
		{#each site.settingsFields as field}<label class="block"
				>{field.label}{#if field.type === 'textarea'}<textarea
						name={field.key}
						class="mt-1 block w-full rounded border border-border bg-background p-3"
						rows="4">{data.settings[field.key] ?? ''}</textarea
					>{:else}<input
						type={field.type}
						name={field.key}
						value={data.settings[field.key] ?? ''}
						class="mt-1 block w-full rounded border border-border bg-background p-3"
					/>{/if}</label
			>{/each}<button
			class="rounded bg-primary px-5 py-3 text-primary-foreground"
			>Save settings</button
		>
	</form>
</div>
