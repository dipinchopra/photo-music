import type { ImageTone } from './music';

export type Composition = {
  style: 'ambient' | 'glass' | 'plucked' | 'pulse'; tempo: number; swing: number;
  seed: number; tonic: number; scale: readonly number[];
  rhythm?: readonly number[];
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
  const tempos = { ambient: 78, glass: 96, plucked: 108, pulse: 124 };
  return {
    style, tempo: tempos[style] + Math.round(energy * 16),
    swing: style === 'plucked' ? 0.2 : style === 'glass' ? 0.09 : 0,
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
  const imageContour = tone.profile?.contour;
  const region = imageContour?.length ? imageContour[(Math.floor(step / 2) + bar % 2) % imageContour.length] : undefined;
  const motion = region === undefined ? contour[(slot + Math.floor(randomAt(seed, 20) * 8)) % 8]
    : Math.round((region - 0.5) * 6);
  const response = bar % 4 === 2 ? 1 : bar % 4 === 3 ? -1 : 0;
  const degree = start + motion * (tone.saturation > 0.55 ? 2 : 1) + response;
  return { active, degree, accent: beat % 2 === 0 ? 1 : 0.65 + randomAt(seed, slot + 40) * 0.2 };
}

// Moderate phrases with room at the end; individual circles offset this rhythm.
export function melodyEvent(composition: Composition, step: number, complexity: number) {
  const phrase = Math.floor(step / 32);
  const slot = step % 32;
  const ambient = composition.style === 'ambient';
  const anchors = ambient ? [0, 16] : [0, 8, 16, 24];
  const candidates = ambient ? [4, 8, 12, 20, 24] : [2, 4, 6, 10, 12, 14, 18, 20, 22, 26];
  // Rank shared beat slots using the photo's edge/texture distribution.
  // Density adds detail to the same phrase, rather than switching patterns.
  const ranked = [...candidates].sort((a, b) => {
    const score = (beat: number) => (composition.rhythm?.[Math.floor(beat / 2) % (composition.rhythm?.length || 1)] ?? 0)
      + randomAt(composition.seed, beat + Math.floor(phrase / 2) * 32 + 120) * 0.35;
    return score(b) - score(a);
  });
  const count = Math.round(Math.max(0, Math.min(1, complexity)) * candidates.length);
  const onsets = [...anchors, ...ranked.slice(0, count)].sort((a, b) => a - b);
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
export function circleEvent(composition: Composition, _tone: ImageTone, step: number, complexity: number, lane: number, radius = 50) {
  // Color shapes pitch and timbre, while all parts share the same rhythmic motif.
  // Whole-beat lane offsets preserve that groove as circles are added or moved.
  const offset = lane * 2 % 8;
  const size = Math.max(0, Math.min(1, (radius - 28) / 62));
  return melodyEvent(composition, step + offset, Math.min(1, complexity * (0.55 + size * 0.9)));
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
  const progressions = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 4, 5, 3], [0, 2, 5, 3]];
  const keysArp: ArpMode = ['off', 'up', 'down', 'upDown'][palette] as ArpMode;
  const composition: Composition = {
    ...base, seed, tonic: (base.tonic + [0, 5, 7, 2][variation % 4]) % 12,
    progression: progressions[(palette + Math.floor(pick(2) * 4)) % 4],
    // Preserve the transport groove during the fade; variation comes from notes and roles.
    rhythm: base.rhythm?.map((value, index) => Math.min(1, value * .6 + pick(100 + index) * .4)),
  };
  return {
    composition,
    arps: { keys: keysArp, guitar: (palette === 0 ? 'upDown' : 'off') as ArpMode,
      keysRate: palette === 3 ? 1 : 2, guitarRate: 2 },
    controls: {
      pitch: 0, complexity: 24 + Math.round(pick(3) * 18),
      keysTone: 30 + Math.round(pick(4) * 25), keysSustain: palette === 0 ? 78 : 38,
      guitarTone: 32 + Math.round(pick(5) * 22), guitarStrum: 35 + Math.round(pick(6) * 30),
      bassMovement: palette % 2 ? 48 : 24, bassDepth: 78,
      drumDensity: 24 + Math.round(pick(7) * 22), drumPunch: 52 + Math.round(pick(8) * 18),
    },
  };
}
