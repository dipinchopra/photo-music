import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const encode = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const padsUrl = encode(readFileSync(new URL('../src/pads.ts', import.meta.url), 'utf8'));
const { PHOTO_PADS, PAD_KEYS, SampleBank, photoPadAt, photoPadBounds, enterPhotoPad } = await import(padsUrl);
const visualsUrl = encode(readFileSync(new URL('../src/visuals.ts', import.meta.url), 'utf8'));
const { drawPadHit, PAD_EFFECT_SECONDS } = await import(encode(
  readFileSync(new URL('../src/padVisuals.ts', import.meta.url), 'utf8').replace("'./pads'", JSON.stringify(padsUrl)).replace("'./visuals'", JSON.stringify(visualsUrl))));

test('16 photo pads cover the photo once, with stable names and unique keys', () => {
  assert.equal(PHOTO_PADS.length, 16);
  assert.equal(new Set(PAD_KEYS).size, 16);
  assert.equal(new Set(PHOTO_PADS.map(p => p.file)).size, 16);
  for (const bounds of [{x: 30, y: 0, width: 200, height: 400}, {x: 0, y: 100, width: 400, height: 200}]) {
    for (let i = 0; i < 16; i++) {
      const cell = photoPadBounds(bounds, i);
      assert.equal(photoPadAt(bounds, cell.x + cell.width / 2, cell.y + cell.height / 2), i);
    }
    assert.equal(photoPadAt(bounds, bounds.x - 1, bounds.y), null, 'letterboxing is not a pad');
    assert.equal(photoPadAt(bounds, bounds.x + bounds.width, bounds.y + bounds.height), 15);
    assert.equal(photoPadAt(bounds, bounds.x, bounds.y), 0);
  }
});

test('all bundled samples are valid, distinct, bounded PCM with quiet endpoints', () => {
  const dir = new URL('../public/samples/dusk/', import.meta.url);
  assert.equal(readdirSync(dir).filter(f => f.endsWith('.wav')).length, 22);
  const signatures = new Set();
  let bytes = 0;
  const files = [...PHOTO_PADS, ...PHOTO_PADS.filter(p => p.voiceFile).map(p => ({file: p.voiceFile, name: p.voiceFile}))];
  for (const pad of files) {
    const data = readFileSync(new URL(`${pad.file}.wav`, dir)); bytes += data.length;
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WAVE');
    assert.equal(data.readUInt16LE(20), 1); assert.equal(data.readUInt16LE(22), 1);
    assert.equal(data.readUInt32LE(24), 32000); assert.equal(data.readUInt16LE(34), 16);
    assert.ok(data.length > 8000);
    let peak = 0, sum = 0;
    for (let i = 44; i < data.length; i += 2) { const value = data.readInt16LE(i); peak = Math.max(peak, Math.abs(value)); sum += value * value; }
    assert.ok(peak < 32767 && peak > 5000, pad.name);
    assert.ok(Math.sqrt(sum / ((data.length - 44) / 2)) > 200, `${pad.name} is audible`);
    assert.equal(data.readInt16LE(44), 0); assert.equal(data.readInt16LE(data.length - 2), 0);
    signatures.add(data.toString('base64'));
  }
  assert.equal(signatures.size, 22);
  assert.ok(bytes < 2000000);
});

test('a failed kit download can be retried; completed sounds are not downloaded again', async () => {
  const original = globalThis.fetch;
  const bank = new SampleBank();
  let fail = true, calls = 0;
  globalThis.fetch = async url => {
    calls++;
    if (fail && String(url).includes('round-kick')) return {ok: false};
    return {ok: true, arrayBuffer: async () => new ArrayBuffer(44)};
  };
  try {
    const ctx = { decodeAudioData: async () => ({duration: 1}) };
    await assert.rejects(bank.load(ctx, 'https://example.com/photo-music/samples/dusk/'));
    // Let the other parallel successful requests finish before retrying.
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(bank.ready, false);
    const before = calls; fail = false;
    await bank.load(ctx, 'https://example.com/photo-music/samples/dusk/');
    assert.equal(bank.ready, true); assert.equal(calls - before, 1);
  } finally { globalThis.fetch = original; }
});

test('each pad effect clips to its photo cell and ends without persistent decoration', () => {
  const bounds = {x: 0, y: 0, width: 400, height: 300};
  for (const pad of [0, 4, 8, 12]) {
    const calls = [];
    const ctx = new Proxy({}, {get: (_, key) => key === 'getTransform' ? () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}) : (...args) => calls.push([key, ...args]), set: () => true});
    drawPadHit(ctx, {}, bounds, {pad, started: 10}, 10.1, 2);
    assert.ok(calls.some(c => c[0] === 'clip'));
    assert.ok(calls.some(c => c[0] === 'drawImage'));
    assert.equal(calls.filter(c => c[0] === 'save').length, calls.filter(c => c[0] === 'restore').length);
    calls.length = 0;
    drawPadHit(ctx, {}, bounds, {pad, started: 10}, 10 + PAD_EFFECT_SECONDS + .01);
    assert.equal(calls.length, 0);
  }
});


test('multi-touch presses, swipes and releases trigger once per pad entry without hover playback', () => {
  const touches = new Map();
  assert.equal(enterPhotoPad(touches, 1, 0), true);
  assert.equal(enterPhotoPad(touches, 1, 0), false, 'holding does not repeat');
  assert.equal(enterPhotoPad(touches, 2, 0), true, 'a second finger can hit the same pad');
  assert.equal(enterPhotoPad(touches, 1, 1), true, 'swiping into another pad triggers it');
  assert.equal(enterPhotoPad(touches, 2, 0), false, 'the other held finger does not retrigger');
  touches.delete(1);
  assert.equal(enterPhotoPad(touches, 1, 1), true, 'release and retap triggers again');
  assert.equal(enterPhotoPad(touches, 1, null), false);
  assert.equal(enterPhotoPad(touches, 1, 1), true, 'reentry from outside the photo works');
});


test('live photo hits use every selected visual style and never paint pad labels or a grid', () => {
  for (const mode of ['living','fragments','ribbons','shapes','collage','displaced','quilt']) {
    const calls = [];
    const ctx = new Proxy({}, {get: (_,key) => key === 'getTransform' ? () => ({a:1,b:0,c:0,d:1,e:0,f:0})
      : key === 'createLinearGradient' ? () => ({addColorStop(){}}) : (...args) => calls.push([key,...args]), set:()=>true});
    drawPadHit(ctx, {}, {x:0,y:0,width:400,height:300}, {pad:0,started:0}, .2, 1, mode);
    assert.ok(calls.some(c=>c[0]==='clip'),mode);
    assert.equal(calls.some(c=>c[0]==='fillText'||c[0]==='strokeRect'),false,mode);
    if(mode==='quilt')assert.equal(calls.filter(c=>c[0]==='fillRect').length,1);
    if(mode==='shapes')assert.equal(calls.some(c=>c[0]==='drawImage'),false);
    if(mode==='collage'||mode==='displaced')assert.equal(calls.filter(c=>c[0]==='drawImage').length,1);
  }
});
