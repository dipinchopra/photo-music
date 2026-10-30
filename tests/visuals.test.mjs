import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/visuals.ts', import.meta.url), 'utf8'));
const { VISUAL_MODES, visualRadius, drawVisualScene, visualOutline, hitVisual, findEditablePlacement, findDraggablePlacement, drawVisual, drawPlacementMarker, showsPlacementMarker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const placement = { id: 1, x: 200, y: 200, radius: 50, instrument: 'keys' };

test('all treatments have usable centers; compact shapes keep the musical radius unchanged', () => {
  assert.equal(VISUAL_MODES.length, 7);
  const outlines = new Set();
  for (const mode of VISUAL_MODES) {
    const points = visualOutline(placement, mode.id);
    assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    outlines.add(JSON.stringify(points));
    assert.ok(hitVisual(placement, mode.id, 200, 200));
    assert.equal(hitVisual(placement, mode.id, 900, 900), false);

  }
  assert.ok(outlines.size >= 6);
  assert.equal(placement.radius, 50);
  assert.equal(visualRadius(placement, 'living'), 50);
  for (const point of visualOutline(placement, 'shapes')) {
    assert.ok(Math.abs(Math.hypot(point.x - placement.x, point.y - placement.y) - visualRadius(placement, 'shapes')) < 1e-9);
  }
});
test('instrument shapes differ and Bass has a plain square hit target', () => {
  const outlines = ['keys', 'guitar', 'bass', 'drums'].map(instrument => JSON.stringify(visualOutline({ ...placement, instrument }, 'shapes')));
  assert.equal(new Set(outlines).size, 4);
  assert.equal(hitVisual({ ...placement, instrument: 'bass' }, 'shapes', 260, 200), false);
  assert.ok(hitVisual({ ...placement, instrument: 'bass' }, 'shapes', 210, 210));
  assert.equal(visualOutline({ ...placement, instrument: 'bass' }, 'shapes').length, 4);
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
    assert.equal(calls.some(call => call[0] === 'drawImage'), !['shapes', 'quilt'].includes(mode.id),
      'instrument borders do not repaint the photo');
    if (mode.id === 'shapes') {
      assert.equal(calls.some(call => call[0] === 'fill' || call[0] === 'fillRect'), false,
        'instrument shapes must remain border-only');
      assert.ok(calls.some(call => call[0] === 'stroke'));
    }
    assert.equal(immutable.x, 200); assert.equal(immutable.y, 200);
    assert.equal(calls.filter(call => call[0] === 'save').length, calls.filter(call => call[0] === 'restore').length);
  }
});


test('tap-to-remove targets only the selected instrument in every visual mode', () => {
  const piano = { ...placement, id: 1, instrument: 'keys' };
  const drums = { ...placement, id: 2, instrument: 'drums' };
  for (const mode of VISUAL_MODES) {
    assert.equal(findEditablePlacement([piano], 'drums', mode.id, 200, 200), undefined,
      'drums placed over piano must add a layer, never remove piano');
    assert.equal(findEditablePlacement([piano, drums], 'keys', mode.id, 200, 200), undefined,
      'adding keys on top of drums must not reach through and remove the older keys');
    assert.equal(findEditablePlacement([drums, piano], 'drums', mode.id, 200, 200), undefined);
    assert.equal(findEditablePlacement([drums, piano], 'keys', mode.id, 200, 200)?.id, 1);
    assert.equal(findEditablePlacement([piano, drums], 'drums', mode.id, 200, 200)?.id, 2);
    assert.equal(findEditablePlacement([piano, drums], 'guitar', mode.id, 200, 200), undefined);
  }
});


test('every visual mode keeps a plus marker without a surrounding outline', () => {
  for (const { id } of VISUAL_MODES) {
    const state = {}, strokes = [], paths = [];
    const ctx = new Proxy(state, { get: (target, key) => key === 'getTransform' ? () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) : key === 'stroke'
      ? () => strokes.push({ color: target.strokeStyle, alpha: target.globalAlpha, width: target.lineWidth })
      : (...args) => paths.push([key, ...args]), set: (target, key, value) => { target[key] = value; return true; } });
    drawPlacementMarker(ctx, { x: 0, y: 0, width: 400, height: 300 }, placement, '#8be9fd');
    assert.ok(strokes.some(s => s.color === '#8be9fd' && s.alpha === 1), id);
    assert.equal(paths.filter(p => p[0] === 'lineTo').length, 2);
    assert.equal(paths.some(p => p[0] === 'arc' || p[0] === 'closePath'), false);
    const starts = paths.filter(p => p[0] === 'moveTo');
    const ends = paths.filter(p => p[0] === 'lineTo');
    assert.equal(ends[0][1] - starts[0][1], ends[1][2] - starts[1][2]);
  }
});


test('dragging targets any topmost instrument without switching the selected instrument', () => {
  const piano = { ...placement, id: 1, instrument: 'keys' };
  const drums = { ...placement, id: 2, instrument: 'drums' };
  for (const { id } of VISUAL_MODES) {
    assert.equal(findDraggablePlacement([piano], id, 200, 200), piano);
    assert.equal(findDraggablePlacement([piano, drums], id, 200, 200), drums);
    assert.equal(findDraggablePlacement([drums, piano], id, 200, 200), piano);
    assert.equal(findDraggablePlacement([piano, drums], id, 900, 900), undefined);
    assert.equal(findEditablePlacement([piano, drums], 'keys', id, 200, 200), undefined,
      'a cross-instrument tap still adds instead of deleting the drag target');
  }
});


