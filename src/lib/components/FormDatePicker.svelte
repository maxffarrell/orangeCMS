<script lang="ts">
	import { untrack } from 'svelte';
	import {
		getLocalTimeZone,
		parseDate,
		today,
		type DateValue,
	} from '@internationalized/date';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Calendar } from '#lib/components/ui/calendar/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import CalendarIcon from '@lucide/svelte/icons/calendar';

	interface Props {
		id: string;
		name: string;
		/** ISO yyyy-mm-dd */
		value?: string;
		range?: 'past' | 'future';
		invalid?: boolean;
		onchange?: (iso: string) => void;
	}
	let {
		id,
		name,
		value = '',
		range,
		invalid = false,
		onchange,
	}: Props = $props();

	// Match the server's date-only validation boundary in every browser timezone.
	const tz = getLocalTimeZone();
	const now = today('UTC');
	const minValue = $derived(range === 'future' ? now : parseDate('1900-01-01'));
	const maxValue = $derived(range === 'past' ? now : now.add({ years: 20 }));

	const parse = (iso: string): DateValue | undefined => {
		try {
			return iso ? parseDate(iso) : undefined;
		} catch {
			return undefined;
		}
	};

	let open = $state(false);
	let date = $state<DateValue | undefined>(untrack(() => parse(value)));
	const label = $derived(
		date
			? new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(
					date.toDate(tz),
				)
			: 'Pick a date',
	);
</script>

<!-- Submitted with the form as ISO yyyy-mm-dd -->
<input type="hidden" {name} value={date?.toString() ?? ''} />

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				type="button"
				variant="outline"
				aria-invalid={invalid}
				class="w-full justify-start font-normal {date
					? ''
					: 'text-muted-foreground'}"
			>
				<CalendarIcon data-icon="inline-start" />
				{label}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start">
		<Calendar
			type="single"
			bind:value={date}
			captionLayout="dropdown"
			{minValue}
			{maxValue}
			onValueChange={(v) => {
				open = false;
				onchange?.(v?.toString() ?? '');
			}}
		/>
	</Popover.Content>
</Popover.Root>
