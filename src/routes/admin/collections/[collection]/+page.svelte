<script lang="ts">
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{data.collection.title}</title></svelte:head>
<div class="container max-w-4xl space-y-6 py-10">
	<a href="/admin/collections" class="underline">Collections</a>
	<h1 class="text-3xl font-semibold">{data.collection.title}</h1>
	{#if form && 'error' in form}<p role="alert">
			{form.error}
		</p>{/if}{#if form && 'success' in form}<p role="status">
			Collection saved.
		</p>{/if}<a
		class="underline"
		href="/admin/collections/{data.collection.slug}/entries/new">Create entry</a
	>
	<ul class="space-y-3">
		{#each data.entries as entry}<li>
				<a
					class="underline"
					href="/admin/collections/{data.collection.slug}/entries/{entry.id}"
					>{entry.title}</a
				>
				— {entry.active ? 'Published' : 'Draft'}
			</li>{/each}
	</ul>
	<form method="POST" action="?/save" class="space-y-4">
		<h2 class="text-xl font-semibold">Content type</h2>
		<label class="block"
			>Title<input
				name="title"
				value={data.collection.title}
				required
				class="block w-full rounded border border-border bg-background p-3"
			/></label
		><label class="block"
			>Field definitions (JSON)<textarea
				name="fields"
				rows="12"
				class="block w-full rounded border border-border bg-background p-3 font-mono"
				>{JSON.stringify(data.collection.fields, null, 2)}</textarea
			></label
		>
		<p>
			Each field has a unique lowercase key, a label, and a type: text,
			textarea, markdown, number, boolean, url, or image. Add required: true to
			require a value.
		</p>
		<button class="rounded bg-primary px-5 py-3 text-primary-foreground"
			>Save collection</button
		>
	</form>
	<form
		method="POST"
		action="?/delete"
		onsubmit={(event) => {
			if (!confirm('Delete this collection and all its entries?'))
				event.preventDefault();
		}}
	>
		<button class="rounded border border-destructive px-5 py-3 text-destructive"
			>Delete collection</button
		>
	</form>
</div>
