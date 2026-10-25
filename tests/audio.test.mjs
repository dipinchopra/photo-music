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
  setTargetAtTime(v, time, constant) { this.value = v; this.target = { v, time, constant }; }
  cancelAndHoldAtTime(time) { this.heldAt = time; }
  exponentialRampToValueAtTime(v) { this.value = v; }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param(); frequency = new Param(); threshold = new Param();
  ratio = new Param(); delayTime = new Param();
  connections = [];
  connect(node) { this.connections.push(node); }
  disconnect() {}
  start(time) { this.startTime = time; }
  stop(time) { this.stopTime = time; }
}
class Context {
  static instances = [];
  state = 'running'; currentTime = 0; sampleRate = 8000; destination = new Node();
  oscillators = []; filters = []; gains = []; resumeCalls = 0;
  constructor() { Context.instances.push(this); }
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createDelay() { this.delay = new Node(); return this.delay; }
  createDynamicsCompressor() { return new Node(); }
  createMediaStreamDestination() { return { ...new Node(), stream: {} }; }
  createBufferSource() { return new Node(); }
  createBiquadFilter() { const filter = new Node(); this.filters.push(filter); return filter; }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  async resume() { this.resumeCalls++; this.state = 'running'; this.onstatechange?.(); }
}
let timerId = 0;
globalThis.window = { AudioContext: Context, setTimeout: fn => { queueMicrotask(fn); return ++timerId; }, clearTimeout: () => {} };
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
    if (instrument === 'bass') assert.equal(totals[1], totals[0], 'bass circles share the steady foundation');
    else assert.ok(totals[1] > totals[0], `${instrument}: more circles must add musical activity`);
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


test('all instruments on one beat share an exact audio timestamp and no default echo sends', async () => {
  const engine = new ChordEngine();
  engine.setComposition({ ...composeImage([cell]), style: 'plucked' });
  await engine.playPlacements(['keys', 'guitar', 'bass', 'drums'].map((instrument, index) => ({
    ...placement, instrument, id: index + 1, tone: { ...cell, brightness: instrument === 'drums' ? 0.1 : 0.5 },
  })));
  const context = Context.instances.at(-1);
  assert.ok(context.oscillators.length >= 6);
  assert.deepEqual([...new Set(context.oscillators.map(node => node.startTime))], [0.02]);
  const reachable = (node, target, seen = new Set()) => {
    if (node === target) return true;
    if (!node || seen.has(node)) return false;
    seen.add(node);
    return (node.connections ?? []).some(next => reachable(next, target, seen));
  };
  assert.ok(context.oscillators.every(node => !reachable(node, context.delay)), 'zero delay must mean no echo route');
});
test('audio-clock scheduling keeps precise swung beats despite irregular timer callbacks', async () => {
  const engine = new ChordEngine();
  engine.setComposition({ ...composeImage([cell]), style: 'plucked', swing: 0.2 });
  await engine.playPlacements([{ ...placement, instrument: 'drums', tone: { ...cell, brightness: 0.9, texture: 1 } }]);
  const context = Context.instances.at(-1);
  // Record every scheduled pulse, including rests, rather than selected instrument notes.
  const original = engine.pulse.bind(engine);
  const scheduled = [0.02];
  engine.pulse = time => { scheduled.push(time); return original(time); };
  for (const time of [0.04, 0.09, 0.17, 0.245, 0.3, 0.37, 0.44, 0.51, 0.57, 0.64, 0.72, 0.8, 0.89, 0.96, 1.04]) {
    context.currentTime = time;
    engine.schedule();
  }
  assert.ok(scheduled.length >= 4);
  for (let i = 1; i < scheduled.length; i++) {
    const expected = (30 / 96) * (i % 2 === 1 ? 1.2 : 0.8);
    assert.ok(Math.abs(scheduled[i] - scheduled[i - 1] - expected) < 1e-9);
  }
  context.currentTime = 10;
  const count = scheduled.length;
  engine.schedule();
  assert.equal(scheduled.length, count + 1, 'do not burst missed beats after a stall');
  assert.equal(scheduled.at(-1), 10.02);
});


test('stopping cancels scheduled melody and drum sources before they sound', async () => {
  const engine = new ChordEngine();
  engine.setComposition({ ...composeImage([cell]), style: 'plucked' });
  await engine.playPlacements([
    placement,
    { ...placement, id: 2, instrument: 'drums', tone: { ...cell, brightness: 0.1 } },
  ]);
  const context = Context.instances.at(-1);
  assert.ok(context.oscillators.every(node => node.startTime > context.currentTime));
  engine.stop();
  assert.ok(context.oscillators.every(node => node.stopTime <= node.startTime));
  const count = context.oscillators.length;
  context.currentTime = 1;
  engine.schedule();
  assert.equal(context.oscillators.length, count);
});


test('Keys and Guitar arpeggiators produce ascending notes at the chosen rate', async () => {
  for (const instrument of ['keys', 'guitar']) {
    for (const rate of [1, 2]) {
      const engine = new ChordEngine();
      engine.setComposition({ ...composeImage([cell]), style: 'plucked' });
      engine.configure({ [`${instrument}Arp`]: 'up', [`${instrument}ArpRate`]: rate });
      await engine.playPlacements([{ ...placement, instrument }]);
      const context = Context.instances.at(-1);
      const frequencies = [context.oscillators[0].frequency.value];
      for (let step = 1; step < 8; step++) {
        const before = context.oscillators.length;
        engine.pulse();
        const added = context.oscillators.length > before;
        assert.equal(added, step % rate === 0);
        if (added) frequencies.push(context.oscillators[before].frequency.value);
      }
      assert.ok(frequencies[0] < frequencies[1] && frequencies[1] < frequencies[2] && frequencies[2] < frequencies[3]);
    }
  }
});


test('new image samples continuously change ringing voices without retriggering notes', async () => {
  const engine = new ChordEngine();
  engine.setComposition({ ...composeImage([cell]), style: 'plucked' });
  await engine.playPlacements([placement]);
  const context = Context.instances.at(-1);
  const cutoff = context.filters[0].frequency.value;
  const count = context.oscillators.length;
  engine.updatePlacements([placement]);
  assert.equal(context.filters[0].frequency.value, cutoff, 'same sampled pixels must not invent modulation');
  engine.updatePlacements([{ ...placement, tone: { ...cell, brightness: 0.95, saturation: 0.85 } }]);
  assert.ok(context.filters[0].frequency.value > cutoff, 'a brighter region must update the already-ringing filter');
  assert.equal(context.oscillators.length, count, 'do not add extra attacks during continuous sampling');
  engine.updatePlacements([{ ...placement, tone: { ...cell, brightness: 0.05, saturation: 0.1 } }]);
  assert.ok(context.filters[0].frequency.value < cutoff);
});


test('Clear releases sounding voices over 0.9 seconds instead of cutting them off', async () => {
  const engine = new ChordEngine();
  engine.setComposition({ ...composeImage([cell]), style: 'plucked' });
  await engine.playPlacements([placement]);
  const context = Context.instances.at(-1);
  context.currentTime = 0.1;
  engine.stop(0.9);
  assert.ok(context.oscillators.every(node => node.stopTime === 1));
  const envelopes = context.gains.filter(node => node.gain.heldAt === 0.1);
  assert.ok(envelopes.length > 0);
  assert.ok(envelopes.every(node => node.gain.target.constant === 0.225));
});
