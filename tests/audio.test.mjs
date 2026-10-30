import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const encode = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const compositionUrl = encode(readFileSync(new URL('../src/composition.ts', import.meta.url), 'utf8'));
const padsUrl = encode(readFileSync(new URL('../src/pads.ts', import.meta.url), 'utf8'));
const harmonyUrl = encode(readFileSync(new URL('../src/harmony.ts', import.meta.url), 'utf8').replace("'./composition'", JSON.stringify(compositionUrl)).replace("'./pads'", JSON.stringify(padsUrl)));
const { sampleHarmony } = await import(harmonyUrl);
const musicSource = readFileSync(new URL('../src/music.ts', import.meta.url), 'utf8').replace("'./composition'", JSON.stringify(compositionUrl)).replace("'./pads'", JSON.stringify(padsUrl)).replace("'./harmony'", JSON.stringify(harmonyUrl));
const { ChordEngine } = await import(encode(musicSource));
const { composeImage } = await import(compositionUrl);

class Param {
  events = [];
  value = 0;
  setValueAtTime(v, time) { this.value = v; this.events.push({kind: 'set', value: v, time}); }
  setTargetAtTime(v, time, constant) { this.value = v; this.target = { v, time, constant }; }
  cancelAndHoldAtTime(time) { this.heldAt = time; }
  linearRampToValueAtTime(v, time) { this.value = v; this.events.push({kind: 'linear', value: v, time}); }
  exponentialRampToValueAtTime(v, time) { this.value = v; this.events.push({kind: 'exponential', value: v, time}); }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param(); playbackRate = new Param(); frequency = new Param(); threshold = new Param();
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
  bufferSources = []; oscillators = []; filters = []; gains = []; resumeCalls = 0;
  constructor() { Context.instances.push(this); }
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createDelay() { this.delay = new Node(); return this.delay; }
  createDynamicsCompressor() { return new Node(); }
  createMediaStreamDestination() { this.recordingDestination = { ...new Node(), stream: {} }; return this.recordingDestination; }
  createBufferSource() { const node = new Node(); this.bufferSources.push(node); return node; }
  async decodeAudioData(bytes) { return { original: bytes, duration: 1 }; }
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
  assert.ok(context.oscillators.length >= 4);
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

test('a frozen running Safari context is replaced without waiting for close or resume', async () => {
  const engine = new ChordEngine();
  await engine.playPlacements([placement]);
  const old = Context.instances.at(-1);
  old.resume = () => new Promise(() => {});
  old.close = () => new Promise(() => {});
  const originalTime = engine.playbackTime;
  await engine.rebuildPlayback([placement]);
  const fresh = Context.instances.at(-1);
  assert.notEqual(fresh, old);
  assert.equal(old.onstatechange, null);
  assert.equal(engine.running, true);
  fresh.currentTime = originalTime + 1;
  assert.ok(engine.playbackTime > originalTime);
  const hits = Array.from({ length: 32 }, () => engine.pulse()).flat();
  assert.ok(hits.includes('keys'), 'retained placements play through the rebuilt graph');
});

test('drums default to the photo groove rather than four-on-the-floor', () => {
  assert.equal(new ChordEngine().controls.fourOnFloor, false);
});


test('sample pads preload once, use buffer sources, and route through the recording mix', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async url => { requests.push(String(url)); return { ok: true, arrayBuffer: async () => new ArrayBuffer(48) }; };
  try {
    const engine = new ChordEngine();
    await Promise.all([engine.prepareSamples('https://example.com/photo-music/samples/dusk/'),
      engine.prepareSamples('https://example.com/photo-music/samples/dusk/')]);
    assert.equal(requests.length, 16);
    assert.equal(engine.samplesReady, true);
    const context = Context.instances.at(-1);
    const oscillators = context.oscillators.length;
    assert.equal(await engine.playSample(0, placement), true);
    const shot = context.bufferSources.find(source => source.buffer?.original);
    assert.ok(shot);
    assert.equal(shot.startTime, context.currentTime);
    assert.equal(context.oscillators.length, oscillators, 'pads trigger rendered samples rather than synth notes');
    assert.ok(context.filters.includes(shot.connections[0]));
    const output = shot.connections[0].connections[0].connections[0];
    const reaches = (node, target, seen = new Set()) => {
      if (node === target) return true;
      if (seen.has(node)) return false; seen.add(node);
      return (node.connections ?? []).some(next => reaches(next, target, seen));
    };
    assert.ok(reaches(output, context.recordingDestination), 'samples reach the recording mix');
    const streams = await engine.recordingStream();
    assert.ok(streams);
    engine.stopSamples();
    assert.ok(shot.stopTime > context.currentTime);
    await engine.prepareSamples('https://example.com/photo-music/samples/dusk/');
    assert.equal(requests.length, 16);
    assert.equal(await engine.playSample(0, placement, () => false), false, 'cancelled gestures never fire late');
    assert.equal(await engine.playSample(999, placement), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('image brightness filters sample pads and drum playback stays unpitched', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(48) });
  try {
    const engine = new ChordEngine();
    await engine.prepareSamples('https://example.com/samples/');
    engine.configure({ transpose: 12 });
    const context = Context.instances.at(-1);
    await engine.playSample(0, { ...placement, tone: { ...cell, brightness: 0.1 } });
    const dark = context.filters.at(-1).frequency.value;
    assert.equal(context.bufferSources.at(-1).playbackRate.value, sampleHarmony(engine.composition, 0, 0, 12).at(-1).rate);
    await engine.playSample(12, { ...placement, tone: { ...cell, brightness: 0.9 } });
    assert.ok(context.filters.at(-1).frequency.value > dark);
    assert.equal(context.bufferSources.at(-1).playbackRate.value, 1);
  } finally { globalThis.fetch = originalFetch; }
});


test('rapid pad playing is bounded and decoded samples survive audio context replacement', async () => {
  const originalFetch = globalThis.fetch;
  let downloads = 0;
  globalThis.fetch = async () => { downloads++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(48) }; };
  try {
    const engine = new ChordEngine();
    await engine.prepareSamples('https://example.com/samples/');
    for (let i = 0; i < 80; i++) await engine.playSample(i % 16, placement);
    const old = Context.instances.at(-1);
    assert.equal(engine.sampleVoices.length, 64);
    const first = old.bufferSources.find(source => source.buffer?.original);
    assert.ok(first.stopTime <= old.currentTime + .025);
    old.close = async () => { old.state = 'closed'; };
    await engine.rebuildPlayback([]);
    assert.equal(await engine.playSample(0, placement), true);
    assert.equal(downloads, 16, 'a recovered context reuses the decoded kit');
  } finally { globalThis.fetch = originalFetch; }
});


