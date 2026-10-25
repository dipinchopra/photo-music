import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const encode = s => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(s)).toString('base64')}`;
const compositionUrl = encode(readFileSync(new URL('../src/composition.ts', import.meta.url), 'utf8'));
const padsUrl = encode(readFileSync(new URL('../src/pads.ts', import.meta.url), 'utf8'));
const { PHOTO_PADS } = await import(padsUrl);
const { sampleHarmony, sampleDrumStep } = await import(encode(readFileSync(new URL('../src/harmony.ts', import.meta.url), 'utf8')
  .replace("'./composition'", JSON.stringify(compositionUrl)).replace("'./pads'", JSON.stringify(padsUrl))));
const modes = [[0,2,3,5,7,8,10], [0,2,3,5,7,9,10], [0,2,4,5,7,9,11], [0,2,4,6,7,9,11]];

test('every pitched sample voice follows every image mode, tonic, chord and transpose', () => {
  for (const scale of modes) for (const tonic of [0,2,7,11]) for (const step of [0,8,16,24]) {
    const composition = {scale, tonic, progression: [0,3,4,5]};
    for (let index = 0; index < 12; index++) {
      const pad = PHOTO_PADS[index];
      const plain = sampleHarmony(composition, step, index, 0);
      const shifted = sampleHarmony(composition, step, index, 2);
      for (let i = 0; i < plain.length; i++) {
        const pitch = pad.sourceMidi + 12 * Math.log2(plain[i].rate);
        const degree = ((Math.round(pitch) - tonic) % 12 + 12) % 12;
        assert.ok(scale.includes(degree), `${pad.name} must stay diatonic`);
        assert.ok(Math.abs(shifted[i].rate / plain[i].rate - Math.pow(2,2/12)) < 1e-9);
      }
    }
  }
});

test('chord pads change interval quality rather than transposing a fixed minor recording', () => {
  const pitches = scale => sampleHarmony({scale, tonic: 0, progression: [0]}, 0, 0)
    .map(note => Math.round(50 + 12 * Math.log2(note.rate)));
  const minor = pitches(modes[0]), major = pitches(modes[2]);
  assert.equal(minor[1] - minor[0], 3);
  assert.equal(major[1] - major[0], 4);
  const progression = {scale: modes[2], tonic: 0, progression: [0,4]};
  const root = step => 50 + 12 * Math.log2(sampleHarmony(progression,step,0)[0].rate);
  assert.ok(Math.abs(root(8)-root(0)-7) < 1e-9);
});

test('drum samples stay unpitched and use complementary kick, snare and hat positions', () => {
  for (const index of [12,13,14,15]) assert.equal(sampleHarmony({scale:modes[2],tonic:7,progression:[4]},8,index,12)[0].rate,1);
  const pattern = index => Array.from({length:8},(_,step)=>sampleDrumStep(index,step,true,.5) ? step : -1).filter(step=>step>=0);
  assert.deepEqual(pattern(12),[0,2,4,6]);
  assert.deepEqual(pattern(13),[2,6]);
  assert.deepEqual(pattern(14),[1,3,5,7]);
});
