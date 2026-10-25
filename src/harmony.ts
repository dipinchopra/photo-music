import { scaleNote, type Composition } from './composition';
import { PHOTO_PADS } from './pads';

export function sampleHarmony(composition: Composition, step: number, index: number, transpose = 0) {
  const pad = PHOTO_PADS[index];
  if (!pad) return [];
  if (pad.sourceMidi === undefined) return [{ rate: 1, offsetBeats: 0, level: 1 }];
  const phrase = index === 5;
  const degrees = pad.degrees ?? [0];
  return degrees.map((degree, i) => {
    const offsetBeats = phrase ? i * .5 : 0;
    const bar = Math.floor((step + offsetBeats * 2) / 8);
    const root = composition.progression[bar % composition.progression.length];
    const target = (pad.register ?? 48) + scaleNote(composition, root + degree) + transpose;
    return { rate: Math.pow(2, (target - pad.sourceMidi!) / 12), offsetBeats,
      level: phrase ? 1 : degrees.length > 1 ? .85 / Math.sqrt(degrees.length) : 1 };
  });
}

/** Drum repeats express a groove rather than repeating a full-kit hit each bar. */
export function sampleDrumStep(index: number, step: number, fourOnFloor: boolean, density: number) {
  const beat = step % 8;
  if (index === 12) return fourOnFloor ? beat % 2 === 0 : beat === 0 || beat === 4;
  if (index === 13) return beat === 2 || beat === 6;
  if (index === 14) return density > .75 || beat % 2 === 1;
  return density > .35 || beat % 2 === 1;
}