test('bright Place Loops partials have softened attacks and stay below the output Nyquist limit', async () => {
  const engine = new ChordEngine();
  engine.setComposition({ ...composeImage([cell]), style: 'glass' });
  await engine.unlock();
  const context = Context.instances.at(-1);
  engine.voice(700, .1, .4, .9, .002, 0);
  assert.equal(context.oscillators.length, 3);
  for (const osc of context.oscillators) {
    assert.ok(osc.frequency.value < context.sampleRate * .45);
    const filter = osc.connections[0];
    assert.ok(filter.frequency.value <= context.sampleRate * .45);
    const events = filter.connections[0].gain.events;
    assert.equal(events[0].value, .0001);
    assert.ok(events[1].time - osc.startTime >= .008, 'upper partials must not have click-like 2ms attacks');
    assert.equal(events.at(-1).value, .0001);
  }
  const before = context.oscillators.length;
  engine.tone(context.sampleRate * .48, .1, .3, 'sine', 12000, .002);
  assert.equal(context.oscillators.length, before, 'inaudible/alias-prone partials are omitted');
});

test('looping samples repeat on the shared beat clock alongside placed instruments', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(48) });
  try {
    const engine = new ChordEngine();
    engine.setComposition({ ...composeImage([cell]), style: 'plucked', swing: 0 });
    engine.configure({tempo: 120, fourOnFloor: true});
    await engine.prepareSamples('https://example.com/samples/');
    const drum = { ...placement, id: 2, instrument: 'drums', tone: { ...cell, brightness: .1 } };
    await engine.playPlacements([placement, drum]);
    await engine.toggleSampleLoop(12, drum, 1);
    const context = Context.instances.at(-1);
    for (let step = 1; step <= 8; step++) { context.currentTime = step * .25; engine.schedule(); }
    const times = context.bufferSources.filter(source => source.buffer?.original).map(source => source.startTime);
    assert.ok(times.length >= 3);
    for (let i = 1; i < times.length; i++) assert.ok(Math.abs(times[i] - times[i-1] - .5) < 1e-9);
    for (const time of times) assert.ok(context.oscillators.some(source => source.startTime === time),
      'placed kick and sampled kick use precisely the same timestamp');
    assert.ok(context.oscillators.length > 0, 'live samples do not replace the placed instruments');
    await engine.toggleSampleLoop(12, drum, 1);
    assert.deepEqual(engine.sampleLoopIndices, []);
    assert.ok(engine.placements.length > 0, 'stopping the pad loop leaves the board playing');
  } finally { globalThis.fetch = originalFetch; }
});

