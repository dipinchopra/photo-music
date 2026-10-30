import type { Placement } from './music';
import type { Bounds } from './scene';

export type VisualMode = 'living' | 'fragments' | 'ribbons' | 'shapes' | 'collage' | 'displaced' | 'quilt';
export const VISUAL_MODES: { id: VisualMode; label: string; description: string }[] = [
  { id: 'living', label: 'Living photo', description: 'Soft refraction with + markers, including in recordings.' },
  { id: 'shapes', label: 'Instrument shapes', description: 'Small, fine outlines. A quiet accent for each instrument.' },
  { id: 'fragments', label: 'Photo score', description: 'Layered photo fragments and flowing cuts compose a moving collage.' },
  { id: 'ribbons', label: 'Silk waves', description: 'A narrow refracted wave with a fine edge that catches each note.' },
  { id: 'collage', label: 'Prism', description: 'Subtle facets bend the photo and catch a little light on each note.' },
  { id: 'displaced', label: 'Photo echoes', description: 'Floating crops and traces bring distant parts of the photo together.' },
  { id: 'quilt', label: 'Contour ink', description: 'Fine, photo-colored contours unfold around each instrument.' },
];
export type Point = { x: number; y: number };
export const showsPlacementMarker = (mode: VisualMode) => mode === 'living';

/** Render scale is independent of the musical sampling radius. */
export function visualRadius(placement: Placement, mode: VisualMode) {
  return mode === 'living' ? placement.radius : mode === 'shapes'
    ? Math.max(12, Math.min(22, placement.radius * .32)) : Math.max(20, Math.min(84, placement.radius * .95));
}

