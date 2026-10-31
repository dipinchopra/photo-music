import type { ImageTone } from './music';

export type Composition = {
  style: 'ambient' | 'glass' | 'plucked' | 'pulse'; tempo: number; swing: number;
  seed: number; tonic: number; scale: readonly number[];
  rhythm?: readonly number[]; harmonicBars?: number;
  progression: readonly number[]; energy: number; warmth: number;
};
const MODES = [
  [0, 2, 3, 5, 7, 8, 10], // natural minor
  [0, 2, 3, 5, 7, 9, 10], // dorian
  [0, 2, 4, 5, 7, 9, 11], // major
  [0, 2, 4, 6, 7, 9, 11], // lydian
];

export function randomAt(seed: number, index: number) {
  let n = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

/** Ordered cells preserve spatial differences that an average color loses. */
export function composeImage(cells: ImageTone[]): Composition {
  let seed = 2166136261;
  let brightness = 0, saturation = 0, texture = 0, contrast = 0;
  cells.forEach((cell, index) => {
    for (const value of [cell.hue / 360, cell.saturation, cell.brightness, cell.texture]) {
      seed = Math.imul(seed ^ Math.round(value * 255), 16777619) >>> 0;
    }
    brightness += cell.brightness;
    saturation += cell.saturation;
    texture += cell.texture;
    if (index) contrast += Math.abs(cell.brightness - cells[index - 1].brightness);
  });
  const count = Math.max(1, cells.length);
  brightness /= count; saturation /= count; texture /= count; contrast /= count;
  const mode = brightness < 0.35 ? 0 : saturation < 0.28 ? 1 : brightness > 0.68 ? 3 : 2;
  const energy = Math.min(1, texture * 0.45 + contrast * 0.8 + saturation * 0.35);
  const style = saturation > 0.58 && energy > 0.42 ? 'pulse'
    : brightness < 0.34 || (saturation < 0.22 && energy < 0.3) ? 'ambient'
    : brightness > 0.64 ? 'glass' : 'plucked';
  const tempos = { ambient: 76, glass: 88, plucked: 98, pulse: 112 };
  return {
    style, harmonicBars: 2, tempo: tempos[style] + Math.round(energy * 10),
    swing: style === 'plucked' ? .12 : style === 'glass' ? .06 : .04,
    seed, tonic: Math.floor(randomAt(seed, 0) * 12), scale: MODES[mode],
    progression: [0, ...[1, 2, 3].map(section => {
      const cell = cells[Math.floor(section * cells.length / 4)];
      return cell ? [2, 3, 4, 5][Math.floor((cell.hue / 360 * 0.6 + cell.brightness * 0.4) * 4) % 4] : 4;
    })],
    rhythm: cells.map((cell, index) => Math.min(1, cell.texture * 0.45 + cell.saturation * 0.2
      + Math.abs(cell.brightness - cells[(index + 1) % cells.length].brightness) * 0.7)),
    energy,
    warmth: brightness,
  };
}

export function scaleNote(composition: Composition, degree: number) {
  const octave = Math.floor(degree / 7);
  return composition.tonic + composition.scale[((degree % 7) + 7) % 7] + octave * 12;
}

export type ArpMode = 'off' | 'up' | 'down' | 'upDown';

/** Diatonic chord tones, played on the same eighth-note clock as the ensemble. */
export function arpeggioDegree(root: number, step: number, mode: ArpMode, rate: number, voice = 0) {
  const intervals = [0, 2, 4, 7];
  const index = Math.floor(step / rate) + voice;
  const pattern = mode === 'down' ? [3, 2, 1, 0] : mode === 'upDown' ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 3];
  return root + intervals[pattern[index % pattern.length]];
}

/** Curated musical roles: a lead and a quieter response, rather than two competing leads. */
export function arrangePhotoMusic(cells: ImageTone[], variation: number) {
  const base = composeImage(cells);
  const seed = base.seed ^ Math.imul(variation + 1, 0x85ebca6b);
  const pick = (index: number) => randomAt(seed, index);
  const palette = (Math.floor(randomAt(base.seed, 91) * 4) + variation) % 4;

  const keysArp: ArpMode = 'off';
  const composition: Composition = {
    ...base, seed, tonic: (base.tonic + [0, 5, 7, 2][variation % 4]) % 12,
    progression: base.progression.map((degree, index) => index === 0 ? 0 : (degree + [0, 2, 3, 0][variation % 4]) % 7),
    // Preserve the transport groove during the fade; variation comes from notes and roles.
    rhythm: base.rhythm?.map((value, index) => Math.min(1, value * .6 + pick(100 + index) * .4)),
  };
  return {
    composition,
    arps: { keys: keysArp, guitar: 'off' as ArpMode,
      keysRate: palette === 3 ? 1 : 2, guitarRate: 2 },
    controls: {
      pitch: 0, complexity: 18 + Math.round(pick(3) * 18),
      keysTone: 30 + Math.round(pick(4) * 25), keysSustain: palette === 0 ? 78 : 38,
      guitarTone: 32 + Math.round(pick(5) * 22), guitarStrum: 35 + Math.round(pick(6) * 30),
      bassMovement: palette % 2 ? 48 : 24, bassDepth: 78,
      drumDensity: 24 + Math.round(pick(7) * 22), drumPunch: 52 + Math.round(pick(8) * 18),
    },
  };
}

