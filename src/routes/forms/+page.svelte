<script lang="ts">
 import ContentPage from '#lib/components/ContentPage.svelte';
 import { site } from '#lib/site.js';
 import type { PageData } from './$types';
 let { data }: { data: PageData } = $props();
</script>
<ContentPage page={data.page} settings={data.settings} title={site.labels.forms} />
<section class="container grid gap-6 pb-12 sm:grid-cols-2 lg:grid-cols-3">
 {#each data.forms as form}
  <article class="flex flex-col gap-4 rounded-xl border border-border p-6">
   <h2 class="text-2xl font-semibold">{form.title}</h2>
   {#if form.description}<p>{form.description}</p>{/if}
   {#if form.slug}<a href={`/forms/${form.slug}`} class="underline">Open form</a>{/if}
   {#if form.file_path}<a href={form.file_path} download class="underline">Download</a>{/if}
  </article>
 {/each}
</section>
