<script lang="ts">
	import { FlexRender } from '@tanstack/svelte-table';
	import type { ComponentProps } from 'svelte';

	let props: ComponentProps<typeof FlexRender> = $props();
</script>

<FlexRender {...props} />
