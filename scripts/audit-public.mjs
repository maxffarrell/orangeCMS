import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { TextDecoder } from 'node:util';

// Publication guardrails, not an exhaustive secret scanner. Only indexed paths
// are inspected; untracked local files and ignored build output are not published.
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
const entries = git('ls-files', '--stage', '-z').toString().split('\0').filter(Boolean);
const forbidden = (process.env.CMS_FORBIDDEN_PATTERNS ?? '').split(/\r?\n/).filter(Boolean);
const decoder = new TextDecoder('utf-8', { fatal: true });
const failures = new Set();
const secrets = [
 ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
 ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
 ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
 ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
 ['Stripe live key', /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
 ['Google API key', /\bAIza[A-Za-z0-9_-]{35}\b/]
];
function inspect(path, bytes, source) {
 let content;
 try { content = decoder.decode(bytes); }
 catch { failures.add(`${path}: binary or invalid UTF-8 content (${source})`); return; }
 if (content.includes('\0')) failures.add(`${path}: binary content (${source})`);
 for (const [label, pattern] of secrets) if (pattern.test(content)) failures.add(`${path}: possible ${label} (${source})`);
 for (const value of forbidden) if (content.toLowerCase().includes(value.toLowerCase()) || path.toLowerCase().includes(value.toLowerCase())) failures.add(`${path}: forbidden site content (${source})`);
}
for (const entry of entries) {
 const separator = entry.indexOf('\t');
 const metadata = entry.slice(0, separator);
 const path = entry.slice(separator + 1);
 const [mode, object, stage] = metadata.split(' ');
 if (stage !== '0') { failures.add(`${path}: unresolved index entry`); continue; }
 if (mode !== '100644' && mode !== '100755') { failures.add(`${path}: symlinks and nested repositories require separate publication review`); continue; }
 if (/(^|\/)(?:node_modules|\.git|\.svelte-kit|\.wrangler|\.cache|\.aws|\.ssh|coverage|dist|build)(\/|$)/i.test(path) || /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|credentials(?:\..*)?|id_(?:rsa|ed25519)|\.DS_Store)$/i.test(path) || /\.(?:pem|key|p12|pfx|jks|sqlite(?:3)?|db|log)$/i.test(path)) failures.add(`${path}: local runtime, environment, credential, or data file`);
 if (path !== 'static/favicon.svg' && /\.(?:png|jpe?g|gif|webp|avif|ico|svg|pdf|mp[34]|mov|wav|zip|gz|woff2?|ttf|otf)$/i.test(path)) failures.add(`${path}: site asset must be supplied by the consumer`);
 inspect(path, git('cat-file', 'blob', object), 'index');
 try {
  if (!lstatSync(path).isFile()) failures.add(`${path}: working tree entry is not a regular file`);
  else inspect(path, readFileSync(path), 'working tree');
 } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!entries.length) failures.add('No indexed files found; stage the publication before auditing.');
if (failures.size) {
 console.error('Public repository audit failed:\n' + [...failures].map(value => `- ${value}`).join('\n'));
 process.exitCode = 1;
} else console.log(`Public repository audit passed (${entries.length} indexed files). This check does not guarantee that every secret or private reference has been identified.`);