test('sample-only loops repeat by bar, and pause/recovery retains their state', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(48) });
  try {
    const engine = new ChordEngine();
    engine.setComposition({ ...composeImage([cell]), swing: 0 }); engine.configure({tempo: 120});
    await engine.prepareSamples('https://example.com/samples/');
    await engine.toggleSampleLoop(0, placement, 4);
    const context = Context.instances.at(-1);
    for (let step = 1; step <= 17; step++) { context.currentTime = step * .25; engine.schedule(); }
    const times = [...new Set(context.bufferSources.filter(source => source.buffer?.original).map(source => source.startTime))];
    assert.equal(times.length, 3);
    assert.ok(Math.abs(times[1] - times[0] - 2) < 1e-9);
    assert.ok(Math.abs(times[2] - times[1] - 2) < 1e-9);
    engine.stop(.12, true);
    assert.deepEqual(engine.sampleLoopIndices, [0]);
    const before = context.bufferSources.filter(source => source.buffer?.original).length;
    await engine.playPlacements([]);
    assert.ok(context.bufferSources.filter(source => source.buffer?.original).length > before, 'sample loop returns without needing a board placement');
    context.close = async () => { context.state = 'closed'; };
    await engine.rebuildPlayback([]);
    assert.deepEqual(engine.sampleLoopIndices, [0]);
    assert.ok(Context.instances.at(-1).bufferSources.some(source => source.buffer?.original));
    engine.clearSampleLoops(); assert.equal(engine.hasSampleLoops, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('one-shot samples never repeat, and removing a loop cancels its scheduled hit', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(48) });
  try {
    const engine = new ChordEngine();
    await engine.prepareSamples('https://example.com/samples/');
    await engine.playSample(0, placement);
    const context = Context.instances.at(-1);
    for (let i = 1; i < 20; i++) { context.currentTime = i; engine.schedule(); }
    assert.equal(new Set(context.bufferSources.filter(source => source.buffer?.original).map(source => source.startTime)).size, 1);
    await engine.toggleSampleLoop(1, placement, 4);
    const future = context.bufferSources.at(-1);
    assert.ok(future.startTime > context.currentTime);
    await engine.toggleSampleLoop(1, placement, 4);
    assert.equal(future.stopTime, context.currentTime);
    assert.equal(engine.hitTimers.size, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('drum one-shots snap to the running swung sixteenth grid without changing their pitch', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ok:true,arrayBuffer:async()=>new ArrayBuffer(48)});
  try {
    const engine = new ChordEngine();
    engine.setComposition({...composeImage([cell]),swing:.2}); engine.configure({tempo:120});
    await engine.prepareSamples('https://example.com/samples/'); await engine.playPlacements([placement]);
    const ctx = Context.instances.at(-1); ctx.currentTime = .1;
    await engine.playSample(12,placement);
    const shot = ctx.bufferSources.at(-1);
    assert.ok(Math.abs(shot.startTime - .17) < 1e-9, 'halfway between swung eighths .02 and .32');
    assert.equal(shot.playbackRate.value,1);
  } finally {globalThis.fetch=originalFetch;}
});

