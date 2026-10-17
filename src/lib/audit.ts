// Presentation helpers for the MCP audit log (rows come from recordAudit in server/db.ts).
export interface AuditChange {
	field: string;
	from: string;
	to: string;
}

export interface AuditRow {
	id: number;
	token_name: string | null;
	tool: string;
	target: string | null;
	changes: string | null;
	created_at: string;
}

export interface AuditView {
	id: number;
	kind: string;
	label: string;
	name: string;
	created: boolean;
	token: string;
	at: string;
	changes: AuditChange[];
	truncated: boolean;
}

const KINDS: Record<string, { kind: string; label: string }> = {
	save_tour: { kind: 'tour', label: 'Tour' },
	save_vendor: { kind: 'vendor', label: 'Vendor' },
	update_page: { kind: 'page', label: 'Page' },
	update_site_settings: { kind: 'settings', label: 'Settings' },
	save_form: { kind: 'form', label: 'Form' }
};

/** Stored rows keep at most 4000 chars of JSON, so a long diff may be cut off: salvage what parses. */
function parseChanges(raw: string | null): { changes: AuditChange[]; truncated: boolean } {
	if (!raw) return { changes: [], truncated: false };
	try {
		const v = JSON.parse(raw);
		if (Array.isArray(v)) return { changes: v.map(clean), truncated: false };
	} catch {
		/* fall through to salvage */
	}
	const salvaged: AuditChange[] = [];
	for (const m of raw.matchAll(/\{"field":"((?:[^"\\]|\\.)*)","from":"((?:[^"\\]|\\.)*)","to":"((?:[^"\\]|\\.)*)"\}/g)) {
		try {
			salvaged.push(clean({ field: JSON.parse(`"${m[1]}"`), from: JSON.parse(`"${m[2]}"`), to: JSON.parse(`"${m[3]}"`) }));
		} catch {
			/* skip malformed entry */
		}
	}
	return { changes: salvaged, truncated: true };
}

const clean = (c: Partial<AuditChange>): AuditChange => ({
	field: String(c.field ?? ''),
	from: String(c.from ?? ''),
	to: String(c.to ?? '')
});

export function toAuditView(r: AuditRow): AuditView {
	const k = KINDS[r.tool] ?? { kind: 'other', label: r.tool };
	const target = r.target ?? '';
	const created = /\(new\)\s*$/.test(target);
	const name = target.replace(/\s*\(new\)\s*$/, '').replace(/^[a-z]+:/, '') || k.label;
	const { changes, truncated } = parseChanges(r.changes);
	return {
		id: r.id,
		kind: k.kind,
		label: k.label,
		name,
		created,
		token: r.token_name ?? 'Environment secret',
		at: `${r.created_at.replace(' ', 'T')}Z`,
		changes,
		truncated
	};
}
