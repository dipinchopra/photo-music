import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../src/composition.ts', import.meta.url), 'utf8');
const compiled = stripTypeScriptTypes(source);
const { composeImage, phraseStep, scaleNote, melodyEvent, circleEvent, arpeggioDegree, arrangePhotoMusic } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const tone = (hue, brightness, texture = 0.2, saturation = 0.6) => ({ hue, brightness, texture, saturation });
const dark = Array.from({ length: 16 }, (_, i) => tone(210 + i, 0.18, 0.1));
const bright = Array.from({ length: 16 }, (_, i) => tone(30 + i, 0.8, 0.8));
const phrase = (image, cell) => Array.from({ length: 32 }, (_, step) => phraseStep(composeImage(image), cell, step, 0.52));

test('the same image reproduces its composition and phrases', () => {
  assert.deepEqual(composeImage(dark), composeImage(structuredClone(dark)));
  assert.deepEqual(phrase(dark, dark[0]), phrase(structuredClone(dark), dark[0]));
});
test('contrasting images change mode, energy, and musical phrase', () => {
  assert.notDeepEqual(composeImage(dark).scale, composeImage(bright).scale);
  assert.ok(composeImage(bright).energy > composeImage(dark).energy);
  assert.notDeepEqual(phrase(dark, dark[0]), phrase(bright, bright[0]));
});
test('spatial arrangement matters even with the same average color', () => {
  const reversed = [...dark].reverse();
  assert.notEqual(composeImage(dark).seed, composeImage(reversed).seed);
  assert.notDeepEqual(phrase(dark, dark[0]), phrase(reversed, dark[0]));
});
test('phrases include movement, rests, accents, and a four-bar response', () => {
  const notes = phrase(bright, bright[0]);
  assert.ok(new Set(notes.filter(n => n.active).map(n => n.degree)).size >= 3);
  assert.ok(notes.some(n => !n.active));
  assert.ok(new Set(notes.map(n => n.accent)).size > 1);
  assert.notDeepEqual(notes.slice(0, 16), notes.slice(16));
});
test('notes stay in the selected mode across negative degrees and octaves', () => {
  for (const image of [dark, bright]) {
    const composition = composeImage(image);
    for (let degree = -14; degree <= 28; degree++) {
      const pitchClass = ((scaleNote(composition, degree) - composition.tonic) % 12 + 12) % 12;
      assert.ok(composition.scale.includes(pitchClass));
      assert.equal(scaleNote(composition, degree + 7) - scaleNote(composition, degree), 12);
    }
  }
});

test('contrasting photo features select four audible palettes and different tempos', () => {
  const photos = [
    tone(210, 0.15, 0.05, 0.1),
    tone(45, 0.85, 0.1, 0.3),
    tone(30, 0.5, 0.25, 0.45),
    tone(5, 0.5, 0.9, 0.95),
  ].map(cell => composeImage(Array(16).fill(cell)));
  assert.deepEqual(photos.map(p => p.style), ['ambient', 'glass', 'plucked', 'pulse']);
  assert.equal(new Set(photos.map(p => p.tempo)).size, 4);
  assert.ok(photos[3].tempo - photos[0].tempo > 40);
  assert.ok(photos[2].swing > photos[0].swing);
});


test('lead phrases guarantee breathing space across images and variation levels', () => {
  for (const style of ['ambient', 'glass', 'plucked', 'pulse']) {
    for (let seed = 1; seed <= 50; seed++) {
      for (const complexity of [0, 0.52, 1]) {
        const composition = { ...composeImage(bright), style, seed };
        const onsets = Array.from({ length: 128 }, (_, step) => step)
          .filter(step => melodyEvent(composition, step, complexity).active);
        assert.ok(onsets.length <= 56);
        for (let i = 1; i < onsets.length; i++) assert.ok(onsets[i] - onsets[i - 1] >= 2);
        assert.ok(onsets.every(step => step % 32 <= 26));
      }
    }
  }
});


test('color changes during sway preserve the shared rhythmic grid', () => {
  const composition = composeImage(bright);
  for (let lane = 0; lane < 8; lane++) {
    const rhythm = cell => Array.from({ length: 64 }, (_, step) => circleEvent(composition, cell, step, 0.52, lane).active);
    assert.deepEqual(rhythm(dark[0]), rhythm(bright[0]));
  }
});


test('Density progressively adds notes to the same shared phrase', () => {
  const composition = composeImage(bright);
  let previous = [];
  for (const density of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const onsets = Array.from({ length: 32 }, (_, step) => step).filter(step => melodyEvent(composition, step, density).active);
    assert.ok(onsets.length > previous.length);
    assert.ok(previous.every(step => onsets.includes(step)));
    previous = onsets;
  }
});
test('larger circles express more rhythmic detail within the same groove', () => {
  const composition = composeImage(bright);
  const rhythm = radius => Array.from({ length: 32 }, (_, step) => step)
    .filter(step => circleEvent(composition, bright[0], step, 0.65, 0, radius).active);
  const small = rhythm(28), medium = rhythm(50), large = rhythm(90);
  assert.ok(small.length < medium.length && medium.length < large.length);
  assert.ok(small.every(step => large.includes(step)));
});
test('local image contours create distinct melodic movement at the same average color', () => {
  const composition = composeImage(bright);
  const profile = [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9];
  const degrees = contour => Array.from({ length: 16 }, (_, step) => phraseStep(composition,
    { ...bright[0], profile: { contour, activity: Array(8).fill(0.5) } }, step, 0.52).degree);
  assert.notDeepEqual(degrees(profile), degrees([...profile].reverse()));
});


test('arpeggiator follows chord-tone direction and selected beat rate', () => {
  const notes = mode => Array.from({ length: 6 }, (_, step) => arpeggioDegree(0, step, mode, 1));
  assert.deepEqual(notes('up'), [0, 2, 4, 7, 0, 2]);
  assert.deepEqual(notes('down'), [7, 4, 2, 0, 7, 4]);
  assert.deepEqual(notes('upDown'), [0, 2, 4, 7, 4, 2]);
  assert.deepEqual(Array.from({ length: 8 }, (_, step) => arpeggioDegree(3, step, 'up', 2)), [3, 3, 5, 5, 7, 7, 10, 10]);
});

test('musical shuffle changes pitch, arpeggios and harmony reproducibly while preserving clock', () => {
  const before = JSON.stringify(bright);
  const results = Array.from({length: 8}, (_, i) => arrangePhotoMusic(bright, i));
  assert.deepEqual(results[0], arrangePhotoMusic(bright, 0));
  for (let i = 1; i < results.length; i++) {
    assert.notEqual(results[i].composition.tonic, results[i - 1].composition.tonic);
    assert.notEqual(results[i].arps.keys, results[i - 1].arps.keys);
    assert.notEqual(results[i].composition.seed, results[i - 1].composition.seed);
    assert.equal(results[i].composition.tempo, results[0].composition.tempo);
    assert.equal(results[i].composition.swing, results[0].composition.swing);
  }
  for (const result of results) {
    assert.ok(result.controls.complexity <= 42);
    assert.ok(result.controls.drumDensity <= 46);
    assert.equal(result.composition.progression.length, 4);
    for (const degree of result.composition.progression) {
      assert.ok(result.composition.scale.includes((scaleNote(result.composition, degree) - result.composition.tonic + 12) % 12));
    }
  }
  assert.notDeepEqual(results[0], arrangePhotoMusic(dark, 0));
  assert.equal(JSON.stringify(bright), before);
});
