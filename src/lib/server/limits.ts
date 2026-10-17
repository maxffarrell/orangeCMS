// Cloudflare free tier limits — adjust if account is upgraded
export const LIMITS = {
	// R2: 10 GB-month storage free. Keep individual uploads small.
	upload: {
		maxImageBytes: 8 * 1024 * 1024, // 8 MB per image
		maxPdfBytes: 20 * 1024 * 1024, // 20 MB per PDF
		allowedImageTypes: [
			'image/jpeg',
			'image/png',
			'image/webp',
			'image/avif',
			'image/gif',
		],
		allowedPdfTypes: ['application/pdf'],
		allowedImageExtensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'],
		allowedPdfExtensions: ['pdf'],
	},

	// D1: 5M rows read/day, 100K rows written/day free.
	// The app is read-heavy and low-volume — no per-request enforcement needed,
	// but avoid SELECT * patterns and paginate large result sets.
	d1: {
		maxEntriesPerPage: 100,
		maxCollectionsPerPage: 100,
		maxPagesPerPage: 100,
		maxFormsPerPage: 50,
	},
} as const;
