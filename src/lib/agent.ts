/** Optional agent-discovery settings. Every field has a sensible default. */
export interface AgentConfig {
	/** Extra robots.txt Disallow paths. /admin, /api/ and /oauth/ are always disallowed. */
	robotsDisallow?: string[];
	/** Content Signals policy (contentsignals.org), published in robots.txt. */
	contentSignals?: string;
	/** An agent skill (SKILL.md) served under /.well-known/agent-skills. */
	skill?: { name: string; description: string; body: string };
}
export const DEFAULT_CONTENT_SIGNALS = 'search=yes, ai-input=yes, ai-train=no';
