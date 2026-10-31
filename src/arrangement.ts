import { randomAt } from './composition';
import type { Bounds } from './scene';
import type { ImageTone, Instrument, Placement } from './music';

/** Arrange a rhythm section, lead and answering voices from distinct photo regions. */
export function createPhotoLoop(bounds: Bounds, cells: readonly ImageTone[], seed: number,
  variation: number, firstId: number, sample: (x: number, y: number, radius: number) => ImageTone | null): Placement[] {
  if (!cells.length || bounds.width <= 0 || bounds.height <= 0) return [];
  const arrangementSeed = seed ^ Math.imul(variation + 1, 0x9e3779b9);
  const used = new Set<number>();
  // Rotate ensemble sizes deliberately, so successive shuffles cannot repeat the same layout.
  const ensemble = (Math.floor(randomAt(seed, 91) * 4) + variation) % 4;
  const sections: Instrument[][] = [
    ['drums', 'drums', 'bass', 'pads', 'keys', 'keys', 'guitar'],
    ['drums', 'drums', 'drums', 'bass', 'pads', 'keys', 'keys', 'guitar'],
    ['drums', 'drums', 'bass', 'pads', 'keys', 'keys', 'keys', 'guitar', 'guitar'],
    ['drums', 'drums', 'drums', 'bass', 'pads', 'keys', 'keys', 'keys', 'guitar', 'guitar'],
  ];
  const instruments = sections[ensemble];
  const baseRadius = Math.min(48, Math.min(bounds.width, bounds.height) * .12);
  return instruments.map((instrument, lane) => {
    const voice = instruments.slice(0, lane).filter(value => value === instrument).length;
    const radius = baseRadius * (instrument === 'bass' ? 1 : voice === 0 ? .95 : .65 + randomAt(arrangementSeed, lane + 400) * .2);
    const score = (cell: ImageTone, index: number) => {
      const drumTarget = voice === 0 ? .12 : voice === 1 ? .5 : .9;
      const character = instrument === 'drums' ? 1 - Math.abs(cell.brightness - drumTarget) * 2
        : instrument === 'bass' ? (1 - cell.brightness) * .7 + cell.saturation * .3
        : instrument === 'pads' ? (1-cell.texture)*.5 + cell.saturation*.5
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
      level: instrument === 'pads' ? .55 : instrument === 'keys' ? (voice === 0 ? .52 : .31)
        : instrument === 'guitar' ? (voice === 0 ? .3 : .2) : instrument === 'bass' ? .58 : (voice === 0 ? .52 : .34),
      tone: sample(x, y, radius) ?? chosen.cell };
  });
}