export const LOOP_SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
} as const;
export type LoopTheory = { key: number; scale: 'auto' | keyof typeof LOOP_SCALES; octave: number; range: number };
export const DEFAULT_LOOP_THEORY: LoopTheory = { key: -1, scale: 'auto', octave: 0, range: 2 };
export function applyLoopTheory(composition: Composition, theory: LoopTheory): Composition {
  return { ...composition, tonic: theory.key < 0 ? composition.tonic : theory.key,
    scale: theory.scale === 'auto' ? composition.scale : LOOP_SCALES[theory.scale] };
}

export type LoopNote = { active: boolean; degree: number; hold: number; accent: number };
export type LoopScore = { notes: LoopNote[]; tone: ImageTone };
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
const profileAt = (values: readonly number[] | undefined, index: number, fallback: number) =>
  values?.length ? values[((index % values.length) + values.length) % values.length] : fallback;

/** Only a meaningful region change develops the motif; tiny motion keeps its identity. */
export function developLoopTone(anchor: ImageTone, current: ImageTone): ImageTone {
  const hueDelta = ((current.hue - anchor.hue + 540) % 360) - 180;
  const distance = Math.abs(hueDelta) / 180 * Math.min(anchor.saturation, current.saturation)
    + Math.abs(current.brightness - anchor.brightness) + Math.abs(current.texture - anchor.texture) * .4
    + Array.from({ length: 8 }, (_, i) => Math.abs(profileAt(anchor.profile?.contour, i, anchor.brightness)
      - profileAt(current.profile?.contour, i, current.brightness))).reduce((a, b) => a + b, 0) / 8;
  if (distance < .12) return anchor;
  const mix = (a: number, b: number) => a + (b - a) * .35;
  return { hue: (anchor.hue + hueDelta * .35 + 360) % 360,
    saturation: mix(anchor.saturation, current.saturation), brightness: mix(anchor.brightness, current.brightness),
    texture: mix(anchor.texture, current.texture), profile: {
      contour: Array.from({ length: 8 }, (_, i) => mix(profileAt(anchor.profile?.contour, i, anchor.brightness), profileAt(current.profile?.contour, i, current.brightness))),
      activity: Array.from({ length: 8 }, (_, i) => mix(profileAt(anchor.profile?.activity, i, anchor.texture), profileAt(current.profile?.activity, i, current.texture))),
    } };
}

