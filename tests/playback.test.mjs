import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/playback.ts', import.meta.url), 'utf8'));
const { PlaybackRecovery } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function fixture() {
  const state = { visible: true, loops: true, running: true, scheduler: false, paused: false, starts: 0, play: async () => {} };
  const recovery = new PlaybackRecovery({
    visible: () => state.visible, hasLoops: () => state.loops, running: () => state.running,
    play: () => state.play(),
    startScheduler: () => { state.scheduler = true; state.starts++; },
    stopScheduler: () => { state.scheduler = false; }, pauseAudio: () => {},
    setPaused: value => { state.paused = value; },
  });
  return { state, recovery };
}
test('reopening restarts a stopped scheduler even when audio already reports running', async () => {
  const { state, recovery } = fixture();
  state.visible = false; recovery.pause();
  state.visible = true; await recovery.resume();
  assert.equal(state.running, true); assert.equal(state.scheduler, true); assert.equal(state.paused, false);
});
test('scheduler recovery does not wait for Safari resume promise to settle', async () => {
  const { state, recovery } = fixture();
  state.running = false;
  let settle;
  state.play = () => new Promise(resolve => { settle = resolve; });
  const pending = recovery.resume();
  assert.equal(state.scheduler, true); assert.equal(state.paused, true);
  state.running = true; recovery.stateChanged(true); settle(); await pending;
  assert.equal(state.paused, false);
});
test('a gesture retries a blocked automatic resume without requiring page refresh', async () => {
  const { state, recovery } = fixture();
  state.running = false; state.play = async () => { throw new Error('gesture required'); };
  await recovery.resume(); assert.equal(state.paused, true);
  state.play = async () => { state.running = true; };
  await recovery.resume(); assert.equal(state.paused, false); assert.equal(state.scheduler, true);
});
test('a late resume completion cannot restart a hidden or cleared board', async () => {
  const { state, recovery } = fixture();
  let settle;
  state.play = () => new Promise(resolve => { settle = resolve; });
  const pending = recovery.resume();
  const starts = state.starts;
  state.visible = false; recovery.pause(); settle(); await pending;
  assert.equal(state.scheduler, false); assert.equal(state.starts, starts);
  state.visible = true; state.loops = false; await recovery.resume();
  assert.equal(state.starts, starts);
});
test('foreground audio state recovery also repairs the scheduler', () => {
  const { state, recovery } = fixture();
  recovery.stateChanged(true); assert.equal(state.scheduler, true);
  recovery.dispose(); state.scheduler = false;
  recovery.stateChanged(true); assert.equal(state.scheduler, false);
});
