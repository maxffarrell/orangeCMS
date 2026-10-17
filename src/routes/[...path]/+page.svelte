<script lang="ts">
	import ContentPage from '#lib/components/ContentPage.svelte';
	import PageHero from '#lib/components/PageHero.svelte';
	import PublicForm from '#lib/components/PublicForm.svelte';
	import { site, entryHref, formsHref } from '#lib/site.js';
	import { renderContent } from '#lib/render.js';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head
	>{#if data.entry || data.collection}<title
			>{data.entry?.title ?? data.collection?.title} — {site.name}</title
		>{/if}</svelte:head
>
{#if data.kind === 'page'}
	<ContentPage page={data.page} settings={data.settings} title={site.name} />
{:else if data.publicForm}
	<PublicForm data={data.publicForm} {form} />
{:else if data.kind === 'forms'}
	<PageHero title="Forms" />
	<section class="container py-12">
		<ul class="space-y-4">
			{#each data.forms as item}{#if item.slug && formsHref(item.slug)}<li>
						<a class="underline" href={formsHref(item.slug) ?? '/'}
							>{item.title}</a
						>
					</li>{:else if item.file_path}<li>
						<a class="underline" href={item.file_path} download>{item.title}</a>
					</li>{/if}{/each}
		</ul>
	</section>
{:else if data.entry}
	<PageHero title={data.entry.title} />
	<section class="container py-12">
		{#if data.entry.image_path}<img
				src={data.entry.image_path}
				alt=""
				class="mb-8 max-h-96 w-full object-cover"
			/>{/if}
		<div class="prose-cms">
			{@html renderContent(data.entry.content, data.settings)}
		</div>
		<dl class="mt-8 space-y-3">
			{#each data.collection?.fields ?? [] as field}{#if data.entry.fields[field.key] != null}<div
					>
						<dt class="font-semibold">{field.label}</dt>
						<dd>
							{#if field.type === 'markdown'}<div class="prose-cms">
									{@html renderContent(
										String(data.entry.fields[field.key]),
										data.settings,
									)}
								</div>{:else if field.type === 'image' && data.entry.fields[field.key]}<img
									src={String(data.entry.fields[field.key])}
									alt={field.label}
									class="max-h-96 object-contain"
								/>{:else if field.type === 'url' && data.entry.fields[field.key]}<a
									class="underline"
									href={String(data.entry.fields[field.key])}
									>{String(data.entry.fields[field.key])}</a
								>{:else if field.type === 'boolean'}{data.entry.fields[
									field.key
								]
									? 'Yes'
									: 'No'}{:else}{String(data.entry.fields[field.key])}{/if}
						</dd>
					</div>{/if}{/each}
		</dl>
	</section>
{:else if data.collection}
	<PageHero title={data.collection.title} />
	<section class="container grid gap-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.entries as entry}<article
				class="rounded-lg border border-border p-6"
			>
				{#if entry.image_path}<img
						src={entry.image_path}
						alt=""
						class="mb-4 aspect-video w-full object-cover"
					/>{/if}
				<h2 class="text-xl font-semibold">
					{#if entryHref(entry.collection, entry.slug)}<a
							href={entryHref(entry.collection, entry.slug) ?? '/'}
							>{entry.title}</a
						>{:else}{entry.title}{/if}
				</h2>
			</article>{/each}
	</section>
{/if}