/** This same outline drives drawing, hit testing, and rim removal. */
export function visualOutline(placement: Placement, mode: VisualMode, time = 0): Point[] {
  const { x, y, id } = placement;
  const r = visualRadius(placement, mode);
  if (mode === 'collage') return Array.from({ length: 6 }, (_, i) => {
    const angle = i / 6 * Math.PI * 2 - Math.PI / 6;
    return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
  });
  if (mode === 'displaced') {
    return [[-.825,-.625],[.825,-.625],[.825,.74],[-.825,.74]].map(([px,py]) => ({
      x:x+(px*Math.cos(-.08)-py*Math.sin(-.08))*r,
      y:y+(px*Math.sin(-.08)+py*Math.cos(-.08))*r,
    }));
  }
  if (mode === 'fragments') {
    return [[-.95,-.58],[.32,-.79],[.92,-.43],[.82,.6],[-.18,.78],[-.88,.4]]
      .map(([px,py]) => ({ x: x + px * r, y: y + py * r }));
  }
  if (mode === 'ribbons') {
    const edge = (u: number, sign: number) => ({ x: x + (u * 2 - 1) * r * 1.25,
      y: y + Math.sin(u * Math.PI * 1.8 + id * 0.7 + time * 0.25) * r * 0.3
        + sign * r * .45 });
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
    if (mode === 'shapes') {
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
  if (Math.hypot(x - placement.x, y - placement.y) <= (mode === 'shapes' ? 20 : 14)) return true;
  const points = visualOutline(placement, mode, time);
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside || edgeDistance(points, x, y) <= 5;
}

/** Never reach through another instrument to remove a shape underneath it. */
export function findDraggablePlacement(placements: Placement[], mode: VisualMode, x: number, y: number, time = 0) {
  return [...placements].reverse().find(placement => hitVisual(placement, mode, x, y, time));
}

export function findEditablePlacement(placements: Placement[], instrument: Placement['instrument'], mode: VisualMode,
  x: number, y: number, time = 0) {
  const top = findDraggablePlacement(placements, mode, x, y, time);
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

/** Bounded source crops work identically for original photos and export caches. */
function photoTile(ctx: CanvasRenderingContext2D, image: CanvasImageSource, bounds: Bounds,
  dx: number, dy: number, width: number, height: number, cx: number, cy: number, zoom = 1) {
  const source = image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const iw = source.naturalWidth || source.width || bounds.width;
  const ih = source.naturalHeight || source.height || bounds.height;
  const sw = Math.min(iw, width / bounds.width * iw / zoom);
  const sh = Math.min(ih, height / bounds.height * ih / zoom);
  const sx = Math.max(0, Math.min(iw - sw, (cx - bounds.x) / bounds.width * iw - sw / 2));
  const sy = Math.max(0, Math.min(ih - sh, (cy - bounds.y) / bounds.height * ih - sh / 2));
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, width, height);
}

function drawScorePiece(ctx: CanvasRenderingContext2D, image: CanvasImageSource, bounds: Bounds,
  placement: Placement, r: number, hit: number, opacity: number) {
  const outline = visualOutline(placement, 'fragments');
  ctx.save(); traceOutline(ctx, outline);
  ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
  ctx.globalAlpha = opacity; ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.clip();
  drawPhoto(ctx, image, bounds, placement, 1.16 + hit * .11,
    Math.sin(placement.id * 1.2) * r * .15, -r * (.09 + hit * .075));
  ctx.restore();
  const rim = ctx.createLinearGradient(placement.x - r, placement.y - r, placement.x + r, placement.y + r);
  rim.addColorStop(0, 'rgba(255,255,255,.48)'); rim.addColorStop(.4, 'rgba(255,255,255,0)'); rim.addColorStop(1, 'rgba(255,255,255,.12)');
  traceOutline(ctx, outline); ctx.strokeStyle = rim; ctx.lineWidth = .75;
  ctx.globalAlpha = opacity * (.5 + hit * .25); ctx.stroke();
}

function drawPrism(ctx: CanvasRenderingContext2D, image: CanvasImageSource, bounds: Bounds,
  placement: Placement, r: number, hit: number, opacity: number) {
  const outline = visualOutline(placement, 'collage');
  const { x, y } = placement;
  for (let face = 0; face < 6; face++) {
    const a = outline[face], b = outline[(face + 1) % 6];
    ctx.save(); traceOutline(ctx, [{ x, y }, a, b]); ctx.clip();
    ctx.globalAlpha = opacity * .94;
    drawPhoto(ctx, image, bounds, placement, 1.13 + (face % 3) * .06 + hit * .08,
      Math.cos(face * Math.PI / 3) * r * .1, Math.sin(face * Math.PI / 3) * r * .1);
    ctx.fillStyle = face < 3 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.025)';
    ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  const rim = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  rim.addColorStop(0, 'rgba(255,255,255,.6)'); rim.addColorStop(.5, 'rgba(255,255,255,.035)'); rim.addColorStop(1, 'rgba(255,255,255,.22)');
  traceOutline(ctx, outline); ctx.strokeStyle = rim; ctx.lineWidth = .8; ctx.globalAlpha = opacity * (.45 + hit * .35); ctx.stroke();
}

function drawEcho(ctx: CanvasRenderingContext2D, image: CanvasImageSource, bounds: Bounds,
  placement: Placement, r: number, hit: number, opacity: number) {
  const { x, y, id } = placement;
  const u = .12 + ((id * .61803398875 + .17) % 1) * .76;
  const v = .34 + ((id * .41421356237 + .39) % 1) * .48;
  const width = r * 1.65, height = r * 1.25;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-.08 + hit * .035);
  ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
  ctx.beginPath(); ctx.roundRect(-width / 2, -height / 2, width, height, 2);
  ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.globalAlpha = opacity; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.clip();
  ctx.globalAlpha = opacity * .9;
  photoTile(ctx, image, bounds, -width / 2, -height / 2, width, height,
    bounds.x + bounds.width * u, bounds.y + bounds.height * v, 1 + hit * .035);
  const sheen = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  sheen.addColorStop(0, 'rgba(255,255,255,.16)'); sheen.addColorStop(.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,.025)');
  ctx.fillStyle = sheen; ctx.fillRect(-width / 2, -height / 2, width, height); ctx.restore();
  // A second narrow exposure gives the fragment a photographic, layered edge.
  const stripY = y + height * .43;
  ctx.save(); ctx.beginPath(); ctx.roundRect(x - width * .42, stripY, width * .88, r * .2, 1); ctx.clip();
  ctx.globalAlpha = opacity * (.65 + hit * .2);
  photoTile(ctx,image,bounds,x-width*.42,stripY,width*.88,r*.2,
    bounds.x+bounds.width*u,bounds.y+bounds.height*v + r*.3,1.08);
  ctx.restore();
}

function drawContours(ctx: CanvasRenderingContext2D, placement: Placement, r: number, hit: number, opacity: number) {
  const { x, y, tone, id } = placement;
  const hue = tone?.hue ?? 35, contour = tone?.profile?.contour;
  for (let ring = 0; ring < 5; ring++) {
    const radius = r * (.24 + ring * .155 + hit * .04);
    const points = Array.from({ length: 80 }, (_, i) => {
      const angle = i / 80 * Math.PI * 2;
      const position = i / 80 * (contour?.length || 8);
      const a = Math.floor(position), fraction = position - a;
      const value = contour?.length ? contour[a % contour.length] * (1 - fraction) + contour[(a + 1) % contour.length] * fraction
        : .5 + Math.sin(angle * 3 + id) * .18;
      const edge = 1 + (value - .5) * .55 + Math.sin(angle * 2 + id + ring * .18) * .07;
      return { x: x + Math.cos(angle) * radius * edge * 1.1, y: y + Math.sin(angle) * radius * edge * .88 };
    });
    traceOutline(ctx, points); ctx.lineWidth = ring === 2 ? 1 : .65;
    ctx.strokeStyle = `hsl(${hue}, ${25 + (tone?.saturation ?? .5) * 30}%, ${(tone?.brightness ?? .5) > .6 ? 25 + ring * 3 : 76 + ring * 3}%)`;
    ctx.globalAlpha = opacity * (.26 + (4 - ring) * .035 + hit * .28); ctx.stroke();
  }
}

export function drawVisual(ctx: CanvasRenderingContext2D, image: CanvasImageSource, bounds: Bounds,
  placement: Placement, mode: VisualMode, time: number, hit: number, color: string, dpr = 1, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.scale(dpr, dpr);
  ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip();
  const { x, y, radius: r, id } = placement;
  const effectRadius = visualRadius(placement, mode);
  if (mode === 'collage') {
    drawPrism(ctx, image, bounds, placement, effectRadius, hit, opacity);
  } else if (mode === 'displaced') {
    drawEcho(ctx, image, bounds, placement, effectRadius, hit, opacity);
  } else if (mode === 'quilt') {
    drawContours(ctx, placement, effectRadius, hit, opacity);
  } else if (mode === 'living') {
    // Feathered concentric bands make a continuous, frameless distortion field.
    for (let band = 0; band < 18; band++) {
      const edge = 1 - band / 18;
      const inner = Math.max(0, edge - 1 / 18);
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r * edge, 0, Math.PI * 2);
      if (inner) ctx.arc(x, y, r * inner, 0, Math.PI * 2, true);
      ctx.clip('evenodd');
      const influence = Math.pow(1 - edge, 1.4);
      ctx.globalAlpha = opacity * Math.min(1, influence * 1.5);
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
    ctx.lineWidth = 1.1 + hit * .45;
    ctx.globalAlpha = opacity * (.56 + hit * .4);
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 3;
    ctx.stroke();
  } else if (mode === 'fragments') {
    drawScorePiece(ctx, image, bounds, placement, effectRadius, hit, opacity);
  } else if (mode === 'ribbons') {
    for (let ribbon = 0; ribbon < 3; ribbon++) {
      const edge = (u: number, sign: number) => {
        const wave = Math.sin(u * Math.PI * 1.8 + id * .7 + time * .25) * effectRadius * .3;
        return { x: x + (u * 2 - 1) * effectRadius * 1.25,
          y: y + wave + (ribbon - 1) * effectRadius * .29 + sign * effectRadius * (.035 + Math.sin(u * Math.PI) * .035) };
      };
      const outline = [...Array.from({length:32},(_,i)=>edge(i/31,-1)), ...Array.from({length:32},(_,i)=>edge(1-i/31,1))];
      ctx.save(); traceOutline(ctx,outline); ctx.clip(); ctx.globalAlpha=opacity*(.65+hit*.25);
      drawPhoto(ctx,image,bounds,placement,1.12+hit*.055,0,(ribbon-1)*effectRadius*.27);
      ctx.restore();
      const light=ctx.createLinearGradient(x-effectRadius,y,x+effectRadius,y);
      light.addColorStop(0,'rgba(255,255,255,0)');light.addColorStop(.45,'rgba(255,255,255,.65)');light.addColorStop(1,'rgba(255,255,255,0)');
      ctx.beginPath();outline.slice(0,32).forEach((point,i)=>i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
      ctx.strokeStyle=light;ctx.lineWidth=.7;ctx.globalAlpha=opacity*(.35+hit*.4);ctx.stroke();
    }
  }
  ctx.restore();
}

const INSTRUMENT_COLORS = { keys: '#8be9fd', guitar: '#50fa7b', bass: '#bd93f9', drums: '#ffb86c' };

/** A composition spanning the photo, shared by preview, live canvas and video export. */
export function drawVisualScene(ctx: CanvasRenderingContext2D, image: CanvasImageSource, bounds: Bounds,
  placements: readonly Placement[], mode: VisualMode, time: number, hits: ReadonlyMap<number, number>, dpr = 1) {
  if (mode !== 'living' && mode !== 'shapes' && placements.length > 1) {
    ctx.save(); ctx.scale(dpr, dpr);
    ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip();
    const ordered = [...placements].sort((a,b) => a.id - b.id);
    if (mode === 'collage') {
      // Larger planes let the placed ensemble compose the photograph itself.
      for (let i=0;i<Math.min(ordered.length-2,8);i+=2) {
        const triangle=ordered.slice(i,i+3);
        const area=Math.abs((triangle[1].x-triangle[0].x)*(triangle[2].y-triangle[0].y)-(triangle[1].y-triangle[0].y)*(triangle[2].x-triangle[0].x));
        if(area<1500) continue;
        const energy=Math.max(...triangle.map(point=>hits.get(point.id)??0));
        ctx.save();traceOutline(ctx,triangle);ctx.clip();ctx.globalAlpha=.55+energy*.25;
        const center={...triangle[0],x:triangle.reduce((sum,p)=>sum+p.x,0)/3,y:triangle.reduce((sum,p)=>sum+p.y,0)/3};
        drawPhoto(ctx,image,bounds,center,1.09+energy*.055,(i%3-1)*6,energy*-5);
        ctx.restore();
      }
    }
    // A bounded number of connections avoids a web of overlapping decoration.
    for (let index = 0; index < Math.min(ordered.length - 1, 11); index++) {
      const a = ordered[index], b = ordered[index + 1];
      const distance = Math.hypot(b.x-a.x,b.y-a.y);
      if (distance < 35) continue;
      const energy = Math.max(hits.get(a.id) ?? 0, hits.get(b.id) ?? 0);
      const nx = -(b.y-a.y)/distance, ny = (b.x-a.x)/distance;
      const bend = Math.min(34, distance * .13) * (index % 2 ? -1 : 1);
      const curve = (u: number, side = 0) => {
        const arc = Math.sin(u*Math.PI);
        const width = mode === 'fragments' ? (5 + arc * 17) * side : side;
        return { x: a.x + (b.x-a.x)*u + nx*(arc*bend + width), y: a.y + (b.y-a.y)*u + ny*(arc*bend + width) };
      };
      if (mode === 'fragments') {
        const band = [...Array.from({length:20},(_,i)=>curve(i/19,-1)), ...Array.from({length:20},(_,i)=>curve(1-i/19,1))];
        ctx.save(); traceOutline(ctx,band);
        ctx.shadowColor='rgba(0,0,0,.12)';ctx.shadowBlur=10;ctx.shadowOffsetY=3;
        ctx.fillStyle='rgba(255,255,255,.6)';ctx.globalAlpha=.7;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
        ctx.clip();ctx.globalAlpha=.9;
        drawPhoto(ctx,image,bounds,{...a,x:(a.x+b.x)/2,y:(a.y+b.y)/2},1.14+energy*.07,nx*(18+energy*7),ny*(18+energy*7));
        ctx.restore();
      }
      const wash=ctx.createLinearGradient(a.x,a.y,b.x,b.y);
      wash.addColorStop(0,'rgba(255,255,255,0)');wash.addColorStop(.4,`rgba(255,255,255,${mode === 'fragments' ? .24 : .16})`);wash.addColorStop(1,'rgba(255,255,255,0)');
      ctx.beginPath();Array.from({length:40},(_,i)=>curve(i/39,mode==='fragments'?-1:0)).forEach((point,i)=>i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
      ctx.strokeStyle=wash;ctx.lineWidth=mode==='ribbons'?.85:.6;ctx.globalAlpha=.5+energy*.4;ctx.stroke();
      if (energy>.03) {
        const u=.15+(1-energy)*.7, point=curve(u);
        ctx.beginPath();ctx.arc(point.x,point.y,1.2+energy*.7,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,.7)';ctx.globalAlpha=energy*.65;ctx.fill();
      }
    }
    ctx.restore();
  }
  for (const placement of placements) drawVisual(ctx,image,bounds,placement,mode,time,hits.get(placement.id)??0,INSTRUMENT_COLORS[placement.instrument],dpr);
}

/** Keep the same + markers visible on screen and in recordings, above effects. */
export function drawPlacementMarker(ctx: CanvasRenderingContext2D, bounds: Bounds, placement: Placement,
  color: string, dpr = 1, opacity = 1) {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip();
  // Keep arm dimensions consistent, but retain fractional positions so slow
  // sway never jumps between whole pixels. No hit animation moves the marker.
  const transform = ctx.getTransform();
  const unit = Math.min(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d));
  const width = Math.max(1, Math.round(1.75 * unit));
  const arm = Math.max(2, Math.round(4 * unit));
  const inset = (arm + width / 2 + unit) / unit;
  const markerX = Math.max(bounds.x + Math.min(inset, bounds.width / 2), Math.min(bounds.x + bounds.width - inset, placement.x));
  const markerY = Math.max(bounds.y + Math.min(inset, bounds.height / 2), Math.min(bounds.y + bounds.height - inset, placement.y));
  const x = transform.a * markerX + transform.c * markerY + transform.e;
  const y = transform.b * markerX + transform.d * markerY + transform.f;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y);
  ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm);
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = width + Math.max(2, Math.round(1.75 * unit)); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  ctx.restore();
}
