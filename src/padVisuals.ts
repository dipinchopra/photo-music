import type { Bounds } from './scene';
import { PHOTO_PADS, PAD_KEYS, photoPadBounds } from './pads';

export type PadHit = { pad: number; started: number };
export const PAD_EFFECT_SECONDS = 0.85;
/** Temporary photo-only gestures; no generic shapes are painted over the image. */
export function drawPadHit(ctx: CanvasRenderingContext2D, image: CanvasImageSource,
  bounds: Bounds, hit: PadHit, seconds: number, dpr = 1) {
  const age = (seconds - hit.started) / PAD_EFFECT_SECONDS;
  if (age < 0 || age >= 1) return;
  const cell = photoPadBounds(bounds, hit.pad);
  const strength = Math.pow(1 - age, 3);
  const row = Math.floor(hit.pad / 4);
  const cx = cell.x + cell.width / 2, cy = cell.y + cell.height / 2;
  ctx.save(); ctx.scale(dpr, dpr);
  ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip();
  ctx.beginPath(); ctx.rect(cell.x, cell.y, cell.width, cell.height); ctx.clip();
  ctx.globalAlpha = Math.min(1, (1 - age) * 3);
  ctx.translate(cx, cy);
  if (row === 0) { // Chords unfold horizontally.
    ctx.scale(1 + strength * 0.35, 1 + strength * 0.06);
    ctx.translate(strength * cell.width * (hit.pad % 2 ? -0.12 : 0.12), 0);
  } else if (row === 1) { // Textures tilt and swell a piece of the photo.
    ctx.rotate(strength * (hit.pad % 2 ? -0.16 : 0.16));
    ctx.scale(1 + strength * 0.3, 1 + strength * 0.3);
  } else if (row === 2) { // Bass stretches and settles.
    ctx.scale(1 + strength * 0.08, 1 + strength * 0.55);
  } else { // Percussion punches into a crop and springs back.
    ctx.scale(1 + strength * 0.45, 1 + strength * 0.45);
    ctx.translate(0, -strength * cell.height * 0.08);
  }
  ctx.translate(-cx, -cy);
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.restore();
}

/** Pad guides are editor controls: keep them out of the recording. */
export function drawPadGuides(ctx: CanvasRenderingContext2D, bounds: Bounds, dpr = 1) {
  ctx.save(); ctx.scale(dpr, dpr);
  ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip();
  for (let i = 0; i < PHOTO_PADS.length; i++) {
    const cell = photoPadBounds(bounds, i);
    ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = 0.6;
    ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);
    const size = Math.max(7, Math.min(10, cell.width / 10));
    ctx.font = `500 ${size}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fillText(`${PAD_KEYS[i].toUpperCase()} · ${PHOTO_PADS[i].name}`, cell.x + 5,
      cell.y + cell.height - 6, Math.max(1, cell.width - 10));
  }
  ctx.restore();
}
