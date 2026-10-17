<script lang="ts">
 import PageHero from '#lib/components/PageHero.svelte';
 import TourCard from '#lib/components/TourCard.svelte';
 import { renderContent } from '#lib/render.js';
 import { site } from '#lib/site.js';
 import type { PageData } from './$types';
 let { data }: { data: PageData } = $props();
 const html = $derived(data.page ? renderContent(data.page.content, data.settings) : '');
</script>
<svelte:head><title>{data.page?.title ?? site.name}</title><meta name="description" content={site.description} /></svelte:head>
<PageHero title={data.page?.title ?? site.name} subtitle={data.page?.subtitle ?? site.description} />
<section class="container py-12">
 {#if html}<div class="prose-cms mb-10">{@html html}</div>{/if}
 <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{#each data.tours as tour}<TourCard {...tour} description="" />{/each}</div>
</section>
