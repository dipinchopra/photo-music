import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/composition.ts', import.meta.url), 'utf8'));
const { composeImage, composeCircleLoop, developLoopTone, loopMelodyDegree, applyLoopTheory,
  DEFAULT_LOOP_THEORY, LOOP_SCALES, harmonyPosition, padVoicing, scaleNote, arpeggioDegree, arrangePhotoMusic } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const tone = (hue, brightness, texture = .2, saturation = .6) => ({ hue, brightness, texture, saturation });
const dark = Array.from({length:16}, (_,i) => tone(210+i, .18, .1));
const bright = Array.from({length:16}, (_,i) => tone(30+i, .8, .8));
const composition = composeImage(bright);
const local = {...tone(90,.5,.7), profile: {contour:[.1,.2,.3,.4,.6,.7,.8,.9], activity:[.1,.8,.2,.9,.3,.6,.2,.7]}};
const active = score => score.notes.flatMap((n,i) => n.active ? [i] : []);
const make = (cell = local, lane = 0, radius = 50, density = .52, response = false, range = 2) =>
  composeCircleLoop(composition, cell, lane, radius, density, response, range);

test('photo and circle scores reproduce exactly without mutating analysis', () => {
  const before = JSON.stringify(local);
  assert.deepEqual(composeImage(bright), composeImage(structuredClone(bright)));
  assert.deepEqual(make(), make(structuredClone(local)));
  assert.equal(JSON.stringify(local), before);
});
test('contrasting photos change palette, harmony and musical score', () => {
  assert.notDeepEqual(composeImage(dark).scale, composition.scale);
  assert.notEqual(composeImage(dark).seed, composition.seed);
  assert.notDeepEqual(composeCircleLoop(composeImage(dark),dark[0],0,50,.52).notes, make().notes);
  const reversed = [...dark].reverse();
  assert.notEqual(composeImage(dark).seed, composeImage(reversed).seed);
  const photos = [tone(210,.15,.05,.1),tone(45,.85,.1,.3),tone(30,.5,.25,.45),tone(5,.5,.9,.95)].map(t => composeImage(Array(16).fill(t)));
  assert.deepEqual(photos.map(p=>p.style), ['ambient','glass','plucked','pulse']);
  assert.equal(new Set(photos.map(p=>p.tempo)).size,4);
});
test('eight-bar structure keeps its opening but leaves alternate phrase endings open', () => {
  const notes = make().notes;
  assert.equal(notes.length,64);
  assert.ok(notes.slice(16,32).every((n,i)=>!n.active || notes[i].active));
  assert.deepEqual(notes.slice(0,16).map(n=>n.active),notes.slice(32,48).map(n=>n.active));
  const onsets=active(make()).filter(i=>i<16);
  assert.equal(notes[onsets[0]].degree,notes[onsets[0]+16].degree);
  assert.equal(notes[onsets.at(-1)+16].active,false);
  assert.equal(notes[onsets.at(-1)+48].active,false,'no mandatory tonic cadence');
  assert.notDeepEqual(notes.slice(0,16),notes.slice(32,48));
});
test('lead and response favor different phrase halves without filling every beat', () => {
  const lead=active(make(local,0,50,0)), answer=active(make(local,1,50,0,true));
  assert.ok(lead.every(i=>i%16<8));
  assert.ok(answer.every(i=>i%16>=8));
  assert.ok(lead.every(i=>!answer.includes(i)));
});
test('size and density add detail to the same circle rhythm', () => {
  let previous=[];
  for(const density of [0,.3,.6,1]) {
    const next=active(make(local,0,90,density));
    assert.ok(previous.every(i=>next.includes(i)));
    previous=next;
  }
  assert.ok(active(make(local,0,90,.8)).length > active(make(local,0,28,.8)).length);
});
test('scores preserve space, bounded note lengths and deterministic variation across seeds', () => {
  for(const style of ['ambient','glass','plucked','pulse']) for(let seed=1;seed<=30;seed++) {
    const score=composeCircleLoop({...composition,style,seed},local,seed%4,90,1,!!(seed%2));
    const onsets=active(score);
    assert.ok(onsets.length<=24);
    for(let i=1;i<onsets.length;i++) assert.ok(onsets[i]-onsets[i-1]>=2);
    for(const n of score.notes.filter(n=>n.active)) assert.ok(n.hold>=1 && n.hold<=9 && n.accent>0 && n.accent<=1);
  }
});
test('local contour direction survives composition and is not folded to four chord tones', () => {
  const ascending=make().notes.slice(0,16).filter(n=>n.active).map(n=>n.degree);
  const descending=make({...local,profile:{...local.profile,contour:[...local.profile.contour].reverse()}}).notes.slice(0,16).filter(n=>n.active).map(n=>n.degree);
  assert.notDeepEqual(ascending,descending);
  assert.ok(ascending.at(-1)>ascending[0]);
  assert.ok(descending.at(-1)<descending[0]);
  const pitches=make(local,0,90,1).notes.filter(n=>n.active).map((n,i)=>loopMelodyDegree(0,n,i*2));
  assert.ok(pitches.some(n=>![0,2,4,6].includes(n)));
});
test('small motion preserves identity; substantial motion develops gradually without changing anchored rhythm', () => {
  assert.equal(developLoopTone(local,{...local,brightness:.51}),local);
  const current={...local,hue:250,brightness:.9,profile:{contour:Array(8).fill(.9),activity:Array(8).fill(.9)}};
  const developed=developLoopTone(local,current);
  assert.ok(developed.brightness>local.brightness && developed.brightness<current.brightness);
  const before=make();
  const after=composeCircleLoop(composition,developed,0,50,.52,false,2,local);
  assert.deepEqual(active(before),active(after));
  assert.notDeepEqual(before.notes.map(n=>n.degree),after.notes.map(n=>n.degree));
});
test('key and scale overrides preserve clock and photo settings while octave remains a rendering offset', () => {
  const override=applyLoopTheory(composition,{...DEFAULT_LOOP_THEORY,key:7,scale:'dorian',octave:1});
  assert.equal(override.tonic,7); assert.deepEqual(override.scale,LOOP_SCALES.dorian);
  assert.equal(override.tempo,composition.tempo); assert.equal(override.swing,composition.swing);
  assert.deepEqual(applyLoopTheory(composition,DEFAULT_LOOP_THEORY),composition);
  for(const scale of Object.values(LOOP_SCALES)) for(let d=-14;d<=28;d++) {
    const c={...composition,scale};
    assert.ok(scale.includes(((scaleNote(c,d)-c.tonic)%12+12)%12));
    assert.equal(scaleNote(c,d+7)-scaleNote(c,d),12);
  }
});
test('strong beats fit the chord, passing notes survive, and range bounds pitch', () => {
  for(const range of [1,2,3]) for(const root of [0,3,4,5]) for(let d=-10;d<=12;d++) {
    const event={active:true,degree:d,hold:1,accent:.8};
    const strong=loopMelodyDegree(root,event,0,undefined,range);
    assert.ok([0,2,4].includes(((strong-root)%7+7)%7));
    assert.ok(strong>=-3 && strong<=range*7-4);
    const weak=loopMelodyDegree(root,event,2,undefined,range);
    assert.ok(weak>=-3 && weak<=range*7-4);
  }
  assert.equal(loopMelodyDegree(0,{degree:1},2),1);
});
test('shuffle preserves photo-derived progressions and defaults to composed phrases', () => {
  const results=Array.from({length:8},(_,i)=>arrangePhotoMusic(bright,i));
  assert.deepEqual(results[0],arrangePhotoMusic(bright,0));
  assert.deepEqual(results[0].composition.progression,composition.progression);
  for(let i=0;i<results.length;i++) {
    assert.equal(results[i].arps.keys,'off');assert.equal(results[i].arps.guitar,'off');
    assert.equal(results[i].composition.tempo,composition.tempo);
    assert.equal(results[i].composition.swing,composition.swing);
    if(i) assert.notEqual(results[i].composition.seed,results[i-1].composition.seed);
  }
});
test('explicit arpeggiators remain available with ascending and descending chord patterns', () => {
  const notes=mode=>Array.from({length:6},(_,step)=>arpeggioDegree(0,step,mode,1));
  assert.deepEqual(notes('up'),[0,2,4,7,0,2]);
  assert.deepEqual(notes('down'),[7,4,2,0,7,4]);
  assert.deepEqual(notes('upDown'),[0,2,4,7,4,2]);
});

