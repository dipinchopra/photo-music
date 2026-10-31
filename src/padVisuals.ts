import type { Bounds } from './scene';
import type { ImageTone, Placement } from './music';
import { PHOTO_PADS, photoPadBounds } from './pads';
import { drawVisual, type VisualMode } from './visuals';

export type PadHit = { pad: number; started: number; tone?: ImageTone; loop?: boolean };
export const PAD_EFFECT_SECONDS = 0.85;
const COLORS = { keys: '#8be9fd', guitar: '#50fa7b', bass: '#bd93f9', drums: '#ffb86c', pads: '#e5c79c' };
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
  if (!hit.loop) drawLiveFeedback(ctx, bounds, hit.pad, { status: 'ended', changedAt: seconds - age * LIVE_RELEASE_SECONDS, progress: 1 - age }, seconds, dpr);
}

export type LiveFeedback = { status: 'queued' | 'playing' | 'stopping' | 'ended'; changedAt: number; progress: number };
export const LIVE_RELEASE_SECONDS = .28;

/** Visual-only lifecycle: a removed layer leaves a short, fading trace on its photo region. */
export function updateLiveFeedback(feedback: Map<number, LiveFeedback>,
  states: readonly { index: number; status: 'queued' | 'playing' | 'stopping' }[], progress: ReadonlyMap<number, number>, seconds: number) {
  const present = new Set(states.map(state => state.index));
  for (const state of states) {
    const previous = feedback.get(state.index);
    feedback.set(state.index, { status: state.status,
      changedAt: previous?.status === state.status ? previous.changedAt : seconds,
      progress: progress.get(state.index) ?? previous?.progress ?? 0 });
  }
  feedback.forEach((visual, index) => {
    if (present.has(index)) return;
    if (visual.status !== 'ended') feedback.set(index, { ...visual, status: 'ended', changedAt: seconds });
    else if (seconds - visual.changedAt >= LIVE_RELEASE_SECONDS) feedback.delete(index);
  });
}

/** Live layers use a small clock-like cue, distinct from placed instrument marks. */
export function drawLiveFeedback(ctx: CanvasRenderingContext2D, bounds: Bounds, index: number,
  visual: LiveFeedback, seconds: number, dpr = 1) {
  const pad = PHOTO_PADS[index];
  if (!pad) return;
  const age = Math.max(0, seconds - visual.changedAt);
  const fade = visual.status === 'ended' ? Math.max(0, 1 - age / LIVE_RELEASE_SECONDS) ** 2 : 1;
  if (!fade) return;
  const cell = photoPadBounds(bounds, index), x = cell.x + cell.width / 2, y = cell.y + cell.height / 2;
  const base = Math.max(9, Math.min(24, Math.min(cell.width, cell.height) * .24));
  const radius = base * (visual.status === 'ended' ? 1 + age * .6 : 1 + .035 * Math.exp(-age * 6));
  const progress = Math.max(0, Math.min(1, visual.progress));
  ctx.save(); ctx.scale(dpr,dpr);
  ctx.beginPath(); ctx.rect(cell.x,cell.y,cell.width,cell.height); ctx.clip();
  ctx.globalAlpha = fade; ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.23)';
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3;
  ctx.setLineDash(visual.status === 'queued' || visual.status === 'stopping' ? [2,4] : []);
  ctx.lineDashOffset = visual.status === 'queued' ? -seconds * 4 : 0;
  ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle = COLORS[pad.instrument]; ctx.lineWidth = 1.4;
  ctx.globalAlpha = fade * (visual.status === 'stopping' ? .5 : .8);
  if (visual.status !== 'queued' && progress > .001) {
    ctx.beginPath();ctx.arc(x,y,radius,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();
  }
  ctx.fillStyle = COLORS[pad.instrument]; ctx.globalAlpha = fade * (visual.status === 'queued' ? .4 : .9);
  ctx.beginPath();ctx.arc(x,y,1.8,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
