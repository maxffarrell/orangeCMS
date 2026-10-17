<script lang="ts">
	import { page } from '$app/state';
	import { site } from '#lib/site.js';
	let {
		navItems,
	}: { navItems: { path: string; label: string; footer_label: string }[] } =
		$props();
	let mobileOpen = $state(false);
	const isActive = (path: string) =>
		path === '/'
			? page.url.pathname === '/'
			: page.url.pathname === path || page.url.pathname.startsWith(path + '/');
</script>

<a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>
<header class="border-b border-border bg-background">
	<div class="container flex flex-wrap items-center justify-between gap-4 py-5">
		<a href="/" class="text-xl font-semibold" aria-label={`${site.name} home`}>
			{#if site.logo}<img
					src={site.logo}
					alt={site.name}
					class="h-10 w-auto"
				/>{:else}{site.name}{/if}
		</a>
		<button
			type="button"
			class="rounded border border-border px-3 py-2 lg:hidden"
			aria-expanded={mobileOpen}
			aria-controls="site-navigation"
			onclick={() => (mobileOpen = !mobileOpen)}>Menu</button
		>
		<nav
			id="site-navigation"
			aria-label="Main navigation"
			class={`w-full lg:block lg:w-auto ${mobileOpen ? 'block' : 'hidden'}`}
		>
			<ul class="flex flex-col gap-4 lg:flex-row lg:items-center">
				{#each navItems as item}<li>
						<a
							href={item.path}
							aria-current={isActive(item.path) ? 'page' : undefined}
							onclick={() => (mobileOpen = false)}
							class="hover:underline">{item.label}</a
						>
					</li>{/each}
			</ul>
		</nav>
	</div>
</header>
