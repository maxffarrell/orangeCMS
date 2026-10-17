<script lang="ts">
 import PageHero from '#lib/components/PageHero.svelte';
 import { renderContent } from '#lib/render.js';
 import { site } from '#lib/site.js';
 import type { PageData } from './$types';
 let { data }: { data: PageData } = $props();
 const html = $derived(renderContent(data.tour.content, data.settings));
</script>
<svelte:head><title>{data.tour.title} — {site.name}</title></svelte:head>
<PageHero title={data.tour.title} eyebrow={data.tour.tour_type} subtitle={data.tour.dates} />
<section class="container py-12">
 {#if data.tour.image_path}<img src={data.tour.image_path} alt={data.tour.title} class="mb-8 max-h-[32rem] w-full rounded-xl object-cover" />{/if}
 <div class="prose-cms">{@html html}</div>
 <aside class="mt-8 flex flex-wrap gap-6">
  {#if data.tour.booking_url}<a href={data.tour.booking_url} class="underline">{site.listingAction}</a>{/if}
  {#if data.settings.phone}<a href={`tel:${data.settings.phone.replace(/[^+\d]/g, '')}`}>{data.settings.phone}</a>{/if}
  {#if data.settings.email}<a href={`mailto:${data.settings.email}`}>{data.settings.email}</a>{/if}
 </aside>
</section>
