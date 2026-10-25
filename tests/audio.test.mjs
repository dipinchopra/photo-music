import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const encode = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const compositionUrl = encode(readFileSync(new URL('../src/composition.ts', import.meta.url), 'utf8'));
const musicSource = readFileSync(new URL('../src/music.ts', import.meta.url), 'utf8').replace("'./composition'", JSON.stringify(compositionUrl));
const { ChordEngine } = await import(encode(musicSource));
const { composeImage } = await import(compositionUrl);

class Param {
  value = 0;
  setValueAtTime(v) { this.value = v; }
  setTargetAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param(); frequency = new Param(); threshold = new Param();
  ratio = new Param(); delayTime = new Param();
  connect() {} disconnect() {} start() {} stop() {}
}
class Context {
  static instances = [];
  state = 'running'; currentTime = 0; sampleRate = 8000; destination = new Node();
  oscillators = []; resumeCalls = 0;
  constructor() { Context.instances.push(this); }
  createGain() { return new Node(); }
  createDelay() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createMediaStreamDestination() { return { ...new Node(), stream: {} }; }
  createBufferSource() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  async resume() { this.resumeCalls++; this.state = 'running'; this.onstatechange?.(); }
}
globalThis.window = { AudioContext: Context, setTimeout: () => 0 };
const cell = { hue: 40, brightness: 0.5, texture: 0.4, saturation: 0.5 };
const placement = { id: 1, x: 50, y: 50, radius: 40, level: 0.8, instrument: 'keys', tone: cell };

test('screen-lock interruption resumes the existing audio context and retained loop', async () => {
  const engine = new ChordEngine();
  await engine.playPlacements([placement]);
  const context = Context.instances.at(-1);
  context.state = 'interrupted';
  const count = context.oscillators.length;
  assert.deepEqual(engine.pulse(), []);
  assert.equal(context.oscillators.length, count, 'do not queue silent notes while interrupted');
  await engine.unlock();
  assert.equal(context.resumeCalls, 1);
  assert.equal(engine.running, true);
  const hits = Array.from({ length: 32 }, () => engine.pulse()).flat();
  assert.ok(hits.includes('keys'));
  assert.ok(context.oscillators.length > count);
});
test('a closed audio context is recreated without refreshing the page', async () => {
  const engine = new ChordEngine();
  await engine.unlock();
  const old = Context.instances.at(-1);
  old.state = 'closed';
  await engine.playPlacements([placement]);
  assert.notEqual(Context.instances.at(-1), old);
  assert.equal(engine.running, true);
});
test('a failed automatic resume can be retried by a user gesture', async () => {
  const engine = new ChordEngine();
  await engine.unlock();
  const context = Context.instances.at(-1);
  context.state = 'suspended';
  context.resume = async () => { throw new Error('gesture required'); };
  await assert.rejects(engine.unlock());
  context.resume = Context.prototype.resume;
  await engine.playPlacements([placement]);
  assert.equal(engine.running, true);
});
test('image palettes produce different oscillator spectra and groove timing', async () => {
  const signatures = [];
  for (const style of ['ambient', 'glass', 'plucked', 'pulse']) {
    const engine = new ChordEngine();
    const composition = { ...composeImage([cell]), style, swing: style === 'plucked' ? 0.2 : 0 };
    engine.setComposition(composition);
    await engine.playPlacements([placement]);
    const context = Context.instances.at(-1);
    signatures.push(JSON.stringify(context.oscillators.map(n => [n.type, n.frequency.value])));
    if (style === 'plucked') {
      assert.equal(engine.stepDuration(100), 360);
      engine.pulse();
      assert.equal(engine.stepDuration(100), 240);
    }
  }
  assert.equal(new Set(signatures).size, 4);
});


test('additional circles contribute independent notes while simultaneous attacks stay bounded', async () => {
  for (const instrument of ['keys', 'guitar', 'bass']) {
    const totals = [];
    for (const count of [1, 8]) {
      const engine = new ChordEngine();
      engine.setComposition({ ...composeImage([cell]), style: 'plucked' });
      const played = new Set();
      let attacks = 0, tickAttacks = 0;
      engine.onPlacementHit = id => { played.add(id); attacks++; tickAttacks++; };
      const notes = Array.from({ length: count }, (_, i) => ({ ...placement, instrument, id: i + 1, tone: { ...cell, hue: 30 + i * 40 } }));
      await engine.playPlacements(notes);
      for (let step = 1; step < 128; step++) {
        tickAttacks = 0;
        engine.pulse();
        assert.ok(tickAttacks <= (instrument === 'bass' ? 1 : 2));
      }
      assert.equal(played.size, count, `${instrument}: every circle must be heard`);
      totals.push(attacks);
    }
    assert.ok(totals[1] > totals[0], `${instrument}: more circles must add musical activity`);
  }
});

test('keyboard notes retain a short gap per circle without the old long silences', async () => {
  const engine = new ChordEngine();
  engine.setComposition({ ...composeImage([cell]), style: 'plucked' });
  const steps = [];
  let step = 0;
  engine.onPlacementHit = () => steps.push(step);
  await engine.playPlacements([placement]);
  for (step = 1; step < 128; step++) engine.pulse();
  assert.ok(steps.length >= 20, 'one circle should have a moderate musical pace');
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] - steps[i - 1] >= 2);
});
