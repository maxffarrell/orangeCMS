<script lang="ts">
 import PageHero from '#lib/components/PageHero.svelte';
 import TourCard from '#lib/components/TourCard.svelte';
 import { renderContent } from '#lib/render.js';
 import { site } from '#lib/site.js';
 import type { PageData } from './$types';
 let { data }: { data: PageData } = $props();

</script>
<svelte:head><title>{site.labels.tours} — {site.name}</title><meta name="description" content={site.description} /></svelte:head>
<PageHero title={site.labels.tours}  />
<section class="container py-12">

 <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{#each data.tours as tour}<TourCard {...tour} description="" />{/each}</div>
</section>
