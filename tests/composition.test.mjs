import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../src/composition.ts', import.meta.url), 'utf8');
const compiled = stripTypeScriptTypes(source);
const { composeImage, phraseStep, scaleNote, melodyEvent } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
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
        assert.ok(onsets.length <= 36);
        for (let i = 1; i < onsets.length; i++) assert.ok(onsets[i] - onsets[i - 1] >= 2);
        assert.ok(onsets.every(step => step % 32 <= 26));
      }
    }
  }
});