test('pads use extended or suspended diatonic voicings with smooth inversions',()=>{
  for(const scale of Object.values(LOOP_SCALES)) for(const tonic of [0,5,11]) {
    const c={...composition,scale,tonic};let previous=[];
    for(const root of [0,5,3,4]) {
      const notes=padVoicing(c,root,local,previous);
      assert.equal(notes.length,4);assert.equal(new Set(notes).size,4);
      assert.ok(notes.every(n=>n>=12&&n<=43));
      assert.ok(notes.every(n=>scale.includes(((n-tonic)%12+12)%12)));
      assert.ok(notes.some(n=>((n-scaleNote(c,root+8))%12+12)%12===0),'voicing includes the diatonic ninth');
      previous=notes;
    }
  }
  assert.notDeepEqual(padVoicing(composition,0,{...local,saturation:.1}),padVoicing(composition,0,local));
});

test('generated harmony lasts two bars and synth/live parts share the same chord index',()=>{
  const c=composeImage(bright);
  assert.equal(c.harmonicBars,2);
  for(let step=0;step<16;step++) assert.equal(harmonyPosition(c,step).index,0);
  assert.equal(harmonyPosition(c,16).index,1);
  assert.equal(harmonyPosition({...c,harmonicBars:1},8).index,1,'explicit faster changes remain supported');
});
