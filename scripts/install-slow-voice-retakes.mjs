import {readFileSync,readdirSync,copyFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const maps=readdirSync(join(root,'docs/voice/慢语速重录')).filter(x=>/^0[1-8].*\.json$/.test(x)).sort();
if(maps.length!==8) throw new Error('Eight retake catalogs required');
const entries=maps.flatMap((name,index)=>JSON.parse(readFileSync(join(root,'docs/voice/慢语速重录',name),'utf8')).entries.map(entry=>({...entry,batch:index+1})));
if(entries.length!==159||new Set(entries.map(x=>x.id)).size!==159) throw new Error('Catalog count/identity mismatch');
// Validate the entire staging set before overwriting any runtime audio.
for(const e of entries) {
  const clip=join(root,'tmp/voice-retake-slow',String(e.batch),`${e.id}.mp3`);
  if(!existsSync(clip)) throw new Error(`Missing ${e.id}`);
  const duration=Number(JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',clip],{encoding:'utf8'})).format.duration);
  if(!Number.isFinite(duration)||duration<.6||duration>40) throw new Error(`Suspicious duration ${e.id}: ${duration}`);
}
const backup=join(root,'voice-source',`pre-slow-retake-${Date.now()}`);
mkdirSync(backup,{recursive:true});
for(const e of entries) {
  const target=join(root,'assets/voice',`${e.id}.mp3`);
  if(existsSync(target)) copyFileSync(target,join(backup,`${e.id}.mp3`));
  copyFileSync(join(root,'tmp/voice-retake-slow',String(e.batch),`${e.id}.mp3`),target);
}
writeFileSync(join(root,'assets/voice/retakes-slow.json'),JSON.stringify({version:'slow-2026-09',entries:entries.map(({batch,...entry})=>entry)},null,2)+'\n','utf8');
console.log(`Replaced ${entries.length} clips. Original audio backup: ${backup}`);
