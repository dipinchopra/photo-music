import type { Instrument } from './music';
import type { Bounds } from './scene';

export const PHOTO_PADS: readonly { file: string; name: string; instrument: Instrument }[] = [
  { file: 'dusk-chord', name: 'Dusk chord', instrument: 'keys' },
  { file: 'velvet-chord', name: 'Velvet chord', instrument: 'keys' },
  { file: 'sun-chord', name: 'Sun chord', instrument: 'keys' },
  { file: 'glass-pluck', name: 'Glass pluck', instrument: 'keys' },
  { file: 'nylon-pluck', name: 'Nylon pluck', instrument: 'guitar' },
  { file: 'air-phrase', name: 'Air phrase', instrument: 'guitar' },
  { file: 'reverse-glow', name: 'Reverse glow', instrument: 'guitar' },
  { file: 'grain-shimmer', name: 'Grain shimmer', instrument: 'guitar' },
  { file: 'deep-sub', name: 'Deep sub', instrument: 'bass' },
  { file: 'rubber-bass', name: 'Rubber bass', instrument: 'bass' },
  { file: 'muted-bass', name: 'Muted bass', instrument: 'bass' },
  { file: 'fall-bass', name: 'Falling bass', instrument: 'bass' },
  { file: 'round-kick', name: 'Round kick', instrument: 'drums' },
  { file: 'dust-snare', name: 'Dust snare', instrument: 'drums' },
  { file: 'soft-hat', name: 'Soft hat', instrument: 'drums' },
  { file: 'hand-shaker', name: 'Hand shaker', instrument: 'drums' },
];
export const PAD_KEYS = '1234qwerasdfzxcv';
/** Each finger triggers on entry, not on every move event within a held pad. */
export function enterPhotoPad(touches: Map<number, number>, pointerId: number, index: number | null) {
  if (index === null) { touches.delete(pointerId); return false; }
  if (touches.get(pointerId) === index) return false;
  touches.set(pointerId, index);
  return true;
}
export function photoPadAt(bounds: Bounds, x: number, y: number): number | null {
  if (bounds.width <= 0 || bounds.height <= 0 || x < bounds.x || y < bounds.y
    || x > bounds.x + bounds.width || y > bounds.y + bounds.height) return null;
  const col = Math.min(3, Math.floor((x - bounds.x) / bounds.width * 4));
  const row = Math.min(3, Math.floor((y - bounds.y) / bounds.height * 4));
  return row * 4 + col;
}
export function photoPadBounds(bounds: Bounds, index: number): Bounds {
  return { x: bounds.x + index % 4 * bounds.width / 4,
    y: bounds.y + Math.floor(index / 4) * bounds.height / 4,
    width: bounds.width / 4, height: bounds.height / 4 };
}

/** One download/decode per kit. AudioBuffers can be reused after context recovery. */
export class SampleBank {
  private buffers = new Map<number, AudioBuffer>();
  private pending: Promise<void> | null = null;
  get ready() { return this.buffers.size === PHOTO_PADS.length; }
  get(index: number) { return this.buffers.get(index); }
  async load(context: AudioContext, baseUrl: string) {
    if (this.ready) return;
    if (this.pending) return this.pending;
    this.pending = Promise.all(PHOTO_PADS.map(async (pad, index) => {
      if (this.buffers.has(index)) return;
      const response = await fetch(new URL(`${pad.file}.wav`, baseUrl));
      if (!response.ok) throw new Error(`Could not load ${pad.name}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(index, buffer);
    })).then(() => {});
    try { await this.pending; } finally { this.pending = null; }
  }
}
