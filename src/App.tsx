import { useEffect, useRef, useState } from 'react';
import { sampleAverageColor } from './color';
import { ChordEngine, colorToChord } from './music';

type Point = { x: number; y: number };
type VisualParticle = Point & { vx: number; vy: number; life: number; size: number; hue: number };

const music = new ChordEngine();

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointRef = useRef<Point | null>(null);
  const playingRef = useRef(false);
  const lastChordRef = useRef('');
  const beatRef = useRef<number | null>(null);
  const tempoRef = useRef(100);
  const visualRef = useRef({ pulse: 0, hue: 200, texture: 0, step: 0, particles: [] as VisualParticle[] });

  const [hasImage, setHasImage] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [chord, setChord] = useState('');
  const [controls, setControls] = useState({
    tempo: 100,
    pitch: 0,
    complexity: 55,
    warmth: 65,
    space: 65,
  });

  const draw = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    const imgRatio = image.naturalWidth / image.naturalHeight;
    const canvasRatio = width / height;
    let dw = width, dh = height, dx = 0, dy = 0;
    if (imgRatio > canvasRatio) {
      dh = width / imgRatio;
      dy = (height - dh) / 2;
    } else {
      dw = height * imgRatio;
      dx = (width - dw) / 2;
    }

    ctx.drawImage(image, dx, dy, dw, dh);

    const p = pointRef.current;
    if (isActive && p) {
      const px = p.x * dpr;
      const py = p.y * dpr;
      const radius = Math.max(76, Math.min(rect.width, rect.height) * 0.13) * dpr;
      const visual = visualRef.current;

      // Chromatic image echoes breathe with the musical pulse.
      if (visual.pulse > 0.015) {
        const offset = (3 + visual.texture * 13) * visual.pulse * dpr;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.07 + visual.pulse * 0.1;
        ctx.drawImage(image, dx + offset, dy, dw, dh);
        ctx.globalAlpha *= 0.72;
        ctx.drawImage(image, dx - offset, dy + offset * 0.35, dw, dh);
        ctx.restore();
      }

      ctx.save();
      // An even-odd path cuts a real hole in the veil without erasing the image.
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill('evenodd');
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.lineWidth = Math.max(1, 1.5 * dpr);
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 8 * dpr;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      visual.particles.forEach((particle) => {
        ctx.globalAlpha = Math.max(0, particle.life) * 0.72;
        ctx.fillStyle = `hsl(${particle.hue} 90% 65%)`;
        ctx.beginPath();
        ctx.arc(particle.x * dpr, particle.y * dpr, particle.size * dpr, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = visual.pulse * 0.55;
      ctx.strokeStyle = `hsl(${visual.hue} 95% 70%)`;
      ctx.lineWidth = Math.max(1, 2 * dpr);
      ctx.beginPath();
      ctx.arc(px, py, radius * (1 + visual.pulse * 0.45), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  useEffect(() => {
    draw();
  }, [hasImage, isActive]);

  const startBeat = () => {
    if (beatRef.current) return;
    beatRef.current = window.setInterval(() => {
      if (!playingRef.current) return;
      music.pulse();
      const visual = visualRef.current;
      const point = pointRef.current;
      visual.pulse = 1;
      visual.step++;
      if (point) {
        const count = 3 + Math.round(visual.texture * 8 + controls.complexity / 22);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.35 + Math.random() * (1.2 + visual.texture * 2.5);
          visual.particles.push({
            x: point.x, y: point.y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life: 1, size: 1.2 + Math.random() * 3.8,
            hue: (visual.hue + Math.random() * 70 - 35 + 360) % 360,
          });
        }
      }
      if ('vibrate' in navigator) navigator.vibrate(8);
    }, 30000 / tempoRef.current); // eighth-note clock
  };

  const stopBeat = () => {
    if (beatRef.current) window.clearInterval(beatRef.current);
    beatRef.current = null;
  };

  useEffect(() => {
    tempoRef.current = controls.tempo;
    music.configure({
      transpose: controls.pitch,
      complexity: controls.complexity / 100,
      warmth: controls.warmth / 100,
      space: controls.space / 100,
    });
    if (playingRef.current) {
      stopBeat();
      startBeat();
    }
  }, [controls]);

  useEffect(() => {
    if (!isActive) return;
    let frame = 0;
    const animate = () => {
      const visual = visualRef.current;
      visual.pulse *= 0.91;
      visual.particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.985;
        particle.vy *= 0.985;
        particle.life -= 0.018 + visual.texture * 0.01;
      });
      visual.particles = visual.particles.filter((particle) => particle.life > 0).slice(-90);
      draw();
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isActive]);

  const setControl = (name: keyof typeof controls, value: number) => {
    setControls((current) => ({ ...current, [name]: value }));
  };

  const activateAt = async (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !hasImage) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    pointRef.current = { x, y };
    setIsActive(true);
    playingRef.current = true;
    startBeat();

    // Redraw first, then sample from a clean image-only buffer.
    draw();
    const image = imageRef.current;
    if (!image) return;

    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const octx = off.getContext('2d', { willReadFrequently: true });
    if (!octx) return;

    const imgRatio = image.naturalWidth / image.naturalHeight;
    const canvasRatio = off.width / off.height;
    let dw = off.width, dh = off.height, dx = 0, dy = 0;
    if (imgRatio > canvasRatio) {
      dh = off.width / imgRatio;
      dy = (off.height - dh) / 2;
    } else {
      dw = off.height * imgRatio;
      dx = (off.width - dw) / 2;
    }
    octx.drawImage(image, dx, dy, dw, dh);

    const dpr = off.width / rect.width;
    const sample = sampleAverageColor(octx, x * dpr, y * dpr, 18 * dpr);
    visualRef.current.hue = sample.h;
    visualRef.current.texture = sample.texture;
    const nextChord = colorToChord(sample.h, sample.s, sample.l, sample.texture);

    if (nextChord.id !== lastChordRef.current) {
      await music.play(nextChord);
      if (!playingRef.current) {
        music.stop(0.02);
        return;
      }
      lastChordRef.current = nextChord.id;
      setChord(nextChord.name);
      if ('vibrate' in navigator) navigator.vibrate(16);
    }

    requestAnimationFrame(draw);
  };

  const deactivate = () => {
    playingRef.current = false;
    lastChordRef.current = '';
    setIsActive(false);
    setChord('');
    stopBeat();
    music.stop(0.04);
    visualRef.current.particles = [];
    visualRef.current.pulse = 0;
    pointRef.current = null;
    requestAnimationFrame(draw);
  };

  const onUpload = (file?: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const variation = crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff;
      music.setVariation(variation);
      visualRef.current.step = Math.floor(variation * 10000);
      visualRef.current.particles = [];
      setHasImage(true);
      requestAnimationFrame(draw);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">IMAGE → MUSIC</div>
          <h1>Play your photo</h1>
        </div>
        <label className="uploadButton">
          {hasImage ? 'Change image' : 'Upload image'}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onUpload(e.target.files?.[0])}
          />
        </label>
      </header>

      <div className="instrument">
      <section className={`stage ${hasImage ? 'hasImage' : ''}`}>
        {!hasImage && (
          <label className="emptyState">
            <strong>Play your photo</strong>
            <span>Then move, tap or drag across it to hear its colors.</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onUpload(e.target.files?.[0])}
            />
          </label>
        )}

        <canvas
          ref={canvasRef}
          className="canvas"
          onPointerDown={(e) => {
            // iOS requires AudioContext creation/resume directly in a user gesture.
            void music.unlock();
            if (e.pointerType !== 'touch') {
              e.currentTarget.setPointerCapture(e.pointerId);
            }
            activateAt(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' || e.buttons > 0 || playingRef.current) {
              activateAt(e.clientX, e.clientY);
            }
          }}
          onPointerUp={deactivate}
          onPointerCancel={deactivate}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') deactivate();
          }}
        />

        {hasImage && !isActive && (
          <div className="hint">Move your cursor — or touch and drag</div>
        )}

        {isActive && chord && <div className="chordPill">{chord}</div>}
      </section>

      <section className="controls" aria-label="Music controls">
        <label>
          <span>Tempo <output>{controls.tempo} BPM</output></span>
          <small>Sets how quickly the melody moves.</small>
          <input type="range" min="55" max="170" value={controls.tempo}
            onChange={(e) => setControl('tempo', Number(e.target.value))} />
        </label>
        <label>
          <span>Pitch <output>{controls.pitch > 0 ? '+' : ''}{controls.pitch} st</output></span>
          <small>Shifts the whole image higher or lower.</small>
          <input type="range" min="-12" max="12" value={controls.pitch}
            onChange={(e) => setControl('pitch', Number(e.target.value))} />
        </label>
        <label>
          <span>Complexity <output>{controls.complexity}%</output></span>
          <small>Adds movement, note jumps and denser patterns.</small>
          <input type="range" min="0" max="100" value={controls.complexity}
            onChange={(e) => setControl('complexity', Number(e.target.value))} />
        </label>
        <label>
          <span>Warmth <output>{controls.warmth}%</output></span>
          <small>Moves from bright and electric to soft and rounded.</small>
          <input type="range" min="0" max="100" value={controls.warmth}
            onChange={(e) => setControl('warmth', Number(e.target.value))} />
        </label>
        <label>
          <span>Space <output>{controls.space}%</output></span>
          <small>Creates depth with longer echoes and atmosphere.</small>
          <input type="range" min="0" max="100" value={controls.space}
            onChange={(e) => setControl('space', Number(e.target.value))} />
        </label>
      </section>
      </div>

      <footer>
        <span>Hue → chord</span>
        <span>Brightness → octave</span>
        <span>Saturation → richness</span>
        <span>Texture spectrum → shimmer</span>
      </footer>
    </main>
  );
}
