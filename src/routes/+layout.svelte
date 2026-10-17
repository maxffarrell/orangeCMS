<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import Navbar from '#lib/components/Navbar.svelte';
	import Footer from '#lib/components/Footer.svelte';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	const isAdmin = $derived(
		page.url.pathname === '/admin' || page.url.pathname.startsWith('/admin/'),
	);
</script>

<ModeWatcher defaultMode="system" />
{#if !isAdmin}<Navbar navItems={data.navItems} />{/if}
<main id="main-content">{@render children()}</main>
{#if !isAdmin}<Footer navItems={data.navItems} />{/if}
