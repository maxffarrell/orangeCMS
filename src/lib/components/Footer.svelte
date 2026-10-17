<script lang="ts">
	import { site, pageHref } from '#lib/site.js';
	let {
		navItems,
	}: { navItems: { path: string; label: string; footer_label: string }[] } =
		$props();
</script>

<footer class="border-t border-border bg-muted py-10">
	<div class="container flex flex-col gap-6">
		<p class="font-semibold">{site.name}</p>
		{#if site.footerText}<p>{site.footerText}</p>{/if}
		<nav aria-label="Footer navigation">
			<ul class="flex flex-wrap gap-4">
				{#each navItems as item}<li>
						<a href={item.path}>{item.footer_label}</a>
					</li>{/each}
			</ul>
		</nav>
		<p>
			&copy; {new Date().getFullYear()}
			{site.name}. {#if site.privacyPath}<a
					href={pageHref('privacy') ?? site.privacyPath}
					class="underline">Privacy</a
				>{/if}
		</p>
	</div>
</footer>
