// The Cloudflare adapter supplies this module in development and production.
declare module 'cloudflare:workers' {
	export const env: Cloudflare.Env;
}

// Provided by the Workers runtime for `send_email` bindings.
declare module 'cloudflare:email' {
	export class EmailMessage {
		constructor(from: string, to: string, raw: string | ReadableStream);
		readonly from: string;
		readonly to: string;
	}
}