test('live harmony follows the audible chord rather than the scheduler lookahead chord', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ok:true,arrayBuffer:async()=>new ArrayBuffer(48)});
  try {
    const engine = new ChordEngine();
    engine.setComposition({...composeImage([cell]),tonic:0,scale:[0,2,4,5,7,9,11],progression:[0,4],swing:.2});
    engine.configure({tempo:120}); await engine.prepareSamples('https://example.com/samples/');
    engine.updatePlacements([placement]); engine.step = 7;
    const ctx = Context.instances.at(-1); ctx.currentTime=10; engine.schedule();
    ctx.currentTime=10.16;
    await engine.playSample(0,placement); // The G chord at 10.22 is already scheduled.
    let sources=ctx.bufferSources.filter(s=>s.buffer?.original && s.startTime===ctx.currentTime);
    assert.ok(Math.abs(sources[0].playbackRate.value-Math.pow(2,-2/12))<1e-9, 'C3 is still the audible chord root');
    ctx.currentTime=10.24; await engine.playSample(0,placement);
    sources=ctx.bufferSources.filter(s=>s.buffer?.original && s.startTime===ctx.currentTime);
    assert.ok(Math.abs(sources[0].playbackRate.value-Math.pow(2,5/12))<1e-9, 'G3 follows after the bar change');
  } finally {globalThis.fetch=originalFetch;}
});


test('placed and live mix levels are independent and update sustained voices without retriggering', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ok:true,arrayBuffer:async()=>new ArrayBuffer(48)});
  try {
    const engine = new ChordEngine();
    await engine.prepareSamples('https://example.com/samples/');
    await engine.playPlacements([placement]); await engine.playSample(0, placement);
    const context = Context.instances.at(-1);
    assert.equal(engine.placedMaster.gain.value, 1);
    assert.equal(engine.sampleMaster.gain.value, .55);
    const sourceCount = context.bufferSources.length, oscillatorCount = context.oscillators.length;
    engine.configure({placedLevel:.3, sampleLevel:.7, keys:.9, sampleKeys:.2});
    assert.equal(engine.placedMaster.gain.target.v,.3);
    assert.equal(engine.sampleMaster.gain.target.v,.7);
    assert.equal(engine.placedMix.get('keys').gain.target.v,.9);
    assert.equal(engine.sampleMix.get('keys').gain.target.v,.2);
    assert.equal(engine.sampleMaster.gain.target.constant,.025, 'mix changes ramp smoothly');
    assert.equal(context.bufferSources.length,sourceCount);
    assert.equal(context.oscillators.length,oscillatorCount);
    const sample = context.bufferSources.find(source=>source.buffer?.original);
    const sampleGroup = sample.connections[0].connections[0].connections[0];
    assert.equal(sampleGroup,engine.sampleMix.get('keys'));
    const tone = context.oscillators[0];
    const placedGroup = tone.connections[0].connections[0].connections[0].connections[0];
    assert.equal(placedGroup,engine.placedMix.get('keys'));
    engine.configure({sampleLevel:0});
    assert.equal(engine.placedMaster.gain.target.v,.3, 'muting live pads leaves placed loops unchanged');
    engine.configure({placedLevel:0});
    assert.equal(engine.sampleMaster.gain.target.v,0);
  } finally {globalThis.fetch=originalFetch;}
});

test('separate mix levels survive Safari audio graph reconstruction', async () => {
  const engine = new ChordEngine();
  engine.configure({placedLevel:.65,sampleLevel:.4,sampleBass:.2,bass:.8});
  await engine.unlock(); const old=Context.instances.at(-1);
  old.close=async()=>{old.state='closed';};
  await engine.rebuildPlayback([placement]);
  assert.equal(engine.placedMaster.gain.value,.65);
  assert.equal(engine.sampleMaster.gain.value,.4);
  assert.equal(engine.sampleMix.get('bass').gain.value,.2);
  assert.equal(engine.placedMix.get('bass').gain.value,.8);
});

