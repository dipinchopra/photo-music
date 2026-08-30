export function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s, l };
}

export function sampleAverageColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  const canvas = ctx.canvas;
  const sx = Math.max(0, Math.floor(x - radius));
  const sy = Math.max(0, Math.floor(y - radius));
  const ex = Math.min(canvas.width, Math.ceil(x + radius));
  const ey = Math.min(canvas.height, Math.ceil(y + radius));
  const width = Math.max(1, ex - sx);
  const height = Math.max(1, ey - sy);
  const { data } = ctx.getImageData(sx, sy, width, height);

  let r = 0, g = 0, b = 0, count = 0;
  const stride = 16; // sample every 4th pixel (RGBA = 4 values)
  for (let i = 0; i < data.length; i += stride) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }

  const hsl = rgbToHsl(r / count, g / count, b / count);

  // An 8×8 discrete Fourier transform measures local spatial detail. Smooth
  // areas concentrate energy near DC; edges and texture create high frequencies.
  const size = 8;
  const luminance: number[] = [];
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const px = Math.min(width - 1, Math.floor((gx + 0.5) * width / size));
      const py = Math.min(height - 1, Math.floor((gy + 0.5) * height / size));
      const i = (py * width + px) * 4;
      luminance.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
    }
  }

  let lowEnergy = 0;
  let highEnergy = 0;
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      if (u === 0 && v === 0) continue;
      let real = 0;
      let imaginary = 0;
      for (let gy = 0; gy < size; gy++) {
        for (let gx = 0; gx < size; gx++) {
          const angle = -2 * Math.PI * ((u * gx + v * gy) / size);
          const value = luminance[gy * size + gx];
          real += value * Math.cos(angle);
          imaginary += value * Math.sin(angle);
        }
      }
      const energy = real * real + imaginary * imaginary;
      const distance = Math.hypot(Math.min(u, size - u), Math.min(v, size - v));
      if (distance <= 1.5) lowEnergy += energy;
      else highEnergy += energy;
    }
  }

  const texture = highEnergy / Math.max(0.0001, lowEnergy + highEnergy);
  return { ...hsl, texture: Math.max(0, Math.min(1, texture)) };
}
