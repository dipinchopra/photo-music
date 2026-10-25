type ImageBounds = { x: number; y: number; width: number; height: number };

/** A shallow lens: gentle magnification with stronger bending at the perimeter. */
export function refractPhoto(
  ctx: CanvasRenderingContext2D, image: HTMLImageElement, bounds: ImageBounds,
  x: number, y: number, radius: number, strength: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  // Concentric annuli approximate the curved edge without per-pixel processing.
  for (let band = 0; band < 5; band++) {
    const outer = radius * (1 - band * 0.055);
    const inner = band === 4 ? 0 : radius * (1 - (band + 1) * 0.055);
    const zoom = 1.025 + (4 - band) * 0.012 + strength * 0.008;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    if (inner > 0) ctx.arc(x, y, inner, 0, Math.PI * 2, true);
    ctx.clip('evenodd');
    ctx.translate(x, y);
    ctx.scale(zoom, zoom);
    ctx.translate(-x, -y);
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
  sheen.addColorStop(0, 'rgba(255,255,255,.24)');
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
  ctx.globalAlpha = 0.65 + strength * 0.2;
  ctx.lineWidth = 1.2 * dpr;
  ctx.shadowColor = color;
  ctx.shadowBlur = (3 + strength * 5) * dpr;
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
  ctx.restore();
}
