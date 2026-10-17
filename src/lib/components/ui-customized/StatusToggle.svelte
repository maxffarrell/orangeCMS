<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Tooltip, TooltipContent, TooltipTrigger } from '#lib/components/ui/tooltip/index.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		id: number | string;
		on: boolean;
		onLabel: string;
		offLabel: string;
		tone?: 'teal' | 'gold';
		action?: string;
	}

	let { id, on, onLabel, offLabel, tone = 'teal', action = '?/toggle' }: Props = $props();

	const onClass = $derived(
		tone === 'gold'
			? 'border-gold/30 bg-gold/10 text-[#8a6d35] dark:text-gold'
			: 'border-teal/25 bg-teal/10 text-link'
	);
</script>

<form method="POST" {action} use:enhance>
	<input type="hidden" name="id" value={id} />
	<Tooltip>
		<TooltipTrigger type="submit" class="cursor-pointer rounded-3xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
			<Badge
				variant="outline"
				class={cn(
					'h-6 gap-1.5 px-2.5 transition-colors',
					on ? onClass : 'border-cream-dark text-text-light hover:border-navy/20'
				)}
			>
				<span class={cn('size-1.5 rounded-full', on ? 'bg-current' : 'bg-text-light/50')}></span>
				{on ? onLabel : offLabel}
			</Badge>
		</TooltipTrigger>
		<TooltipContent>Click to mark as {on ? offLabel.toLowerCase() : onLabel.toLowerCase()}</TooltipContent>
	</Tooltip>
</form>
