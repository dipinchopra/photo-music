import type { ImageTone } from './music';

export type Composition = {
  style: 'ambient' | 'glass' | 'plucked' | 'pulse'; tempo: number; swing: number;
  seed: number; tonic: number; scale: readonly number[];
  progression: readonly number[]; energy: number; warmth: number;
};
const MODES = [
  [0, 2, 3, 5, 7, 8, 10], // natural minor
  [0, 2, 3, 5, 7, 9, 10], // dorian
  [0, 2, 4, 5, 7, 9, 11], // major
  [0, 2, 4, 6, 7, 9, 11], // lydian
];
const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 4, 1, 3], [0, 2, 5, 3], [0, 6, 3, 4]];

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
  const tempos = { ambient: 78, glass: 96, plucked: 108, pulse: 124 };
  return {
    style, tempo: tempos[style] + Math.round(energy * 16),
    swing: style === 'plucked' ? 0.2 : style === 'glass' ? 0.09 : 0,
    seed, tonic: Math.floor(randomAt(seed, 0) * 12), scale: MODES[mode],
    progression: PROGRESSIONS[Math.floor(randomAt(seed, 1) * PROGRESSIONS.length)],
    energy,
    warmth: brightness,
  };
}

export function scaleNote(composition: Composition, degree: number) {
  const octave = Math.floor(degree / 7);
  return composition.tonic + composition.scale[((degree % 7) + 7) % 7] + octave * 12;
}

/** A repeatable two-bar motif, with a response and a turnaround every four bars. */
export function phraseStep(composition: Composition, tone: ImageTone, step: number, complexity: number) {
  const seed = composition.seed ^ Math.round(tone.hue * 127 + tone.brightness * 8191 + tone.texture * 4093);
  const bar = Math.floor(step / 8);
  const beat = step % 8;
  const slot = step % 16;
  const density = (composition.style === 'ambient' ? 0.07 : composition.style === 'pulse' ? 0.4 : 0.2) + complexity * 0.24 + tone.texture * 0.18 + composition.energy * 0.12;
  const active = beat === 0 || (composition.style === 'ambient' && beat % 2 === 1 ? false : randomAt(seed, slot) < density);
  const contour = [0, 1, 2, 1, -1, 0, 2, -1];
  const start = Math.floor(tone.hue / 360 * 7);
  const motion = contour[(slot + Math.floor(randomAt(seed, 20) * 8)) % 8];
  const response = bar % 4 === 2 ? 1 : bar % 4 === 3 ? -1 : 0;
  const degree = start + motion * (tone.saturation > 0.55 ? 2 : 1) + response;
  return { active, degree, accent: beat % 2 === 0 ? 1 : 0.65 + randomAt(seed, slot + 40) * 0.2 };
}

// Moderate phrases with room at the end; individual circles offset this rhythm.
export function melodyEvent(composition: Composition, step: number, complexity: number) {
  const phrase = Math.floor(step / 32);
  const slot = step % 32;
  const patterns = [
    [0, 3, 7, 10, 14, 18, 22, 26],
    [0, 4, 7, 11, 14, 18, 23, 26],
    [0, 3, 6, 10, 14, 19, 22, 26],
    [0, 4, 8, 11, 15, 18, 22, 26],
  ];
  const pattern = patterns[Math.floor(randomAt(composition.seed, phrase + 120) * patterns.length)];
  let onsets = composition.style === 'ambient' ? pattern.filter((_, i) => i % 2 === 0) : [...pattern];
  if (complexity > 0.75 && composition.style !== 'ambient') {
    const passing = onsets.find((onset, i) => i < onsets.length - 1 && onsets[i + 1] - onset >= 5);
    if (passing !== undefined) onsets = [...onsets, passing + 2].sort((a, b) => a - b);
  }
  const index = onsets.indexOf(slot);
  const next = index >= 0 ? onsets[index + 1] ?? 29 : slot;
  return {
    active: index >= 0,
    voice: phrase * 5 + Math.max(0, index),
    hold: Math.max(1, Math.min(6, next - slot - 1)),
    accent: index === 0 ? 0.82 : index === onsets.length - 1 ? 0.58 : 0.66,
  };
}


/** Each placed circle gets a stable musical lane, even on similar colors. */
export function circleEvent(composition: Composition, tone: ImageTone, step: number, complexity: number, lane: number) {
  const seed = composition.seed ^ Math.round(tone.hue * 127 + tone.texture * 4093 + tone.brightness * 8191);
  const offset = lane === 0 ? 0 : (lane * 3 + Math.floor(tone.hue / 90)) % 8;
  return melodyEvent({ ...composition, seed }, step + offset, complexity);
}