test('Shuffle fades down and up on beats, commits only at the quiet handoff, and leaves live audio alone', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ok:true,arrayBuffer:async()=>new ArrayBuffer(48)});
  try {
    const engine=new ChordEngine();
    engine.setComposition({...composeImage([cell]),style:'plucked',swing:.2}); engine.configure({tempo:120});
    await engine.prepareSamples('https://example.com/samples/');
    await engine.playPlacements([placement]);
    await engine.playSample(12, placement);
    const context=Context.instances.at(-1);
    const sample=context.bufferSources.find(s=>s.buffer?.original);
    const oldSources=[...engine.placedVoices];
    const next=[{...placement,id:22,x:180}];
    let commits=0;
    const transition=engine.shufflePlacements(next,()=>{commits++;});
    assert.equal(commits,0,'do not replace the board on the button click');
    for(let i=1;i<=2;i++){context.currentTime=i*.25;engine.schedule();}
    const fade=engine.shuffleGain.gain.events;
    assert.deepEqual(fade.map(e=>e.value),[1,0,1]);
    assert.ok(Math.abs(fade[1].time-fade[0].time-.5)<1e-9);
    assert.ok(Math.abs(fade[2].time-fade[1].time-.5)<1e-9);
    assert.equal(commits,0,'the outgoing arrangement plays during fade down');
    for(let i=3;i<=7;i++){context.currentTime=i*.25;engine.schedule();}
    assert.equal(await transition,true);
    assert.equal(commits,1);
    assert.equal(engine.placements[0].id,22);
    assert.ok(oldSources.every(source=>Math.abs(source.stopTime-fade[1].time)<1e-9),'old voices end at zero gain');
    assert.equal(sample.stopTime,undefined,'live samples are not faded or stopped');
    assert.equal(engine.sampleMaster.gain.value,.55);
  } finally {globalThis.fetch=originalFetch;}
});

test('cancelled Shuffle cannot replace a cleared board, and silent boards do not wait for a beat', async () => {
  const engine=new ChordEngine();
  await engine.playPlacements([placement]);
  let commits=0;
  const pending=engine.shufflePlacements([{...placement,id:2}],()=>{commits++;});
  engine.stop();
  assert.equal(await pending,false);
  const context=Context.instances.at(-1); context.currentTime=8;engine.schedule();
  assert.equal(commits,0);
  assert.equal(await engine.shufflePlacements([placement],()=>{commits++;engine.updatePlacements([placement]);}),true);
  assert.equal(commits,1);
});

test('tempo edits safely cancel a pending shuffle without changing the arrangement', async () => {
  const engine=new ChordEngine(); await engine.playPlacements([placement]);
  const pending=engine.shufflePlacements([{...placement,id:2}],()=>assert.fail('stale shuffle committed'));
  engine.configure({tempo:120});
  assert.equal(await pending,false);
  assert.equal(engine.placements[0].id,placement.id);
});

test('moving regions keep the current motif, then develop notes at the next phrase boundary', async () => {
  const engine = new ChordEngine();
  engine.setComposition({...composeImage([cell]), style:'plucked'});
  const initial = {...placement, tone:{...cell, profile:{contour:Array(8).fill(.15),activity:Array(8).fill(.3)}}};
  await engine.playPlacements([initial]);
  const original = structuredClone(engine.loopPhrases.get(1).score);
  const moved = {...initial, tone:{...cell,hue:220,brightness:.9,profile:{contour:Array(8).fill(.95),activity:Array(8).fill(.9)}}};
  engine.updatePlacements([moved]);
  for(let i=1;i<16;i++) engine.pulse();
  assert.deepEqual(engine.loopPhrases.get(1).score,original,'motion must not rewrite the phrase mid-bar');
  engine.pulse();
  const developed=engine.loopPhrases.get(1).score;
  assert.notDeepEqual(developed.notes.map(n=>n.degree),original.notes.map(n=>n.degree));
  assert.deepEqual(developed.notes.map(n=>n.active),original.notes.map(n=>n.active),'rhythm identity survives motion');
  assert.ok(developed.tone.brightness>.5 && developed.tone.brightness<.9);
});

