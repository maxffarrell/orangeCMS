import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STATIC_FORMAT = 'orangecms-static-v1';
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const reserved = /^\/(?:admin|api|files|mcp|oauth|\.well-known)(?:\/|$)/;
const PRIVATE_ASSET = /^(?:server|cloudflare-tmp|_worker\.js(?:$|[./])|_headers$|_redirects$|_routes\.json$|manifest\.json$)/i;
const MAX_ASSETS = 20000;
const internal = /^(?:_worker\.js|_headers|_redirects|_routes\.json|\.assetsignore|manifest\.json)$/;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function safeRelative(path) {
 if (typeof path !== 'string' || !path || isAbsolute(path) || /[\\\x00-\x1f\x7f?#]/.test(path) || /%(?:2e|2f|5c)/i.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid snapshot file path');
 return path;
}
function publicPath(path) {
 if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\x00-\x1f\x7f?#]/.test(path) || /%(?:2e|2f|5c)/i.test(path)) throw new Error('Invalid public route');
 const normalized = path === '/' ? '/' : path.replace(/\/$/, '');
 let decoded; try { decoded = decodeURIComponent(normalized); } catch { throw new Error('Invalid encoded public path'); }
 if (reserved.test(decoded) || normalized.includes(':') || normalized.slice(1).split('/').some(part => part === '.' || part === '..' || (normalized !== '/' && !part))) throw new Error('Only public content routes may be published');
 return normalized;
}
function matches(path, pattern) {
 const escaped = pattern.split('/').map(part => part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
 return new RegExp('^' + escaped + '/?$').test(path);
}
/** Expand configured content mounts; forms continue to use their dynamic Worker. */
export function buildPublicPaths(inventory) {
 const routes = inventory.routes ?? [];
 const paths = new Set();
 for (const route of routes) {
  if (route.kind === 'form' || route.kind === 'forms') continue;
  if (route.kind === 'page') {
   const pages = inventory.pages ?? [];
   if (route.path.includes(':slug')) for (const page of pages) paths.add(publicPath(route.path.replace(':slug', encodeURIComponent(page.slug))));
   else if (!inventory.pages || pages.some(page => page.slug === route.page)) paths.add(publicPath(route.path));
  } else if (route.kind === 'collection') {
   if (!inventory.collections || inventory.collections.some(collection => collection.slug === route.collection)) paths.add(publicPath(route.path));
  } else if (route.kind === 'entry') {
   for (const entry of inventory.entries ?? []) {
    if (entry.collection === route.collection && (entry.active === 1 || entry.active === true)) paths.add(publicPath(route.path.replace(':slug', encodeURIComponent(entry.slug))));
   }
  }
 }
 for (const path of inventory.paths ?? []) paths.add(publicPath(path));
 for (const path of paths) if (routes.some(route => (route.kind === 'form' || route.kind === 'forms') && matches(path,route.path))) throw new Error('Form routes must remain dynamic');
 return [...paths].sort();
}
async function regularFile(path) {
 const stat = await lstat(path);
 if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Snapshot sources must be regular files');
 if (stat.size > MAX_ASSET_BYTES) throw new Error('Snapshot asset exceeds the 25 MiB platform limit');
 return readFile(path);
}
async function readAsset(root, key) {
 safeRelative(key);
 let path = resolve(root);
 if ((await lstat(path)).isSymbolicLink()) throw new Error('Snapshot source directories cannot be symlinks');
 const parts = key.split('/');
 for (const part of parts.slice(0,-1)) {
  path = resolve(path,part);
  const stat=await lstat(path);
  if(stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Snapshot source directories must be regular directories');
 }
 return regularFile(resolve(root,key));
}
async function walk(root, directory = '') {
 const names = [];
 for (const entry of await readdir(resolve(root,directory), {withFileTypes:true})) {
  if (entry.isSymbolicLink()) throw new Error('Snapshot sources cannot contain symlinks');
  if (entry.name.startsWith('.') || internal.test(entry.name)) continue;
  const path = directory ? directory + '/' + entry.name : entry.name;
  if (PRIVATE_ASSET.test(path) || reserved.test('/'+decodeURIComponent(path)) && !path.startsWith('files/')) throw new Error('Build asset source contains private application paths');
  if (entry.isDirectory()) names.push(...await walk(root,path));
  else if (entry.isFile()) names.push(path);
 }
 return names.sort();
}
export async function validateStaticSnapshot(snapshotDirectory) {
 const snapshotStat=await lstat(snapshotDirectory);
 if(snapshotStat.isSymbolicLink() || !snapshotStat.isDirectory()) throw new Error('Snapshot directory must be a regular directory');
 const manifest = JSON.parse(await regularFile(resolve(snapshotDirectory,'manifest.json')));
 if (manifest.files?.length > MAX_ASSETS) throw new Error('Snapshot exceeds the Workers Free static asset limit');
 if (manifest.format !== STATIC_FORMAT || !Array.isArray(manifest.files) || !Array.isArray(manifest.routes) || !Array.isArray(manifest.contentFiles)) throw new Error('Invalid static snapshot manifest');
 const seen = new Set();
 for (const file of manifest.files) {
  safeRelative(file.path);
  if (PRIVATE_ASSET.test(file.path) || reserved.test('/'+decodeURIComponent(file.path)) && !file.path.startsWith('files/') || seen.has(file.path)) throw new Error('Invalid or duplicate snapshot asset');
  seen.add(file.path);
  const bytes = await readAsset(resolve(snapshotDirectory,'assets'),file.path);
  if (bytes.length !== file.size || digest(bytes) !== file.sha256) throw new Error('Static snapshot hash verification failed');
 }
 for (const route of manifest.routes) {
  publicPath(route.path);
  if (!seen.has(route.html) || !seen.has(route.data)) throw new Error('Snapshot route assets are missing');
 }
 for (const file of manifest.contentFiles) {
  safeRelative(file.key);
  if(file.path!=='files/'+file.key || !seen.has(file.path) || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[\x20-\x7e]*)?$/i.test(file.contentType ?? '') || file.contentType.length>200) throw new Error('Invalid snapshot media record');
 }
 return manifest;
}
async function capture(fetchImpl, origin, path, expectedType) {
 const response = await fetchImpl(new URL(path,origin), {redirect:'manual',headers:{Accept:expectedType}});
 const cacheControl = response.headers.get('cache-control') ?? '';
 // SvelteKit marks even anonymous public navigation data private/no-store.
 // This offline exporter sends no credentials and only requests selected public
 // routes. HTML remains strict; data is additionally validated as a SvelteKit
 // data response below before any artifact can replace the approved snapshot.
 const frameworkNavigation = expectedType === 'application/json' && /^private,\s*no-store$/i.test(cacheControl);
 if (response.status !== 200 || !response.headers.get('content-type')?.includes(expectedType) || response.headers.has('set-cookie') || (!frameworkNavigation && /(?:private|no-store)/i.test(cacheControl))) throw new Error('Public snapshot response failed validation');
 const bytes = Buffer.from(await response.arrayBuffer());
 if (bytes.length > MAX_ASSET_BYTES) throw new Error('Rendered snapshot exceeds the static asset limit');
 return bytes;
}
/** Export from a local, fully configured Worker. No cloud APIs or credentials. */
export async function publishStaticSnapshot({origin,inventory,assetsDirectory,filesDirectory,outputDirectory,fetchImpl=fetch}) {
 const server = new URL(origin);
 if (server.origin !== origin || server.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(server.hostname)) throw new Error('Snapshot rendering requires a loopback HTTP origin');
 const paths = buildPublicPaths(inventory);
 if (!paths.length) throw new Error('No public content routes selected');
 const output = resolve(outputDirectory);
 const assets = resolve(assetsDirectory);
 const overlaps = (a,b) => a===b || a.startsWith(b+'/') || b.startsWith(a+'/');
 if(overlaps(output,assets) || (filesDirectory && overlaps(output,resolve(filesDirectory)))) throw new Error('Snapshot output must be separate from its source directories');
 await mkdir(dirname(output), {recursive:true});
 const staging = output + '.staging-' + randomUUID();
 const backup = output + '.previous-' + randomUUID();
 const records = new Map();
 const manifest = {format:STATIC_FORMAT,generatedAt:new Date().toISOString(),routes:[],files:[],contentFiles:[]};
 await mkdir(resolve(staging,'assets'), {recursive:true});
 const put = async (path,bytes) => {
  safeRelative(path);
  const hash = digest(bytes);
  if (records.has(path) && records.get(path).sha256 !== hash) throw new Error('Two snapshot assets have the same path with different contents');
  await mkdir(dirname(resolve(staging,'assets',path)), {recursive:true});
  await writeFile(resolve(staging,'assets',path),bytes);
  records.set(path,{path,size:bytes.length,sha256:hash});
 };
 try {
  for (const path of await walk(assets)) await put(path,await readAsset(assets,path));
  for (const file of inventory.files ?? []) {
   safeRelative(file.key);
   if (!filesDirectory || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Media publishing requires a verified local file manifest');
   const bytes = await readAsset(filesDirectory,file.key);
   if (digest(bytes) !== file.sha256) throw new Error('Local media hash verification failed');
   const path = 'files/' + file.key;
   await put(path,bytes);
   const contentType=file.contentType ?? ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif',pdf:'application/pdf'}[file.key.split('.').pop().toLowerCase()] ?? 'application/octet-stream');
   if(typeof contentType!=='string' || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[\x20-\x7e]*)?$/i.test(contentType) || contentType.length>200) throw new Error('Invalid media content type');
   manifest.contentFiles.push({key:file.key,path,size:bytes.length,sha256:file.sha256,contentType});
  }
  for (const path of paths) {
   let html = await capture(fetchImpl,origin,path,'text/html');
   if(/(?:\/@vite\/client|src=["']\/src\/|vite-plugin-svelte)/.test(html.toString('utf8'))) throw new Error('Snapshot origin must serve the compiled production Worker');
   for(const match of html.toString('utf8').matchAll(/(?:src|href)=["']([^"']*\/_app\/[^"']*)["']/g)) {
    const url=new URL(match[1],origin);
    if(!records.has(decodeURIComponent(url.pathname.slice(1)))) throw new Error('Rendered page references a missing browser build asset');
   }
   for (const marker of inventory.requiredMarkers?.[path] ?? []) if (!html.toString('utf8').includes(marker)) throw new Error('Required public content marker is missing');
   const htmlText=html.toString('utf8');
   if(!/<body\b/i.test(htmlText)) throw new Error('Rendered public document has no body');
   html=Buffer.from(htmlText.replace(/<body\b([^>]*)>/i,(_,attributes)=>'<body'+attributes.replace(/\sdata-sveltekit-(?:reload|preload-data)(?:=(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?/gi,'')+' data-sveltekit-reload data-sveltekit-preload-data="off">'));
   const htmlPath = path === '/' ? 'index.html' : path.slice(1) + '/index.html';
   const dataPath = path === '/' ? '__data.json' : path.slice(1) + '/__data.json';
   const data = await capture(fetchImpl,origin,(path === '/' ? '' : path) + '/__data.json?x-sveltekit-invalidated=' + '1'.repeat(64),'application/json');
   const parsed = JSON.parse(data.toString('utf8'));
   if (parsed.type !== 'data' || !Array.isArray(parsed.nodes) || parsed.nodes.some(node => node && !['data', 'skip'].includes(node.type))) throw new Error('Invalid SvelteKit navigation snapshot');
   await put(htmlPath,html);
   await put(dataPath,data);
   manifest.routes.push({path,html:htmlPath,data:dataPath});
  }
  const knownMedia = new Set(manifest.contentFiles.map(file=>file.path));
  for (const route of manifest.routes) for (const path of [route.html,route.data]) {
   const text = (await readFile(resolve(staging,'assets',path))).toString('utf8');
   if (/https?:[^\s"'<>]*\.(?:r2\.dev|r2\.cloudflarestorage\.com)/i.test(text)) throw new Error('Public snapshot still references an R2 media endpoint');
   for (const match of text.matchAll(/\/files\/([^\s"'<>\\)]*)/g)) {
    const key = decodeURIComponent(match[1].split(/[?#]/)[0]);
    if (!knownMedia.has('files/'+key) && !records.has('files/'+key)) throw new Error('Published content references media absent from its verified inventory');
   }
  }
  if(records.size > MAX_ASSETS) throw new Error('Snapshot exceeds the Workers Free static asset limit');
  manifest.files = [...records.values()].sort((a,b)=>a.path.localeCompare(b.path));
  await writeFile(resolve(staging,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await validateStaticSnapshot(staging);
  let hadPrevious = false;
  try {
   await lstat(output);
   await validateStaticSnapshot(output);
   await rename(output,backup);
   hadPrevious = true;
  } catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
  try { await rename(staging,output); }
  catch (failure) { if(hadPrevious) await rename(backup,output); throw failure; }
  if(hadPrevious) await rm(backup,{recursive:true,force:true});
  return manifest;
 } catch (failure) {
  await rm(staging,{recursive:true,force:true});
  throw failure;
 }
}
function argumentsMap(args) {
 const options = {};
 for(let i=0;i<args.length;i+=2) {
  if(!args[i].startsWith('--') || !args[i+1]) throw new Error('Expected --option value arguments');
  options[args[i].slice(2)] = args[i+1];
 }
 return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 try {
  const args = argumentsMap(process.argv.slice(2));
  for(const name of ['origin','inventory','assets','output']) if(!args[name]) throw new Error('Required: --origin --inventory --assets --output; optional --files');
  const manifest = await publishStaticSnapshot({origin:args.origin,inventory:JSON.parse(await readFile(resolve(args.inventory),'utf8')),assetsDirectory:args.assets,filesDirectory:args.files,outputDirectory:args.output});
  console.log(`Published local snapshot: ${manifest.routes.length} routes, ${manifest.contentFiles.length} media files, ${manifest.files.length} assets. No deployment performed.`);
 } catch (failure) { console.error(failure.message); process.exitCode=1; }
}
