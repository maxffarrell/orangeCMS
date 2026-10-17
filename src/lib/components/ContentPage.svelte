<script lang="ts">
 import PageHero from './PageHero.svelte';
 import { renderContent } from '#lib/render.js';
 import { site } from '#lib/site.js';
 import type { Page, Settings } from '#lib/server/db.js';
 let { page, settings, title }: { page: Page | null; settings: Settings; title: string } = $props();
 const html = $derived(page ? renderContent(page.content, settings) : '');
</script>
<svelte:head><title>{page?.title ?? title} — {site.name}</title><meta name="description" content={page?.subtitle ?? site.description} /></svelte:head>
<PageHero title={page?.title ?? title} eyebrow={page?.eyebrow} subtitle={page?.subtitle} />
{#if html}<section class="container py-12"><div class="prose-cms">{@html html}</div></section>{/if}
