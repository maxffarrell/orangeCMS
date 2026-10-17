<script lang="ts">
 import ContentPage from '#lib/components/ContentPage.svelte';
 import { site } from '#lib/site.js';
 import type { PageData } from './$types';
 let { data }: { data: PageData } = $props();
</script>
<ContentPage page={data.page} settings={data.settings} title={site.labels.about} />
