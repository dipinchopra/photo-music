import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const load = async path => import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'))).toString('base64')}`);
const { sampleAverageColor } = await load('../src/color.ts');
const { composeImage, phraseStep } = await load('../src/composition.ts');

function context(pixel) {
  return {
    canvas: { width: 64, height: 64 },
    getImageData(x, y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
        const color = pixel(x + px, y + py);
        const index = (py * width + px) * 4;
        data.set([...color, 255], index);
      }
      return { data };
    },
  };
}
const tone = sample => ({ hue: sample.h, saturation: sample.s, brightness: sample.l, texture: sample.texture, profile: sample.profile });

test('real pixel arrangement changes melodic contour despite the same average palette', () => {
  const image = reverse => context((x) => {
    const value = Math.round((reverse ? 63 - x : x) / 63 * 255);
    return [value, value, value];
  });
  const a = tone(sampleAverageColor(image(false), 31.5, 31.5, 30));
  const b = tone(sampleAverageColor(image(true), 31.5, 31.5, 30));
  assert.ok(Math.abs(a.brightness - b.brightness) < 0.04);
  assert.notDeepEqual(a.profile.contour, b.profile.contour);
  const composition = composeImage([a]);
  const notes = local => Array.from({ length: 16 }, (_, step) => phraseStep(composition, local, step, 0.5).degree);
  assert.notDeepEqual(notes(a), notes(b));
});
test('enlarging a circular sample captures surrounding image material', () => {
  const ctx = context((x, y) => Math.hypot(x - 32, y - 32) < 12 ? [20, 40, 180] : [240, 180, 30]);
  const small = sampleAverageColor(ctx, 32, 32, 8);
  const large = sampleAverageColor(ctx, 32, 32, 28);
  assert.ok(Math.abs(small.h - large.h) > 90);
  assert.ok(large.profile.activity.some(value => value > 0));
});
test('circular sampling excludes square corners and handles image edges', () => {
  const ctx = context((x, y) => Math.hypot(x - 32, y - 32) <= 20 ? [200, 200, 200] : [0, 0, 0]);
  assert.ok(sampleAverageColor(ctx, 32, 32, 20).l > 0.75);
  const edge = sampleAverageColor(ctx, 0, 0, 12);
  assert.ok(Number.isFinite(edge.l));
  assert.equal(edge.profile.contour.length, 8);
});
