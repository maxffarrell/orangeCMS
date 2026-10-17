<script lang="ts">
 import { site } from '#lib/site.js';
 let { navItems, phone, email, address }: { navItems: { path: string; label: string; footer_label: string }[]; phone: string; email: string; address: string } = $props();
</script>
<footer class="border-t border-border bg-muted py-10">
 <div class="container flex flex-col gap-6">
  <p class="font-semibold">{site.name}</p>
  {#if site.footerText}<p>{site.footerText}</p>{/if}
  <nav aria-label="Footer navigation"><ul class="flex flex-wrap gap-4">{#each navItems as item}<li><a href={item.path}>{item.footer_label}</a></li>{/each}</ul></nav>
  {#if phone}<a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>{phone}</a>{/if}
  {#if email}<a href={`mailto:${email}`}>{email}</a>{/if}
  {#if address}<p>{address}</p>{/if}
  <p>&copy; {new Date().getFullYear()} {site.name}. <a href="/privacy" class="underline">{site.labels.privacy}</a></p>
 </div>
</footer>
