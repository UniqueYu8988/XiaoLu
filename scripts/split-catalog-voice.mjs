import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const [mapPath,inputPath,outputPath]=process.argv.slice(2);
if(!mapPath || !inputPath) throw new Error('Usage: node scripts/split-catalog-voice.mjs <catalog.json> <master.mp3> [output-directory]');
const map=JSON.parse(readFileSync(resolve(mapPath),'utf8'));
const entries=map.entries;
if(!Array.isArray(entries)||!entries.length||new Set(entries.map(x=>x.id)).size!==entries.length||entries.some(x=>!/^[a-z0-9-]+$/.test(x.id))) throw new Error('Invalid voice catalog');
const input=resolve(inputPath),out=resolve(outputPath||join(root,'tmp/voice-catalog-clips'));
const result=spawnSync('ffmpeg',['-hide_banner','-i',input,'-af','silencedetect=noise=-40dB:d=1.8','-f','null','NUL'],{encoding:'utf8',stdio:['ignore','ignore','pipe']});
if(result.error) throw result.error;
if(result.status!==0) throw new Error(result.stderr);
const starts=[...result.stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map(x=>Number(x[1]));
const ends=[...result.stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map(x=>Number(x[1]));
const duration=Number(JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',input],{encoding:'utf8'})).format.duration);
if(starts.length!==entries.length-1||ends.length!==starts.length||!Number.isFinite(duration)) throw new Error(`Expected ${entries.length-1} separators, got ${starts.length}/${ends.length}. No files changed.`);
mkdirSync(out,{recursive:true});
if(entries.some(x=>existsSync(join(out,`${x.id}.mp3`)))) throw new Error('Output already contains clips; choose a new staging directory.');
for(let i=0;i<entries.length;i++) {
  const start=i===0?0:Math.max(0,ends[i-1]-.12);
  const end=i===entries.length-1?duration:Math.min(duration,starts[i]+.15);
  if(end<=start) throw new Error(`Invalid boundary ${entries[i].id}`);
  execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-ss',String(start),'-to',String(end),'-i',input,'-codec:a','libmp3lame','-b:a','80k','-ar','44100','-ac','1',join(out,`${entries[i].id}.mp3`)],{stdio:'inherit'});
}
console.log(`Split ${entries.length} clips, preserving the supplied pace and gain: ${out}`);