test('key and octave settings transpose generated loops without changing event timing', async () => {
  const render = async settings => {
    const engine=new ChordEngine();
    engine.setComposition({...composeImage([cell]),style:'plucked'});
    engine.setLoopTheory({key:0,scale:'major',octave:0,range:2,...settings});
    const hitSteps=[];
    let step=0;
    engine.onPlacementHit=()=>hitSteps.push(step);
    await engine.playPlacements([placement]);
    const context=Context.instances.at(-1);
    for(step=1;step<64;step++) engine.pulse();
    return {frequencies:context.oscillators.map(n=>n.frequency.value),hitSteps};
  };
  const original=await render({}), keyed=await render({key:2}), octave=await render({octave:1});
  assert.deepEqual(original.hitSteps,keyed.hitSteps);
  assert.deepEqual(original.hitSteps,octave.hitSteps);
  assert.equal(original.frequencies.length,keyed.frequencies.length);
  original.frequencies.forEach((frequency,i)=>{
    assert.ok(Math.abs(keyed.frequencies[i]/frequency-Math.pow(2,2/12))<1e-8);
    assert.ok(Math.abs(octave.frequencies[i]/frequency-2)<1e-8);
  });
});

test('keys and guitar answer each other and image contour affects rendered notes at identical average color', async () => {
  const render=async reverse=>{
    const engine=new ChordEngine();
    engine.setComposition({...composeImage([cell]),style:'plucked'});
    const contour=[.1,.2,.3,.4,.6,.7,.8,.9];
    const tone={...cell,profile:{contour:reverse?[...contour].reverse():contour,activity:Array(8).fill(.5)}};
    const steps=new Map();let step=0;
    engine.onPlacementHit=id=>{const list=steps.get(id)??[];list.push(step);steps.set(id,list);};
    await engine.playPlacements([{...placement,tone},{...placement,id:2,instrument:'guitar',tone}]);
    const context=Context.instances.at(-1);
    for(step=1;step<64;step++) engine.pulse();
    return {steps,frequencies:context.oscillators.map(n=>n.frequency.value)};
  };
  const forward=await render(false),backward=await render(true);
  assert.equal(forward.steps.get(1)[0],0);
  assert.ok(forward.steps.get(2)[0]>0,'answer leaves the lead opening space');
  assert.deepEqual(forward.steps,backward.steps,'only contour direction changes');
  assert.notDeepEqual(forward.frequencies,backward.frequencies,'spatial differences must reach the synthesizer');
});

test('every arp tick has an audible envelope through phrase rests, in both instruments and all patterns', async () => {
  for (const instrument of ['keys','guitar']) for (const mode of ['up','down','upDown']) for (const rate of [1,2]) {
    const engine=new ChordEngine();
    engine.setComposition({...composeImage([cell]),style:'plucked',progression:[0]});
    engine.configure({[`${instrument}Arp`]:mode,[`${instrument}ArpRate`]:rate});
    await engine.playPlacements([{...placement,instrument}]);
    const context=Context.instances.at(-1);
    for(let step=1;step<64;step++) {
      const before=context.oscillators.length;
      engine.pulse();
      const voices=context.oscillators.slice(before);
      assert.equal(voices.length>0,step%rate===0,`${instrument} ${mode} step ${step}`);
      for(const osc of voices) {
        const filter=osc.connections[0], gain=filter.connections[0];
        const peak=gain.gain.events.find(event=>event.kind==='exponential');
        assert.ok(peak.value>.001,`${instrument} ${mode}: arp step ${step} must have a real attack, including phrase rests`);
      }
    }
  }
});

test('motion changes arp timbre without changing its phase, and switching off returns to the motif', async () => {
  const render=async moving=>{
    const engine=new ChordEngine();
    engine.setComposition({...composeImage([cell]),style:'plucked',progression:[0]});
    engine.configure({keysArp:'upDown',keysArpRate:1});
    await engine.playPlacements([placement]);
    const context=Context.instances.at(-1);
    for(let step=1;step<16;step++) {
      if(moving) engine.updatePlacements([{...placement,tone:{...cell,hue:step%2?260:5}}]);
      engine.pulse();
    }
    const frequencies=context.oscillators.map(n=>n.frequency.value);
    engine.configure({keysArp:'off'});
    let silentSteps=0;
    for(let step=16;step<32;step++) {
      const before=context.oscillators.length; engine.pulse();
      if(before===context.oscillators.length) silentSteps++;
    }
    assert.ok(silentSteps>0,'turning arp off restores motif rests');
    return frequencies;
  };
  assert.deepEqual(await render(true),await render(false));
});

