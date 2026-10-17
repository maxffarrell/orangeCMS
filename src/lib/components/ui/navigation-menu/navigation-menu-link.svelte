<script lang="ts">
	import { NavigationMenu as NavigationMenuPrimitive } from "bits-ui";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: NavigationMenuPrimitive.LinkProps = $props();
</script>

<NavigationMenuPrimitive.Link
	bind:ref
	data-slot="navigation-menu-link"
	class={cn("flex items-center gap-1.5 p-0 text-sm transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-1 [&_svg:not([class*='size-'])]:size-4", className)}
	{...restProps}
/>
