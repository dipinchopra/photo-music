import type { Placement } from './music';

export type Bounds = { x: number; y: number; width: number; height: number };
export type Motion = 'off' | 'breathe' | 'sway';

export function photoBounds(width: number, height: number, imageWidth: number, imageHeight: number): Bounds {
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const w = imageWidth * scale, h = imageHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export function recordingSize(width: number, height: number) {
  const scale = Math.min(1, 1920 / Math.max(width, height));
  return { width: Math.max(2, Math.round(width * scale / 2) * 2), height: Math.max(2, Math.round(height * scale / 2) * 2) };
}

export function moveCircle(placement: Placement, motion: Motion, seconds: number, bounds: Bounds, amount = 1): Placement {
  if (motion === 'off' || amount === 0) return placement;
  const phase = placement.id * 2.39996;
  const wave = (Math.sin(seconds * 0.65 + phase) - Math.sin(phase)) / 2;
  if (motion === 'breathe') return { ...placement, radius: placement.radius * (1 + wave * 0.09 * amount) };
  const amplitude = Math.min(placement.radius * 0.4, bounds.width * 0.055, bounds.height * 0.055) * amount;
  const margin = Math.min(placement.radius, bounds.width / 2, bounds.height / 2);
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  return {
    ...placement,
    x: clamp(placement.x + wave * amplitude, Math.min(placement.x, bounds.x + margin), Math.max(placement.x, bounds.x + bounds.width - margin)),
    y: clamp(placement.y + (Math.cos(seconds * 0.48 + phase) - Math.cos(phase)) / 2 * amplitude,
      Math.min(placement.y, bounds.y + margin), Math.max(placement.y, bounds.y + bounds.height - margin)),
  };
}