async function withSampleKit(run) {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(48)});
  try {
    const engine=new ChordEngine();
    engine.setComposition({...composeImage([cell]),style:'plucked',swing:0});
    engine.configure({tempo:120});
    await engine.prepareSamples('https://example.com/samples/');
    await run(engine,Context.instances.at(-1));
  } finally {globalThis.fetch=original;}
}
function advanceAudio(engine,context,until) {
  while(context.currentTime+.025<until) {context.currentTime+=.025;engine.schedule();}
  context.currentTime=until;engine.schedule();
}
const sampleStarts=(engine,context,index)=>context.bufferSources.filter(source=>source.buffer===engine.samples.get(index)).map(source=>source.startTime);

test('multiple layers queue onto the placed ensemble bar, then stop with a fade on a later bar', async()=>{
  await withSampleKit(async(engine,context)=>{
    await engine.playPlacements([placement]);
    advanceAudio(engine,context,.3);
    await Promise.all([engine.toggleSampleLoop(0,placement,4,()=>true,4),engine.toggleSampleLoop(1,placement,4,()=>true,4)]);
    assert.equal(engine.sampleLoops.get(0).startStep,8);
    assert.equal(engine.sampleLoops.get(1).startStep,8);
    assert.ok(engine.sampleLoopStates.every(state=>state.status==='queued'));
    for(let step=2;step<=8;step++){advanceAudio(engine,context,step*.25);}
    assert.ok(sampleStarts(engine,context,0).every(time=>Math.abs(time-2.02)<1e-9));
    assert.deepEqual(sampleStarts(engine,context,1).slice(0,1),sampleStarts(engine,context,0).slice(0,1));
    context.currentTime=2.03;
    assert.ok(engine.sampleLoopStates.every(state=>state.status==='playing'));
    const sounding=engine.sampleVoices.find(voice=>voice.index===0);
    advanceAudio(engine,context,2.3);
    await engine.toggleSampleLoop(0,placement,4,()=>true,4);
    assert.equal(engine.sampleLoopStates.find(state=>state.index===0).status,'stopping');
    assert.equal(sounding.source.stopTime,undefined);
    for(let step=10;step<=16;step++){advanceAudio(engine,context,step*.25);}
    assert.deepEqual(engine.sampleLoopIndices,[1]);
    assert.ok(Math.abs(sounding.source.stopTime-4.22)<1e-9);
    assert.ok(sounding.gain.gain.events.some(event=>event.kind==='linear'&&Math.abs(event.time-4.2)<1e-9&&event.value===.0001));
    assert.equal(engine.placements.length,1,'the placed ensemble survives removing a layer');
    assert.ok(engine.sampleVoices.some(voice=>voice.index===1&&voice.source.stopTime===undefined));
  });
});

test('simultaneous idle launches join the same already-scheduled boundary without duplicate attacks', async()=>{
  await withSampleKit(async(engine,context)=>{
    await Promise.all([engine.toggleSampleLoop(0,placement,4,()=>true,4),engine.toggleSampleLoop(1,placement,4,()=>true,4)]);
    assert.deepEqual(engine.sampleLoopIndices,[0,1]);
    assert.deepEqual([...new Set(sampleStarts(engine,context,0))],[.02]);
    assert.deepEqual([...new Set(sampleStarts(engine,context,1))],[.02]);
    assert.equal(sampleStarts(engine,context,1).length,4,'one chord attack, not duplicate scheduled entries');
    advanceAudio(engine,context,.3);
    assert.equal(sampleStarts(engine,context,1).length,4);
  });
});

