<script lang="ts">
 let { title, eyebrow, subtitle }: { title: string; eyebrow?: string | null; subtitle?: string | null } = $props();
</script>
<section class="page-hero">
 <div class="container">
  {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
  <h1 class="text-4xl font-semibold sm:text-5xl">{title}</h1>
  {#if subtitle}<p class="mt-5 max-w-2xl text-muted-foreground">{subtitle}</p>{/if}
 </div>
</section>
