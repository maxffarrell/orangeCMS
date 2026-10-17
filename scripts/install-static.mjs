import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateStaticSnapshot } from './publish-static.mjs';

/** Merge an approved snapshot into fresh build assets, retaining old hashed
 * client bundles used by its HTML while preserving the generated Worker entry. */
export async function installStaticSnapshot({snapshotDirectory,assetsDirectory}) {
 const snapshot = resolve(snapshotDirectory), target = resolve(assetsDirectory);
 if(snapshot === target || snapshot.startsWith(target + '/') || target.startsWith(snapshot + '/')) throw new Error('Snapshot and build assets must be separate directories');
 // Verify the entire artifact before the first modification of the build.
 const manifest = await validateStaticSnapshot(snapshot);
 await mkdir(target,{recursive:true});
 if((await lstat(target)).isSymbolicLink()) throw new Error('Build assets cannot be a symlink');
 for(const name of ['_headers','.assetsignore','.orangecms-static-installed']) {
  try { const stat=await lstat(resolve(target,name)); if(stat.isSymbolicLink() || !stat.isFile()) throw new Error('Build metadata must be regular files without symlinks'); } catch(failure) { if(failure.code!=='ENOENT') throw failure; }
 }
 const marker=resolve(target,'.orangecms-static-installed');
 try { await writeFile(marker,'Static snapshot installation attempted. Rebuild fresh assets before installing another snapshot.\n',{flag:'wx'}); }
 catch(failure) { if(failure.code==='EEXIST') throw new Error('A static snapshot was already installed here. Rebuild into a fresh assets directory before installing again; reusing it could retain deleted public content.'); throw failure; }
 const ignorePath=resolve(target,'.assetsignore');
 let ignore='';
 try { if((await lstat(ignorePath)).isSymbolicLink()) throw new Error('Build assets cannot be symlinks'); ignore=await readFile(ignorePath,'utf8'); } catch(failure) { if(failure.code!=='ENOENT') throw failure; }
 await writeFile(ignorePath,ignore+'\n.orangecms-static-installed\n');
 for(const file of manifest.files) {
  const destination = resolve(target,file.path);
  const parts = file.path.split('/');
  let directory = target;
  for(const part of parts.slice(0,-1)) {
   directory = resolve(directory,part);
   try { const stat=await lstat(directory); if(stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Build asset directories must be regular directories'); }
   catch(failure) { if(failure.code !== 'ENOENT') throw failure; await mkdir(directory); }
  }
  try { if((await lstat(destination)).isSymbolicLink()) throw new Error('Build assets cannot be symlinks'); }
  catch(failure) { if(failure.code !== 'ENOENT') throw failure; }
  await copyFile(resolve(snapshot,'assets',file.path),destination);
 }
 const headersPath=resolve(target,'_headers');
 let headers='';
 try { if((await lstat(headersPath)).isSymbolicLink()) throw new Error('Build assets cannot be symlinks'); headers=await readFile(headersPath,'utf8'); } catch(failure) { if(failure.code!=='ENOENT') throw failure; }
 for(const file of manifest.contentFiles) {
  const url='/'+file.path.split('/').map(encodeURIComponent).join('/');
  headers+=`\n${url}\n  Content-Type: ${file.contentType}\n  X-Content-Type-Options: nosniff\n  Cache-Control: public, max-age=31536000, immutable\n`;
 }
 if(manifest.contentFiles.length) await writeFile(headersPath,headers);
 return manifest;
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 try {
  const args=process.argv.slice(2), options={};
  for(let i=0;i<args.length;i+=2) { if(!args[i].startsWith('--') || !args[i+1]) throw new Error('Expected --option value arguments'); options[args[i].slice(2)]=args[i+1]; }
  if(!options.snapshot || !options.assets) throw new Error('Required: --snapshot --assets');
  const manifest=await installStaticSnapshot({snapshotDirectory:options.snapshot,assetsDirectory:options.assets});
  console.log(`Installed approved static snapshot: ${manifest.routes.length} routes, ${manifest.files.length} verified assets.`);
 } catch(failure) { console.error(failure.message);process.exitCode=1; }
}
