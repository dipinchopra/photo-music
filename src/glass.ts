type ImageBounds = { x: number; y: number; width: number; height: number };

/** A shallow lens: gentle magnification with stronger bending at the perimeter. */
export function refractPhoto(
  ctx: CanvasRenderingContext2D, image: HTMLImageElement, bounds: ImageBounds,
  x: number, y: number, radius: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  // Concentric annuli approximate the curved edge without per-pixel processing.
  for (let band = 0; band < 16; band++) {
    const outer = radius * (1 - band / 16);
    const inner = band === 15 ? 0 : radius * (1 - (band + 1) / 16);
    const edge = outer / radius;
    const zoom = 1.1 + Math.pow(edge, 5) * 0.22;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    if (inner > 0) ctx.arc(x, y, inner, 0, Math.PI * 2, true);
    ctx.clip('evenodd');
    ctx.translate(x, y);
    ctx.scale(zoom, zoom);
    ctx.translate(-x + radius * 0.025, -y + radius * 0.035);
    ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.restore();
  }
  ctx.restore();
}

export function drawGlassRim(
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number,
  color: string, dpr: number, strength: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  const sheen = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  sheen.addColorStop(0, 'rgba(255,255,255,.30)');
  sheen.addColorStop(0.3, 'rgba(255,255,255,.035)');
  sheen.addColorStop(0.65, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,.10)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  const bevel = ctx.createRadialGradient(x, y, radius * 0.78, x, y, radius);
  bevel.addColorStop(0, 'rgba(255,255,255,0)');
  bevel.addColorStop(0.75, 'rgba(255,255,255,.04)');
  bevel.addColorStop(1, 'rgba(255,255,255,.22)');
  ctx.fillStyle = bevel;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.38;
  ctx.lineWidth = 1.2 * dpr;
  ctx.shadowColor = color;
  ctx.shadowBlur = 2 * dpr;
  ctx.stroke();
  ctx.shadowBlur = 0;
  const rim = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  rim.addColorStop(0, 'rgba(255,255,255,.9)');
  rim.addColorStop(0.35, 'rgba(255,255,255,.12)');
  rim.addColorStop(0.65, 'rgba(255,255,255,.02)');
  rim.addColorStop(1, 'rgba(255,255,255,.65)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.4 * dpr;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius - 1.5 * dpr, 0, Math.PI * 2);
  ctx.stroke();
  // A small rim glint replaces whole-circle flashing.
  if (strength > 0.01) {
    ctx.beginPath();
    const angle = -Math.PI * 0.75 + (1 - strength) * 0.55;
    ctx.arc(x, y, radius - 1.5 * dpr, angle, angle + Math.PI * 0.38);
    ctx.globalAlpha = strength * 0.48;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  }
  ctx.restore();
}
