<script lang="ts">
 import { site } from '#lib/site.js';
 let { slug, title, dates, tour_type, description, image_path, booking_url = null }: { slug: string; title: string; dates: string | null; tour_type: string | null; description: string; image_path: string | null; booking_url?: string | null; delay?: 0 | 1 | 2 | 3 } = $props();
</script>
<article class="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
 {#if image_path}<img src={image_path} alt={title} loading="lazy" class="aspect-video w-full rounded object-cover" />{/if}
 {#if tour_type}<p class="text-sm text-muted-foreground">{tour_type}</p>{/if}
 <h2 class="text-2xl font-semibold"><a href={`/tours/${slug}`}>{title}</a></h2>
 {#if dates}<p>{dates}</p>{/if}
 {#if description}<p class="text-muted-foreground">{description}</p>{/if}
 <a href={`/tours/${slug}`} class="underline">Details</a>
 {#if booking_url}<a href={booking_url} rel="noopener noreferrer" class="underline">{site.listingAction}</a>{/if}
</article>
