<script lang="ts">
	import { site } from '#lib/site.js';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import { page } from '$app/state';
	import type { Snippet, Component } from 'svelte';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import {
		Sidebar,
		SidebarContent,
		SidebarFooter,
		SidebarGroup,
		SidebarGroupContent,
		SidebarHeader,
		SidebarInset,
		SidebarMenu,
		SidebarMenuButton,
		SidebarMenuItem,
		SidebarProvider,
		SidebarTrigger,
	} from '#lib/components/ui/sidebar/index.js';

	let { children }: { children: Snippet } = $props();

	const currentPath = $derived(page.url.pathname);

	const nav: {
		href: string;
		label: string;
		exact: boolean;
		icon: Component;
	}[] = [
		{
			href: '/admin',
			label: 'Dashboard',
			exact: true,
			icon: LayoutDashboardIcon,
		},
		{ href: '/admin/pages', label: 'Pages', exact: false, icon: FileTextIcon },
		{
			href: '/admin/collections',
			label: 'Collections',
			exact: false,
			icon: GlobeIcon,
		},
		{
			href: '/admin/settings',
			label: 'Settings',
			exact: false,
			icon: SettingsIcon,
		},
		{
			href: '/admin/forms',
			label: 'Forms',
			exact: false,
			icon: ClipboardListIcon,
		},
		{
			href: '/admin/tokens',
			label: 'API Tokens',
			exact: false,
			icon: KeyRoundIcon,
		},
		{
			href: '/admin/connections',
			label: 'Connected apps',
			exact: false,
			icon: KeyRoundIcon,
		},
	];

	function isActive(item: (typeof nav)[0]): boolean {
		if (item.exact) return currentPath === item.href;
		return currentPath.startsWith(item.href);
	}
</script>

<SidebarProvider>
	<Sidebar collapsible="offcanvas">
		<SidebarHeader class="px-5 py-4 border-b border-sidebar-border">
			<a
				href="/"
				class="flex items-center gap-3 hover:opacity-80 transition-opacity"
			>
				{#if site.logo}<img
						src={site.logo}
						alt={site.name}
						class="h-9 w-auto shrink-0"
					/>{:else}<span
						class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-white font-bold"
						aria-hidden="true">o</span
					>{/if}
				<div>
					<div
						class="font-display text-[1rem] font-light italic text-sidebar-foreground leading-[1.2]"
					>
						{site.adminName}
					</div>
					<div
						class="font-body text-[0.6rem] tracking-[0.2em] uppercase text-sidebar-foreground/40 leading-[1.2]"
					>
						Content Management
					</div>
				</div>
			</a>
			<div
				class="mt-3 font-body text-[0.55rem] tracking-[0.28em] uppercase text-sidebar-primary/70"
			>
				Content Manager
			</div>
		</SidebarHeader>

		<SidebarContent class="py-3">
			<SidebarGroup class="p-0">
				<SidebarGroupContent>
					<SidebarMenu>
						{#each nav as item}
							{@const active = isActive(item)}
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={active}
									tooltipContent={item.label}
									class="relative rounded-none px-5 py-[0.7rem] text-[0.78rem] font-medium tracking-[0.05em] h-auto {active
										? 'text-sidebar-foreground'
										: 'text-sidebar-foreground/45'}"
								>
									{#snippet child({ props })}
										{@const Icon = item.icon}
										<a href={item.href} {...props}>
											{#if active}
												<span
													class="absolute left-0 top-[20%] bottom-[20%] w-[3px] bg-sidebar-primary rounded-full"
												></span>
											{/if}
											<Icon
												size={15}
												class="shrink-0 {active ? 'text-sidebar-primary' : ''}"
											/>
											<span>{item.label}</span>
										</a>
									{/snippet}
								</SidebarMenuButton>
							</SidebarMenuItem>
						{/each}
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>
		</SidebarContent>

		<SidebarFooter class="px-5 py-4 border-t border-sidebar-border">
			<a
				href="/"
				target="_blank"
				class="flex items-center gap-2 text-[0.72rem] text-sidebar-foreground/35 hover:text-sidebar-foreground/60 transition-colors"
			>
				<ExternalLinkIcon size={11} />
				View Public Site
			</a>
		</SidebarFooter>
	</Sidebar>

	<SidebarInset class="bg-cream">
		<header
			class="md:hidden sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-cream-dark flex items-center gap-3 px-3 py-3 shrink-0"
		>
			<SidebarTrigger class="text-heading" />
			<span class="font-display text-[1rem] font-light italic text-heading"
				>{site.adminName}
				<span
					class="text-text-light not-italic font-body text-[0.75rem] tracking-[0.04em]"
					>CMS</span
				></span
			>
		</header>
		{@render children()}
	</SidebarInset>
	<Toaster richColors position="bottom-right" />
</SidebarProvider>
