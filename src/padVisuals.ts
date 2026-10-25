import type { Bounds } from './scene';
import type { ImageTone, Placement } from './music';
import { PHOTO_PADS, photoPadBounds } from './pads';
import { drawVisual, drawPlacementMarker, showsPlacementMarker, type VisualMode } from './visuals';

export type PadHit = { pad: number; started: number; tone?: ImageTone };
export const PAD_EFFECT_SECONDS = 0.85;
const COLORS = { keys: '#8be9fd', guitar: '#50fa7b', bass: '#bd93f9', drums: '#ffb86c' };
/** Live gestures use the selected photo style, with no pad grids or labels. */
export function drawPadHit(ctx: CanvasRenderingContext2D, image: CanvasImageSource,
  bounds: Bounds, hit: PadHit, seconds: number, dpr = 1, mode: VisualMode = 'living') {
  const age = (seconds - hit.started) / PAD_EFFECT_SECONDS;
  if (age < 0 || age >= 1 || !PHOTO_PADS[hit.pad]) return;
  const cell = photoPadBounds(bounds, hit.pad);
  const strength = Math.pow(1 - age, 2);
  const instrument = PHOTO_PADS[hit.pad].instrument;
  const base = Math.min(cell.width, cell.height) * .46;
  const placement: Placement = {
    id: 100000 + hit.pad, x: cell.x + cell.width / 2, y: cell.y + cell.height / 2,
    radius: base * (1 + strength * (instrument === 'bass' ? .3 : instrument === 'drums' ? .2 : .1)),
    level: 1, instrument,
    tone: hit.tone ?? { hue: 35, saturation: .5, brightness: .5, texture: .5 },
  };
  drawVisual(ctx, image, bounds, placement, mode, age * .4, strength, COLORS[instrument], dpr, 1 - age);
  if (showsPlacementMarker(mode)) drawPlacementMarker(ctx, bounds, placement, COLORS[instrument], dpr, 1 - age);
}
