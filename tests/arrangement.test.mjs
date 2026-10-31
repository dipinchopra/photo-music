import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const encode = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const compositionUrl = encode(readFileSync(new URL('../src/composition.ts', import.meta.url), 'utf8'));
const { createPhotoLoop } = await import(encode(readFileSync(new URL('../src/arrangement.ts', import.meta.url), 'utf8')
  .replace("'./composition'", JSON.stringify(compositionUrl))));
const cells = Array.from({length:16},(_,i)=>({hue:i*22,saturation:i/16,brightness:i/16,texture:(i%4)/4}));
const bounds = {x:30,y:10,width:300,height:420};
const tone = {hue:120,saturation:.5,brightness:.4,texture:.6,profile:{contour:[.2,.8],activity:[.1,.9]}};

test('upload starter has a layered editable ensemble using real local photo samples', () => {
  const sampled = [];
  const loop = createPhotoLoop(bounds,cells,42,0,100,(x,y,r)=>{sampled.push({x,y,r});return tone;});
  assert.ok(loop.length >= 7 && loop.length <= 10);
  assert.equal(new Set(loop.map(p=>p.instrument)).size,5);
  assert.deepEqual(loop.map(p=>p.id),Array.from({length:loop.length},(_,i)=>100+i));
  assert.equal(sampled.length,loop.length);
  for(const placement of loop){
    assert.equal(placement.tone,tone);
    assert.ok(placement.level>0 && placement.level<=1);
    assert.ok(sampled.some(p=>p.x===placement.x&&p.y===placement.y&&p.r===placement.radius));
  }
});

test('shuffle changes the arrangement reproducibly without mutating image analysis', () => {
  const before=JSON.stringify(cells);
  const make=version=>createPhotoLoop(bounds,cells,42,version,1,()=>tone);
  assert.deepEqual(make(0),make(0));
  assert.notDeepEqual(make(0),make(1));
  assert.notDeepEqual(make(1),make(2));
  assert.notDeepEqual(make(0),createPhotoLoop(bounds,[...cells].reverse(),42,0,1,()=>tone));
  assert.equal(JSON.stringify(cells),before);
});

test('auto placements stay inside portrait, landscape and narrow photo bounds', () => {
  for(const box of [bounds,{x:0,y:90,width:600,height:200},{x:100,y:0,width:40,height:500}]){
    for(let version=0;version<10;version++){
      const loop=createPhotoLoop(box,cells,42,version,1,()=>tone);
      for(const p of loop){
        assert.ok(p.x-p.radius>=box.x && p.y-p.radius>=box.y);
        assert.ok(p.x+p.radius<=box.x+box.width && p.y+p.radius<=box.y+box.height);
      }
    }
  }
  assert.deepEqual(createPhotoLoop(bounds,[],42,0,1,()=>tone),[]);
});

test('successive shuffles vary ensemble size, retain one bass and balance answering voices', () => {
  const loops=Array.from({length:8},(_,version)=>createPhotoLoop(bounds,cells,42,version,1,()=>tone));
  for(let i=0;i<loops.length;i++) {
    const loop=loops[i];
    if(i) assert.notEqual(loop.length,loops[i-1].length);
    assert.equal(loop.filter(p=>p.instrument==='bass').length,1);
    assert.ok(loop.filter(p=>p.instrument==='drums').length>=2);
    const keys=loop.filter(p=>p.instrument==='keys');
    assert.ok(keys.length>=2);
    assert.ok(keys.slice(1).every(p=>p.level<keys[0].level && p.radius<keys[0].radius));
    assert.equal(new Set(loop.map(p=>`${p.x},${p.y}`)).size,loop.length);
  }
});