/** Eight bars built from one two-bar idea: statement, repeat, answer, return. */
export function composeCircleLoop(composition: Composition, tone: ImageTone, lane: number, radius: number,
  complexity: number, response = false, range = 2, rhythmTone = tone): LoopScore {
  const size = clampUnit((radius - 28) / 62);
  // Rhythm identity comes from the placed region, not each moving pixel sample.
  const seed = composition.seed ^ Math.imul(lane + 1, 0x45d9f3b)
    ^ Math.round(rhythmTone.hue / 30) * 101 ^ Math.round(rhythmTone.texture * 6) * 313;
  const density = clampUnit(complexity * (.55 + size * .7));
  const start = response ? 9 : 0;
  const score = (slot: number) => profileAt(rhythmTone.profile?.activity, Math.floor(slot / 2), rhythmTone.texture) * .65
    + (composition.rhythm?.[Math.floor(slot / 2) % (composition.rhythm?.length || 1)] ?? .2) * .2
    + randomAt(seed, slot + 70) * .3 + ((slot >= 8) === response ? .4 : 0);
  const second = composition.style === 'ambient' ? start + 4
    : [start + 3, start + 5].sort((a, b) => score(b) - score(a))[0];
  const anchors = [start, second];
  const candidates = Array.from({ length: response ? 15 : 13 }, (_, i) => i)
    .filter(slot => !anchors.includes(slot)).sort((a, b) => score(b) - score(a));
  const count = Math.round(density * (composition.style === 'ambient' ? 1 : 3));
  const onsets = [...anchors];
  for (const slot of candidates) {
    if (onsets.length >= anchors.length + count) break;
    if (onsets.every(other => Math.abs(other - slot) >= 2)) onsets.push(slot);
  }
  onsets.sort((a, b) => a - b);
  const center = Math.round((tone.saturation < .12 ? tone.brightness : tone.hue / 360) * 4) - 1;
  const spread = 2 + clampUnit((range - 1) / 2) * 5;
  let previous = center;
  const motif = onsets.map((slot, i) => {
    const light = profileAt(tone.profile?.contour, Math.floor(slot / 2),
      clampUnit(tone.brightness + (randomAt(seed, i + 20) - .5) * .6));
    const target = center + Math.round((light - .5) * spread * 2);
    const degree = previous + Math.max(-4, Math.min(4, target - previous));
    previous = degree;
    return degree;
  });
  const notes = Array.from({ length: 64 }, (_, step): LoopNote => {
    const slot = step % 16, section = Math.floor(step / 16), index = onsets.indexOf(slot);
    if (index < 0) return { active: false, degree: 0, hold: 1, accent: 0 };
    let degree = motif[index];
    // Most repetitions retain their contour; a sparse ending evolves over eight bars.
    if (section === 2 && index === onsets.length - 1) degree += tone.texture > .5 ? -2 : 1;
    if (section === 3 && index === onsets.length - 1) degree += randomAt(seed, 91) > .5 ? 2 : -1;
    // Leave alternate phrases open rather than always answering and resolving.
    if (section % 2 === 1 && index === onsets.length - 1 && density < .65)
      return { active: false, degree, hold: 1, accent: 0 };
    const next = onsets[index + 1] ?? 16;
    return { active: true, degree,
      hold: Math.max(1, Math.min(composition.style === 'ambient' ? 9 : 6, next - slot - 1)),
      accent: (response ? .6 : .74) * (index === 0 ? 1 : .78 + profileAt(tone.profile?.activity, index, tone.texture) * .18) };
  });
  return { notes, tone };
}

/** Strong beats land on a nearby chord tone; weak beats retain passing notes. */
export function loopMelodyDegree(root: number, event: LoopNote, step: number, previous?: number, range = 2) {
  const minimum = -3, maximum = range * 7 - 4;
  let degree = Math.max(minimum, Math.min(maximum, root + event.degree));
  if (step % 4 === 0) {
    const chord = [-7, -5, -3, 0, 2, 4, 7, 9, 11].map(value => root + value)
      .filter(value => value >= minimum && value <= maximum);
    degree = chord.reduce((best, value) => Math.abs(value - degree) < Math.abs(best - degree) ? value : best, chord[0] ?? degree);
  }
  if (previous !== undefined) {
    const alternatives = [degree - 7, degree, degree + 7].filter(value => value >= minimum && value <= maximum);
    degree = alternatives.reduce((best, value) => Math.abs(value - previous) < Math.abs(best - previous) ? value : best, degree);
  }
  return degree;
}

/** Shared by synthesized parts and live sample harmony. */
export function harmonyPosition(composition: Composition, step: number) {
  const steps = 8 * (composition.harmonicBars ?? 1);
  const index = Math.floor(step / steps);
  return { root: composition.progression[index % composition.progression.length], index, steps };
}

/** Extended/suspended four-note voicings, choosing inversions that move the least. */
export function padVoicing(composition: Composition, root: number, tone: ImageTone, previous: readonly number[] = []) {
  const intervals = tone.saturation < .25 ? [0, 3, 6, 8]
    : tone.brightness > .52 || tone.texture > .35 ? [0, 2, 6, 8] : [0, 2, 4, 8];
  const raw = intervals.map(degree => scaleNote(composition, root + degree));
  const candidates: number[][] = [];
  for (let inversion = 0; inversion < 4; inversion++) for (const register of [0,12,24]) {
    const notes = raw.map((note,i) => note + (i < inversion ? 12 : 0) + register).sort((a,b) => a-b);
    if (notes[0] >= 12 && notes[3] <= 43) candidates.push(notes);
  }
  const target = previous.length === 4 ? previous : [15,22,28,34];
  const cost = (notes: readonly number[]) => notes.reduce((sum,note,i) => sum + Math.abs(note-target[i]),0)
    + Math.max(0,notes[3]-notes[0]-21) * .5;
  return candidates.sort((a,b) => cost(a)-cost(b))[0] ?? raw.map(note => note+12);
}
