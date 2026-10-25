import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/visuals.ts', import.meta.url), 'utf8'));
const { VISUAL_MODES, visualOutline, hitVisual, visualTapAction, drawVisual } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const placement = { id: 1, x: 200, y: 200, radius: 50, instrument: 'keys' };

test('all four treatments have distinct outlines and valid hit targets', () => {
  assert.equal(VISUAL_MODES.length, 4);
  const outlines = new Set();
  for (const mode of VISUAL_MODES) {
    const points = visualOutline(placement, mode.id);
    assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    outlines.add(JSON.stringify(points));
    assert.ok(hitVisual(placement, mode.id, 200, 200));
    assert.equal(hitVisual(placement, mode.id, 900, 900), false);
    if (mode.id !== 'living') {
      assert.equal(visualTapAction(placement, mode.id, points[0].x, points[0].y), 'remove');
      const center = mode.id === 'ribbons' ? { x: 200, y: (points[16].y + points[49].y) / 2 } : { x: 200, y: 200 };
      assert.equal(visualTapAction(placement, mode.id, center.x, center.y), 'place');
    }
  }
  assert.equal(outlines.size, 4);
  assert.equal(visualTapAction(placement, 'living', 200, 200), 'remove');
  assert.equal(visualTapAction(placement, 'living', 225, 200), 'place');
});
test('instrument shapes differ and hit testing follows elongated edges', () => {
  const outlines = ['keys', 'guitar', 'bass', 'drums'].map(instrument => JSON.stringify(visualOutline({ ...placement, instrument }, 'shapes')));
  assert.equal(new Set(outlines).size, 4);
  assert.ok(hitVisual({ ...placement, instrument: 'bass' }, 'shapes', 260, 200));
  assert.equal(hitVisual({ ...placement, instrument: 'bass' }, 'shapes', 200, 245), false);
});
test('every renderer clips to the photo and preserves the musical placement', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 300 };
  const image = {};
  for (const mode of VISUAL_MODES) {
    const calls = [];
    const context = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} })
      : (...args) => { calls.push([key, ...args]); }, set: () => true });
    const immutable = Object.freeze({ ...placement });
    drawVisual(context, image, bounds, immutable, mode.id, 3, 0.5, '#8be9fd', 2);
    assert.ok(calls.some(call => call[0] === 'rect' && call[3] === 400 && call[4] === 300));
    assert.ok(calls.some(call => call[0] === 'clip'));
    assert.ok(calls.some(call => call[0] === 'drawImage'));
    assert.equal(immutable.x, 200); assert.equal(immutable.y, 200);
    assert.equal(calls.filter(call => call[0] === 'save').length, calls.filter(call => call[0] === 'restore').length);
  }
});
