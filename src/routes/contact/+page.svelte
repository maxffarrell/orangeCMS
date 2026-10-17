<script lang="ts">
 import ContentPage from '#lib/components/ContentPage.svelte';
 import { site } from '#lib/site.js';
 import type { PageData } from './$types';
 let { data }: { data: PageData } = $props();
</script>
<ContentPage page={data.page} settings={data.settings} title={site.labels.contact} />
<section class="container flex flex-col gap-4 pb-12">
 {#if data.settings.phone}<a href={`tel:${data.settings.phone.replace(/[^+\d]/g, '')}`}>{data.settings.phone}</a>{/if}
 {#if data.settings.email}<a href={`mailto:${data.settings.email}`}>{data.settings.email}</a>{/if}
 {#if data.settings.address}<p>{data.settings.address}</p>{/if}
</section>