test('only Living Photo includes plus markers, on the shared screen and export renderer', () => {
  for (const { id } of VISUAL_MODES) assert.equal(showsPlacementMarker(id), id === 'living');
});

function tileSnapshot(mode, tone, hit = 0, x = 200, y = 150) {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, key) => key === 'createLinearGradient' ? (...args) => { calls.push([key,...args]); return {addColorStop: (...stop) => calls.push(['colorStop',...stop])}; } : (...args) => calls.push([key, ...args]),
    set: (_, key, value) => { calls.push(['set', key, value && typeof value === 'object' && typeof value.addColorStop === 'function' ? 'gradient' : value]); return true; },
  });
  drawVisual(ctx, { width: 1200, height: 900 }, { x: 0, y: 0, width: 400, height: 300 },
    { ...placement, x, y, tone }, mode, 0, hit, '#8be9fd');
  return calls;
}
const tileTone = { hue: 25, saturation: 0.6, brightness: 0.4, texture: 0.5,
  profile: { contour: [0.2, 0.7, 0.3, 0.9], activity: [0.5] } };

test('photo surfaces and contour lines remain stable between notes and respond to note hits', () => {
  for (const mode of ['collage', 'quilt']) {
    const resting = tileSnapshot(mode, tileTone);
    assert.deepEqual(tileSnapshot(mode, tileTone), resting);
    assert.notDeepEqual(tileSnapshot(mode, tileTone, 1), resting, `${mode} responds to actual note hits`);
    if (mode === 'quilt') assert.notDeepEqual(tileSnapshot(mode, { ...tileTone, hue: 190 }), resting);
  }
});

test('photo tile source crops remain valid at photo edges for display and export caches', () => {
  for (const mode of ['displaced']) for (const [x, y] of [[0, 0], [400, 300], [200, 150]]) {
    const crops = tileSnapshot(mode, tileTone, 1, x, y).filter(call => call[0] === 'drawImage');
    assert.equal(crops.length, 2);
    for (const [, , sx, sy, sw, sh] of crops) {
      assert.ok(sx >= 0 && sy >= 0 && sw > 0 && sh > 0);
      assert.ok(sx + sw <= 1200 + 1e-9 && sy + sh <= 900 + 1e-9);
    }
  }
});


test('Contour ink uses fine photo-colored lines without opaque squares', () => {
  const calls = tileSnapshot('quilt', tileTone);
  assert.equal(calls.filter(c => c[0] === 'fillRect').length, 0);
  assert.equal(calls.filter(c => c[0] === 'stroke').length, 5);
  assert.ok(calls.some(c => c[0] === 'set' && c[1] === 'strokeStyle' && c[2].startsWith('hsl(')));
  assert.equal(calls.some(c => c[0] === 'drawImage'), false);
});

test('Photo echoes keep their source exposure stable while the destination is dragged', () => {
  const original=tileSnapshot('displaced',tileTone);
  const moved=tileSnapshot('displaced',tileTone,0,80,60);
  const crops=calls=>calls.filter(c=>c[0]==='drawImage').map(c=>c.slice(2,6));
  assert.deepEqual(crops(original),crops(moved));
  assert.notDeepEqual(original.find(c=>c[0]==='translate'),moved.find(c=>c[0]==='translate'));
});

test('plus markers follow fractional motion continuously without whole-pixel jumps', () => {
  const start = x => {
    const calls = [];
    const ctx = new Proxy({}, { get: (_, key) => key === 'getTransform'
      ? () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})
      : (...args) => calls.push([key, ...args]), set: () => true });
    drawPlacementMarker(ctx, {x: 0, y: 0, width: 400, height: 300}, { ...placement, x }, '#8be9fd');
    return calls.find(c => c[0] === 'moveTo')[1];
  };
  assert.ok(Math.abs(start(200.2) - start(200.1) - .1) < 1e-9);
  assert.equal(start(200.2), start(200.2), 'a stationary marker stays stationary');
});


test('display size stays bounded and usable across musical sizes and all instrument shapes', () => {
  for(const radius of [28,50,90,180]) for(const instrument of ['keys','guitar','bass','drums']) {
    const item=Object.freeze({...placement,radius,instrument});
    const size=visualRadius(item,'shapes');
    assert.ok(size>=12 && size<=22);
    assert.ok(hitVisual(item,'shapes',item.x+18,item.y),'minimum touch target is retained');
    assert.equal(item.radius,radius);
    assert.equal(visualRadius(item,'living'),radius);
  }
});

test('the ensemble renderer builds note-driven photo surfaces without mutating placements', () => {
  const ensemble=Object.freeze([
    Object.freeze({...placement,tone:tileTone}),
    Object.freeze({...placement,id:2,x:310,y:100,instrument:'guitar',tone:tileTone}),
    Object.freeze({...placement,id:3,x:80,y:75,instrument:'bass',tone:tileTone}),
  ]);
  const snapshot=hits=>{
    const calls=[];
    const ctx=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):(...args)=>calls.push([key,...args]),set:(_,key,value)=>{calls.push(['set',key,value]);return true;}});
    drawVisualScene(ctx,{width:1200,height:900},{x:0,y:0,width:400,height:300},ensemble,'fragments',2,hits,2);
    return calls;
  };
  const rest=snapshot(new Map()),playing=snapshot(new Map([[1,1],[2,.4]]));
  assert.notDeepEqual(rest,playing);
  assert.ok(rest.filter(c=>c[0]==='drawImage').length>ensemble.length,'the composition extends between placements');
  assert.equal(rest.filter(c=>c[0]==='save').length,rest.filter(c=>c[0]==='restore').length);
  assert.deepEqual(ensemble.map(p=>p.radius),[50,50,50]);
});
