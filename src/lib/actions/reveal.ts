import type { Action } from 'svelte/action';

export const reveal: Action<HTMLElement, void> = (node) => {
	const observer = new IntersectionObserver(
		([entry]) => {
			if (entry.isIntersecting) {
				node.classList.add('visible');
				observer.disconnect();
			}
		},
		{ threshold: 0.1 }
	);
	observer.observe(node);
	return { destroy: () => observer.disconnect() };
};
