import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const retakes=JSON.parse(readFileSync('assets/voice/retakes-slow.json','utf8')).entries;
const fresh=JSON.parse(readFileSync('assets/voice/companion-refresh.json','utf8')).entries;
assert.equal(retakes.length,159);
assert.equal(fresh.length,22);
const all=[...retakes,...fresh];
assert.equal(new Set(all.map(x=>x.id)).size,181);
for(const entry of all) {
  assert.ok(entry.message && entry.animation,entry.id);
  assert.ok(existsSync(`assets/voice/${entry.id}.mp3`),entry.id);
}
console.log('181 slow voice clips and transcript mappings verified.');
