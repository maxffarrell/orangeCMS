<script lang="ts">
 import ContentPage from '#lib/components/ContentPage.svelte';
 import { site } from '#lib/site.js';
 import type { PageData } from './$types';
 let { data }: { data: PageData } = $props();
</script>
<ContentPage page={data.page} settings={data.settings} title={site.labels.vendors} />
<section class="container grid gap-6 pb-12 sm:grid-cols-2">
 {#each data.vendors as vendor}
  <article class="rounded-xl border border-border p-6">
   {#if vendor.logo_path}<img src={vendor.logo_path} alt={`${vendor.name} logo`} loading="lazy" class="mb-4 h-20 max-w-full object-contain" />{/if}
   <h2 class="text-2xl font-semibold">{vendor.name}</h2>
   {#if vendor.photo_path}<img src={vendor.photo_path} alt={vendor.name} loading="lazy" class="my-4 aspect-video w-full rounded object-cover" />{/if}
   {#if vendor.description}<p>{vendor.description}</p>{/if}
  </article>
 {/each}
</section>
