<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import UploadCloudIcon from '@lucide/svelte/icons/upload-cloud';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import XIcon from '@lucide/svelte/icons/x';

	interface Props {
		name: string;
		value?: string;
		accept: 'image/*' | 'application/pdf';
		prefix?: string;
		label?: string;
	}

	let { name, value = $bindable(''), accept, prefix = '', label }: Props = $props();

	let uploading = $state(false);
	let dragover = $state(false);
	let uploadError = $state('');

	const isImage = $derived(accept === 'image/*');
	const filename = $derived(value ? value.split('/').pop() ?? value : '');

	const MAX_BYTES = $derived(isImage ? 8 * 1024 * 1024 : 20 * 1024 * 1024);
	const MAX_LABEL = $derived(isImage ? '8 MB' : '20 MB');

	function validate(file: File): string | null {
		if (file.size > MAX_BYTES) return `File is too large (max ${MAX_LABEL})`;
		if (isImage && !file.type.startsWith('image/')) return 'Please upload an image file';
		if (!isImage && file.type !== 'application/pdf') return 'Please upload a PDF file';
		return null;
	}

	async function upload(file: File) {
		uploadError = '';
		const err = validate(file);
		if (err) { uploadError = err; return; }
		uploading = true;
		try {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('prefix', prefix);
			const res = await fetch('/api/upload', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(await res.text());
			const { path } = (await res.json()) as { path: string };
			value = path;
		} catch (e) {
			uploadError = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragover = false;
		const file = e.dataTransfer?.files[0];
		if (file) upload(file);
	}

	function onChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) upload(file);
	}

	function clear() {
		value = '';
		uploadError = '';
	}
</script>

<div>
	{#if label}
		<p class="text-[0.68rem] font-medium tracking-[0.12em] uppercase text-text-light mb-2">{label}</p>
	{/if}

	<input type="hidden" {name} bind:value />

	{#if value}
		<!-- Uploaded state -->
		<div class="relative rounded-xl border border-cream-dark overflow-hidden bg-cream/40">
			{#if isImage}
				<img src={value} alt="Uploaded" class="w-full h-40 object-cover" />
			{:else}
				<div class="flex items-center gap-3 px-4 py-4">
					<FileTextIcon size={20} class="text-heading/50 shrink-0" />
					<span class="text-[0.82rem] font-mono text-heading truncate flex-1">{filename}</span>
				</div>
			{/if}
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				onclick={clear}
				class="absolute top-2 right-2 size-7 rounded-full bg-navy/70 text-white hover:bg-navy hover:text-white"
				aria-label="Remove file"
			>
				<XIcon size={13} />
			</Button>
		</div>
	{:else}
		<!-- Drop zone -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<Label
			class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors
				{dragover
					? 'border-gold bg-gold/5'
					: 'border-cream-dark hover:border-navy/25 hover:bg-cream/40'}
				{uploading ? 'opacity-60 pointer-events-none' : ''}"
			ondragover={(e) => { e.preventDefault(); dragover = true; }}
			ondragleave={() => { dragover = false; }}
			ondrop={onDrop}
		>
			{#if uploading}
				<Spinner class="text-navy" />
				<span class="text-[0.75rem] text-text-light">Uploading…</span>
			{:else}
				<UploadCloudIcon size={24} class="text-heading/30" />
				<div class="text-center">
					<span class="text-[0.78rem] font-medium text-heading">Drop {isImage ? 'an image' : 'a PDF'} here</span>
					<span class="text-[0.75rem] text-text-light block mt-0.5">or click to browse</span>
				</div>
			{/if}
			<Input type="file" {accept} onchange={onChange} class="sr-only" tabindex={-1} />
		</Label>
	{/if}

	{#if uploadError}
		<p class="mt-1.5 text-[0.72rem] text-red-500">{uploadError}</p>
	{/if}
</div>
