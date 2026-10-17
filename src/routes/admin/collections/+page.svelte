<script lang="ts">
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Collections</title></svelte:head>
<div class="container max-w-4xl space-y-6 py-10">
	<h1 class="text-3xl font-semibold">Collections</h1>
	<p>
		Define reusable content types with custom fields. Map collections and
		entries to public paths in your site configuration.
	</p>
	{#if form && 'error' in form}<p role="alert">{form.error}</p>{/if}
	<ul class="space-y-3">
		{#each data.collections as collection}<li>
				<a class="underline" href="/admin/collections/{collection.slug}"
					>{collection.title}</a
				>
			</li>{/each}
	</ul>
	<form method="POST" action="?/create" class="space-y-4">
		<h2 class="text-xl font-semibold">Create collection</h2>
		<label class="block"
			>Title<input
				name="title"
				required
				class="block w-full rounded border border-border bg-background p-3"
			/></label
		><label class="block"
			>Slug<input
				name="slug"
				required
				pattern="[a-z0-9]+(-[a-z0-9]+)*"
				class="block w-full rounded border border-border bg-background p-3"
			/></label
		><button class="rounded bg-primary px-5 py-3 text-primary-foreground"
			>Create collection</button
		>
	</form>
</div>
