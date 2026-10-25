import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/history.ts', import.meta.url), 'utf8'));
const { EditHistory } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('Undo and Redo restore add, removal, drag and Clear in order', () => {
  const history = new EditHistory();
  const a = [{ id: 1, x: 10 }], b = [...a, { id: 2, x: 20 }];
  const moved = [{ id: 1, x: 50 }, b[1]], removed = [moved[0]];
  const states = [[], a, b, moved, removed, []];
  for (let i = 0; i < states.length - 1; i++) history.record(states[i]);
  let current = states.at(-1);
  for (let i = states.length - 2; i >= 0; i--) {
    current = history.undo(current);
    assert.deepEqual(current, states[i]);
  }
  assert.equal(history.canUndo, false); assert.equal(history.canRedo, true);
  for (let i = 1; i < states.length; i++) {
    current = history.redo(current);
    assert.deepEqual(current, states[i]);
  }
  assert.equal(history.canRedo, false);
});
test('a new edit invalidates Redo and a new photo clears history', () => {
  const history = new EditHistory();
  history.record([]); history.record([1]);
  assert.deepEqual(history.undo([1, 2]), [1]);
  history.record([1]);
  assert.equal(history.canRedo, false);
  history.clear(); assert.equal(history.canUndo, false);
});
test('history is bounded', () => {
  const history = new EditHistory(2);
  history.record(1); history.record(2); history.record(3);
  assert.equal(history.undo(4), 3); assert.equal(history.undo(3), 2); assert.equal(history.undo(2), undefined);
});
