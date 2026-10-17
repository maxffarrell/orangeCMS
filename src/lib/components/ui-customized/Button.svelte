<script lang="ts">
	import { Button as ShadButton, type ButtonProps } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';

	// The shadcn-svelte Button, with the site's brand call-to-action look. `gold` and
	// `outline-dark` are variants of the shadcn Button itself; this wrapper only adds the
	// uppercase, wide-tracked, pill-shaped sizing used for page-level CTAs.
	let { variant = 'default', size, class: className, children, ...rest }: ButtonProps = $props();

	const brand = $derived(variant === 'gold' || variant === 'outline-dark');
</script>

<ShadButton
	{variant}
	size={brand ? undefined : size}
	class={cn(
		brand && 'font-body h-auto gap-2 rounded-full px-8 py-[0.9rem] text-[0.7rem] font-medium tracking-[0.2em] uppercase',
		brand && className?.includes('btn-arrow') && 'pr-4',
		className
	)}
	{...rest}
>
	{@render children?.()}
</ShadButton>
