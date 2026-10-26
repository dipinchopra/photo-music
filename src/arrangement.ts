import { randomAt } from './composition';
import type { Bounds } from './scene';
import type { ImageTone, Instrument, Placement } from './music';

/** Pick editable starting voices from the photo, without changing its harmony. */
export function createPhotoLoop(bounds: Bounds, cells: readonly ImageTone[], seed: number,
  variation: number, firstId: number, sample: (x: number, y: number, radius: number) => ImageTone | null): Placement[] {
  if (!cells.length || bounds.width <= 0 || bounds.height <= 0) return [];
  const arrangementSeed = seed ^ Math.imul(variation + 1, 0x9e3779b9);
  const used = new Set<number>();
  const instruments: Instrument[] = ['drums', 'bass', 'keys', 'guitar'];
  const radius = Math.min(48, Math.min(bounds.width, bounds.height) * .12);
  return instruments.map((instrument, lane) => {
    const score = (cell: ImageTone, index: number) => {
      const character = instrument === 'drums' ? 1 - cell.brightness
        : instrument === 'bass' ? (1 - cell.brightness) * .7 + cell.saturation * .3
        : instrument === 'keys' ? cell.saturation * .5 + (1 - Math.abs(cell.brightness - .55)) * .5
        : cell.texture * .65 + cell.saturation * .35;
      return character + randomAt(arrangementSeed, index + lane * 31) * .6;
    };
    const candidates = cells.map((cell, index) => ({ cell, index, score: score(cell, index) }))
      .filter(candidate => !used.has(candidate.index)).sort((a, b) => b.score - a.score);
    const chosen = candidates[0] ?? { cell: cells[0], index: 0 };
    used.add(chosen.index);
    const columns = 4, rows = Math.ceil(cells.length / columns);
    const u = (chosen.index % columns + .5 + (randomAt(arrangementSeed, 100 + lane) - .5) * .3) / columns;
    const v = (Math.floor(chosen.index / columns) + .5 + (randomAt(arrangementSeed, 200 + lane) - .5) * .3) / rows;
    const marginX = Math.min(radius + 2, bounds.width / 2), marginY = Math.min(radius + 2, bounds.height / 2);
    const x = bounds.x + Math.max(marginX, Math.min(bounds.width - marginX, u * bounds.width));
    const y = bounds.y + Math.max(marginY, Math.min(bounds.height - marginY, v * bounds.height));
    return { id: firstId + lane, instrument, x, y, radius,
      level: instrument === 'keys' ? .52 : instrument === 'guitar' ? .28 : instrument === 'bass' ? .58 : .48,
      tone: sample(x, y, radius) ?? chosen.cell };
  });
}
