import type { Placement } from './music';
import type { Bounds } from './scene';

export type VisualMode = 'living' | 'fragments' | 'ribbons' | 'shapes';
export const VISUAL_MODES: { id: VisualMode; label: string; description: string }[] = [
  { id: 'living', label: 'Living photo', description: 'Soft refraction with + markers, including in recordings.' },
  { id: 'fragments', label: 'Floating fragments', description: 'Organic pieces of the photo lift and drift together.' },
  { id: 'ribbons', label: 'Photo ribbons', description: 'Strips of the image bend into flowing, layered ribbons.' },
  { id: 'shapes', label: 'Instrument shapes', description: 'Colored borders. Keys: circles. Guitar: leaves. Bass: squares. Drums: diamonds.' },
];
export type Point = { x: number; y: number };

/** This same outline drives drawing, hit testing, and rim removal. */
export function visualOutline(placement: Placement, mode: VisualMode, time = 0): Point[] {
  const { x, y, radius: r, id } = placement;
  if (mode === 'ribbons') {
    const edge = (u: number, sign: number) => ({ x: x + (u * 2 - 1) * r * 1.45,
      y: y + Math.sin(u * Math.PI * 1.8 + id * 0.7 + time * 0.25) * r * 0.3
        + sign * r * (0.14 + Math.sin(u * Math.PI) * 0.09) });
    return [...Array.from({ length: 33 }, (_, i) => edge(i / 32, -1)),
      ...Array.from({ length: 33 }, (_, i) => edge(1 - i / 32, 1))];
  }
  if (mode === 'shapes' && placement.instrument === 'drums') {
    return [{ x, y: y - r }, { x: x + r, y }, { x, y: y + r }, { x: x - r, y }];
  }
  if (mode === 'shapes' && placement.instrument === 'bass') {
    return [{ x: x - r, y: y - r }, { x: x + r, y: y - r },
      { x: x + r, y: y + r }, { x: x - r, y: y + r }];
  }
  return Array.from({ length: 80 }, (_, i) => {
    const angle = i / 80 * Math.PI * 2;
    let px = Math.cos(angle), py = Math.sin(angle);
    if (mode === 'fragments') {
      const edge = 1 + Math.sin(angle * 3 + id) * 0.14 + Math.cos(angle * 5 - id) * 0.06;
      px *= edge; py *= edge * 0.83;
    } else if (mode === 'shapes') {
      if (placement.instrument === 'guitar') {
        px *= 1.2; py *= Math.abs(py) * 0.7;
      }
    }
    return { x: x + px * r, y: y + py * r };
  });
}

export function traceOutline(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.closePath();
}

function edgeDistance(points: Point[], x: number, y: number) {
  return Math.min(...points.map((point, i) => {
    const next = points[(i + 1) % points.length];
    const dx = next.x - point.x, dy = next.y - point.y;
    const t = Math.max(0, Math.min(1, ((x - point.x) * dx + (y - point.y) * dy) / Math.max(0.0001, dx * dx + dy * dy)));
    return Math.hypot(x - point.x - t * dx, y - point.y - t * dy);
  }));
}

export function hitVisual(placement: Placement, mode: VisualMode, x: number, y: number, time = 0) {
  if (mode === 'living' && Math.hypot(x - placement.x, y - placement.y) <= 14) return true;
  const points = visualOutline(placement, mode, time);
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside || edgeDistance(points, x, y) <= 5;
}

/** Never reach through another instrument to remove a shape underneath it. */
export function findEditablePlacement(placements: Placement[], instrument: Placement['instrument'], mode: VisualMode,
  x: number, y: number, time = 0) {
  const top = [...placements].reverse().find(placement => hitVisual(placement, mode, x, y, time));
  return top?.instrument === instrument ? top : undefined;
}

