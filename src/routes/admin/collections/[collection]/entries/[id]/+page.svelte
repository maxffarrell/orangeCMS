<script lang="ts">
	import MarkdownEditor from '#lib/components/MarkdownEditor.svelte';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const inputClass =
		'block w-full rounded border border-border bg-background p-3';
</script>

<svelte:head><title>{data.entry?.title ?? 'Create entry'}</title></svelte:head>
<div class="container max-w-3xl space-y-6 py-10">
	<a class="underline" href="/admin/collections/{data.collection.slug}"
		>{data.collection.title}</a
	>
	<h1 class="text-3xl font-semibold">
		{data.entry ? 'Edit entry' : 'Create entry'}
	</h1>
	{#if form && 'error' in form}<p role="alert">{form.error}</p>{/if}
	<form method="POST" action="?/save" class="space-y-5">
		<label class="block"
			>Title<input
				name="title"
				value={data.entry?.title ?? ''}
				required
				class={inputClass}
			/></label
		><label class="block"
			>Slug<input
				name="slug"
				value={data.entry?.slug ?? ''}
				required
				pattern="[a-z0-9]+(-[a-z0-9]+)*"
				class={inputClass}
			/></label
		><label class="block"
			>Image path<input
				name="image_path"
				value={data.entry?.image_path ?? ''}
				class={inputClass}
			/></label
		>
		<div>
			<p>Content</p>
			<MarkdownEditor name="content" value={data.entry?.content ?? ''} />
		</div>
		{#each data.collection.fields as field}{@const value =
				data.entry?.fields[field.key]}<label class="block"
				>{field.label}{#if field.type === 'boolean'}<input
						type="checkbox"
						name={'field_' + field.key}
						checked={value === true}
					/>{:else if field.type === 'markdown' || field.type === 'textarea'}<textarea
						name={'field_' + field.key}
						required={field.required}
						rows="6"
						class={inputClass}>{String(value ?? '')}</textarea
					>{:else}<input
						type={field.type === 'number'
							? 'number'
							: field.type === 'url'
								? 'url'
								: 'text'}
						step={field.type === 'number' ? 'any' : undefined}
						name={'field_' + field.key}
						required={field.required}
						value={String(value ?? '')}
						class={inputClass}
					/>{/if}</label
			>{/each}<label class="block"
			>Sort order<input
				type="number"
				name="sort_order"
				value={data.entry?.sort_order ?? 0}
				class={inputClass}
			/></label
		><label class="block"
			><input
				type="checkbox"
				name="active"
				checked={data.entry?.active === 1}
			/> Published</label
		><button class="rounded bg-primary px-5 py-3 text-primary-foreground"
			>Save entry</button
		>
	</form>
	{#if data.entry}<form
			method="POST"
			action="?/delete"
			onsubmit={(event) => {
				if (!confirm('Delete this entry?')) event.preventDefault();
			}}
		>
			<button
				class="rounded border border-destructive px-5 py-3 text-destructive"
				>Delete entry</button
			>
		</form>{/if}
</div>
