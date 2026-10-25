import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/scene.ts', import.meta.url), 'utf8'));
const { photoBounds, recordingSize, moveCircle } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('recording crop excludes margins for landscape and portrait photos', () => {
  assert.deepEqual(photoBounds(400, 400, 1600, 900), { x: 0, y: 87.5, width: 400, height: 225 });
  assert.deepEqual(photoBounds(400, 400, 900, 1600), { x: 87.5, y: 0, width: 225, height: 400 });
  assert.deepEqual(photoBounds(400, 400, 800, 800), { x: 0, y: 0, width: 400, height: 400 });
});
test('recordings retain photo aspect ratio with even encoder dimensions', () => {
  for (const [w, h] of [[4000, 2250], [2250, 4000], [900, 900], [4033, 3025]]) {
    const size = recordingSize(w, h);
    assert.ok(Math.max(size.width, size.height) <= 1920);
    assert.equal(size.width % 2, 0); assert.equal(size.height % 2, 0);
    assert.ok(Math.abs(size.width / size.height - w / h) < 0.003);
  }
});
const circle = { id: 1, x: 200, y: 200, radius: 40 };
const bounds = { x: 0, y: 87.5, width: 400, height: 225 };
test('motion is reversible and circles move independently', () => {
  assert.equal(moveCircle(circle, 'off', 10, bounds), circle);
  assert.deepEqual(moveCircle(circle, 'sway', 0, bounds), circle);
  assert.notDeepEqual(moveCircle(circle, 'sway', 4, bounds), circle);
  const other = { ...circle, id: 2 };
  assert.notEqual(moveCircle(circle, 'sway', 4, bounds).x, moveCircle(other, 'sway', 4, bounds).x);
});
test('sway remains inside the photo and breathe changes only radius', () => {
  for (let t = 0; t < 60; t += 0.5) {
    const moving = moveCircle({ ...circle, x: 2, y: 89 }, 'sway', t, bounds);
    assert.ok(moving.x >= 40 && moving.x <= 360);
    assert.ok(moving.y >= 127.5 && moving.y <= 272.5);
    const breathing = moveCircle(circle, 'breathe', t, bounds);
    assert.equal(breathing.x, circle.x); assert.equal(breathing.y, circle.y);
    assert.ok(breathing.radius >= 36.4 && breathing.radius <= 43.6);
  }
});