function drawPhoto(ctx: CanvasRenderingContext2D, image: CanvasImageSource, bounds: Bounds,
  placement: Placement, zoom: number, offsetX = 0, offsetY = 0) {
  ctx.save();
  ctx.translate(placement.x, placement.y);
  ctx.scale(zoom, zoom);
  ctx.translate(-placement.x + offsetX, -placement.y + offsetY);
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.restore();
}

export function drawVisual(ctx: CanvasRenderingContext2D, image: CanvasImageSource, bounds: Bounds,
  placement: Placement, mode: VisualMode, time: number, hit: number, color: string, dpr = 1) {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip();
  const { x, y, radius: r, id } = placement;
  if (mode === 'living') {
    // Feathered concentric bands make a continuous, frameless distortion field.
    for (let band = 0; band < 18; band++) {
      const edge = 1 - band / 18;
      const inner = Math.max(0, edge - 1 / 18);
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r * edge, 0, Math.PI * 2);
      if (inner) ctx.arc(x, y, r * inner, 0, Math.PI * 2, true);
      ctx.clip('evenodd');
      const influence = Math.pow(1 - edge, 1.4);
      ctx.globalAlpha = Math.min(1, influence * 1.5);
      const flow = Math.sin(time * 0.55 + id * 1.3);
      drawPhoto(ctx, image, bounds, placement, 1 + influence * (0.12 + hit * 0.015),
        flow * r * 0.12 * influence, Math.cos(time * 0.43 + id) * r * 0.08 * influence);
      ctx.restore();
    }
  } else if (mode === 'shapes') {
    // Border-only shapes leave the photo and every overlapping shape visible.
    traceOutline(ctx, visualOutline(placement, mode, time));
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.75;
    ctx.globalAlpha = 1;
    ctx.stroke();
  } else {
    const outline = visualOutline(placement, mode, time);
    ctx.save();
    traceOutline(ctx, outline);
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.shadowColor = 'rgba(0,0,0,.4)';
    ctx.shadowBlur = (mode === 'fragments' ? 14 : 7) * dpr;
    ctx.shadowOffsetY = (mode === 'fragments' ? 6 : 3) * dpr;
    ctx.fill(); ctx.restore();
    ctx.save(); traceOutline(ctx, outline); ctx.clip();
    if (mode === 'ribbons') {
      // Adjacent strips displace the image along the ribbon's curved centerline.
      for (let strip = 0; strip < 64; strip++) {
        const u = (strip + 0.5) / 64;
        ctx.save(); ctx.beginPath();
        ctx.rect(x + (strip / 64 * 2 - 1) * r * 1.45, y - r, r * 2.9 / 64 + 0.5, r * 2);
        ctx.clip();
        drawPhoto(ctx, image, bounds, placement, 1.04,
          0, Math.sin(u * Math.PI * 1.8 + id * 0.7 + time * 0.25) * r * 0.13);
        ctx.restore();
      }
    } else drawPhoto(ctx, image, bounds, placement, mode === 'fragments' ? 1.09 : 1.06, r * 0.025, r * 0.02);
    const sheen = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    sheen.addColorStop(0, 'rgba(255,255,255,.22)');
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(255,255,255,.06)');
    ctx.fillStyle = sheen; ctx.fillRect(x - r * 1.6, y - r * 1.2, r * 3.2, r * 2.4);
    ctx.restore();
    traceOutline(ctx, outline);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.38)';
    ctx.globalAlpha = 1;
    ctx.stroke();
    // A small note glint, never a whole-image flash.
    ctx.globalAlpha = hit * 0.45; ctx.lineWidth = 2; ctx.strokeStyle = color;
    ctx.beginPath();
    outline.slice(0, Math.max(2, Math.floor(outline.length * 0.16))).forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
  }
  ctx.restore();
}

/** Keep the same + markers visible on screen and in recordings, above effects. */
export function drawPlacementMarker(ctx: CanvasRenderingContext2D, bounds: Bounds, placement: Placement,
  color: string, dpr = 1) {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip();
  const { x, y } = placement;
  ctx.beginPath();
  ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
  ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 1.75; ctx.stroke();
  ctx.restore();
}