test('queued starts and stops can be cancelled independently, including a pending lookahead hit', async()=>{
  await withSampleKit(async(engine,context)=>{
    await engine.playPlacements([placement]);
    advanceAudio(engine,context,.3);
    await engine.toggleSampleLoop(3,placement,4,()=>true,4);
    await engine.toggleSampleLoop(3,placement,4,()=>true,4);
    assert.equal(engine.hasSampleLoops,false);
    for(let step=2;step<=8;step++){advanceAudio(engine,context,step*.25);}
    assert.equal(sampleStarts(engine,context,3).length,0);
    // This joins the bar already in lookahead, then cancels before it sounds.
    await engine.toggleSampleLoop(0,placement,4,()=>true,4);
    const future=engine.sampleVoices.find(voice=>voice.index===0);
    assert.ok(future.source.startTime>context.currentTime);
    await engine.toggleSampleLoop(0,placement,4,()=>true,4);
    assert.equal(future.source.stopTime,context.currentTime);
    assert.equal(engine.hasSampleLoops,false);
    await engine.toggleSampleLoop(1,placement,4,()=>true,4);
    context.currentTime=2.03;
    await engine.toggleSampleLoop(1,placement,4,()=>true,4);
    assert.equal(engine.sampleLoops.get(1).stopStep,16);
    await engine.toggleSampleLoop(1,placement,4,()=>true,4);
    assert.equal(engine.sampleLoops.get(1).stopStep,undefined);
    assert.equal(engine.sampleLoopStates[0].status,'playing');
  });
});

test('clearing placed loops fades only synth voices and leaves sample layers and one-shots intact', async()=>{
  await withSampleKit(async(engine,context)=>{
    await engine.playPlacements([placement]);
    await engine.toggleSampleLoop(1,placement,4);
    await engine.playSample(12,placement);
    advanceAudio(engine,context,.6);
    const voices=[...engine.sampleVoices];
    assert.ok(voices.some(voice=>voice.repeating));
    assert.ok(voices.some(voice=>!voice.repeating));
    engine.releasePlacements(.9);
    assert.equal(engine.placements.length,0);
    assert.deepEqual(engine.sampleLoopIndices,[1]);
    assert.ok(context.oscillators.every(osc=>osc.stopTime!==undefined));
    assert.ok(voices.every(voice=>voice.source.stopTime===undefined),'no stop was sent to any sample voice');
    assert.ok(voices.every(voice=>voice.gain.gain.heldAt===undefined),'sample envelopes remain untouched');
    const before=sampleStarts(engine,context,1).length;
    advanceAudio(engine,context,3);
    assert.ok(sampleStarts(engine,context,1).length>before,'the remaining sample transport keeps running');
  });
});

test('next-beat launch uses the shared swung grid, and pause honors queued stop intentions', async()=>{
  await withSampleKit(async(engine,context)=>{
    engine.setComposition({...composeImage([cell]),style:'plucked',swing:.2});
    await engine.playPlacements([placement]);
    context.currentTime=.1;
    await engine.toggleSampleLoop(0,placement,4,()=>true,1);
    assert.equal(engine.sampleLoops.get(0).startStep,2);
    advanceAudio(engine,context,.5);
    assert.ok(Math.abs(sampleStarts(engine,context,0)[0]-.52)<1e-9);
    context.currentTime=.6;
    await engine.toggleSampleLoop(0,placement,4,()=>true,4);
    assert.equal(engine.sampleLoopStates[0].status,'stopping');
    engine.stop(.12,true);
    assert.equal(engine.hasSampleLoops,false,'a layer asked to stop must not revive after screen lock');
  });
});

test('the full live bank can launch together without stealing the first layers', async()=>{
  await withSampleKit(async(engine,context)=>{
    await Promise.all(Array.from({length:16},(_,index)=>engine.toggleSampleLoop(index,
      {...placement,instrument:index<4?'keys':index<8?'guitar':index<12?'bass':'drums'},4,()=>true,4)));
    assert.equal(engine.sampleLoopIndices.length,16);
    assert.ok(engine.sampleVoices.length>20,'a complete layered kit needs more than the previous voice budget');
    assert.ok(engine.sampleVoices.every(voice=>voice.source.stopTime===undefined),'initial layers must not be stolen');
    assert.ok(context.bufferSources.filter(source=>source.buffer?.original).every(source=>source.startTime>=.02));
  });
});
