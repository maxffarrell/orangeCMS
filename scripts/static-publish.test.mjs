import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPublicPaths, publishStaticSnapshot, validateStaticSnapshot } from './publish-static.mjs';
import { installStaticSnapshot } from './install-static.mjs';
import { getStaticPublishingResponse } from '../src/lib/server/static-publishing.ts';
const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture(run) {
 const root=await mkdtemp(join(tmpdir(),'orangecms-static-test-'));
 try {
  const assets=join(root,'build'),files=join(root,'media'),output=join(root,'published');
  await mkdir(join(assets,'_app/immutable'),{recursive:true});await mkdir(files);
  await writeFile(join(assets,'_app/immutable/client.js'),'browser code');
  await writeFile(join(assets,'_worker.js'),'PRIVATE WORKER');
  const bytes=Buffer.from([0,255,128]);await writeFile(join(files,'document.pdf'),bytes);
  const inventory={routes:[{path:'/',kind:'page',page:'home'},{path:'/journal/:slug',kind:'entry',collection:'articles'},{path:'/forms',kind:'forms'},{path:'/forms/:slug',kind:'form'}],pages:[{slug:'home'}],entries:[{collection:'articles',slug:'published',active:1},{collection:'articles',slug:'draft',active:0}],files:[{key:'document.pdf',sha256:sha(bytes),contentType:'application/pdf'}],requiredMarkers:{'/':['Published content']}};
  const requests=[];
  const fetchImpl=async (url,options) => {
   requests.push({url:String(url),options});
   return url.pathname.endsWith('/__data.json') ? Response.json({type:'data',nodes:[{type:'data',data:{content:'Published content',file:'/files/document.pdf'}}]}) : new Response('<html><head><script src="/_app/immutable/client.js"></script></head><body data-sveltekit-preload-data="hover"><h1>Published content</h1><a href="/files/document.pdf">Download</a></body></html>',{headers:{'content-type':'text/html'}});
  };
  await run({root,assets,files,output,inventory,fetchImpl,requests,bytes});
 } finally { await rm(root,{recursive:true,force:true}); }
}
test('public inventory expands published entries and excludes forms and infrastructure',()=>{
 assert.deepEqual(buildPublicPaths({routes:[{path:'/journal',kind:'collection',collection:'articles'},{path:'/journal/:slug',kind:'entry',collection:'articles'},{path:'/forms',kind:'forms'}],collections:[{slug:'articles'}],entries:[{collection:'articles',slug:'one',active:1},{collection:'articles',slug:'draft',active:0}],paths:['/about']}),['/about','/journal','/journal/one']);
 for(const path of ['/admin','/%61dmin','/a%2f../admin','/../admin','/oauth/token','/forms']) assert.throws(()=>buildPublicPaths({routes:[{path:'/forms',kind:'forms'}],paths:[path]}));
});
test('snapshot contains anonymous HTML/navigation/media and retained browser assets',()=>fixture(async f=>{
 const manifest=await publishStaticSnapshot({origin:'http://127.0.0.1:8787',inventory:f.inventory,assetsDirectory:f.assets,filesDirectory:f.files,outputDirectory:f.output,fetchImpl:f.fetchImpl});
 assert.equal(manifest.routes.length,2);assert.equal(manifest.contentFiles.length,1);
 assert.ok(!manifest.files.some(file=>file.path==='_worker.js'));
 const html=await readFile(join(f.output,'assets/index.html'),'utf8');assert.match(html,/data-sveltekit-reload/);assert.match(html,/data-sveltekit-preload-data="off"/);assert.ok(!html.includes('preload-data="hover"'));
 assert.deepEqual(await readFile(join(f.output,'assets/files/document.pdf')),f.bytes);
 assert.ok(f.requests.some(request=>request.url.includes('/journal/published/__data.json')));
 assert.ok(f.requests.every(request=>request.options.redirect==='manual' && !request.options.headers.Cookie && !request.options.headers.Authorization));
 await validateStaticSnapshot(f.output);
 const target=join(f.root,'deploy');await mkdir(target);await writeFile(join(target,'_worker.js'),'KEEP CURRENT WORKER');await writeFile(join(target,'_headers'),'KEEP CURRENT HEADERS\n');
 await installStaticSnapshot({snapshotDirectory:f.output,assetsDirectory:target});
 assert.equal(await readFile(join(target,'_worker.js'),'utf8'),'KEEP CURRENT WORKER');
 assert.match(await readFile(join(target,'_headers'),'utf8'),/Content-Type: application\/pdf/);
 assert.equal(await readFile(join(target,'_app/immutable/client.js'),'utf8'),'browser code');
 await assert.rejects(()=>installStaticSnapshot({snapshotDirectory:f.output,assetsDirectory:target}),/fresh assets directory/);
 assert.match(await readFile(join(target,'.assetsignore'),'utf8'),/orangecms-static-installed/);
}));
test('failed export retains the last approved snapshot and corrupted snapshots cannot install',()=>fixture(async f=>{
 const options={origin:'http://localhost:8787',inventory:f.inventory,assetsDirectory:f.assets,filesDirectory:f.files,outputDirectory:f.output,fetchImpl:f.fetchImpl};
 await publishStaticSnapshot(options);const approved=await readFile(join(f.output,'manifest.json'),'utf8');
 await assert.rejects(()=>publishStaticSnapshot({...options,fetchImpl:async()=>new Response('outage',{status:503})}));
 assert.equal(await readFile(join(f.output,'manifest.json'),'utf8'),approved);
 await writeFile(join(f.output,'assets/index.html'),'tampered');
 const target=join(f.root,'deploy');await mkdir(target);await writeFile(join(target,'index.html'),'old');
 await assert.rejects(()=>installStaticSnapshot({snapshotDirectory:f.output,assetsDirectory:target}));
 assert.equal(await readFile(join(target,'index.html'),'utf8'),'old');
}));
test('export rejects source overlap, symlink media, private responses and development HTML',()=>fixture(async f=>{
 const options={origin:'http://localhost:8787',inventory:f.inventory,assetsDirectory:f.assets,filesDirectory:f.files,outputDirectory:f.output,fetchImpl:f.fetchImpl};
 await assert.rejects(()=>publishStaticSnapshot({...options,outputDirectory:join(f.assets,'published')}));
 await assert.rejects(()=>publishStaticSnapshot({...options,outputDirectory:f.root}));
 await assert.rejects(()=>publishStaticSnapshot({...options,origin:'https://production.example.test'}));
 await assert.rejects(()=>publishStaticSnapshot({...options,fetchImpl:async()=>new Response('<body>private</body>',{headers:{'content-type':'text/html','set-cookie':'session=private'}})}));
 await assert.rejects(()=>publishStaticSnapshot({...options,fetchImpl:async()=>new Response('<body><script src="/@vite/client"></script></body>',{headers:{'content-type':'text/html'}})}));
 await mkdir(join(f.root,'secret'));await writeFile(join(f.root,'secret/a.pdf'),f.bytes);await symlink(join(f.root,'secret'),join(f.files,'linked'),'dir');
 await assert.rejects(()=>publishStaticSnapshot({...options,inventory:{...f.inventory,files:[{key:'linked/a.pdf',sha256:sha(f.bytes)}]}}));
}));
test('static publishing prevents live draft SSR and data reads while retaining dynamic forms and previews',()=>{
 const routes=[{path:'/responses',kind:'forms'},{path:'/responses/:slug',kind:'form'}];
 const check=path=>getStaticPublishingResponse(new Request('https://cms.example.test'+path),'1',routes);
 for(const path of ['/unpublished','/journal/draft','/journal/draft/__data.json','/%61dmin','/a%2f..%2fadmin']) assert.equal(check(path).status,404);
 for(const path of ['/admin','/oauth/token','/mcp/authorized','/.well-known/oauth-authorization-server','/api/upload','/responses','/responses/request','/responses/request/__data.json','/files/new-preview.png']) assert.equal(check(path),null);
 assert.equal(getStaticPublishingResponse(new Request('https://cms.example.test/draft'),undefined,routes),null);
});

test('installer rejects metadata symlinks before modifying build assets',()=>fixture(async f=>{
 await publishStaticSnapshot({origin:'http://localhost:8787',inventory:f.inventory,assetsDirectory:f.assets,filesDirectory:f.files,outputDirectory:f.output,fetchImpl:f.fetchImpl});
 for(const name of ['_headers','.assetsignore','.orangecms-static-installed']) {
  const target=join(f.root,'deploy-'+name.replace(/[^a-z]/g,''));await mkdir(target);
  const external=join(f.root,'outside-'+name.replace(/[^a-z]/g,''));await writeFile(external,'DO NOT CHANGE');
  await symlink(external,join(target,name));
  await assert.rejects(()=>installStaticSnapshot({snapshotDirectory:f.output,assetsDirectory:target}),/symlink/);
  assert.equal(await readFile(external,'utf8'),'DO NOT CHANGE');
  await assert.rejects(()=>readFile(join(target,'index.html')));
 }
}));
