import { useEffect, useRef, useState } from 'react';
import { sampleAverageColor } from './color';
import { ChordEngine, type Instrument, type Placement } from './music';

const music = new ChordEngine();
const INSTRUMENTS: Array<{ id: Instrument; label: string; color: string }> = [
  { id: 'keys', label: '🎹 Keyboard', color: '#8be9fd' },
  { id: 'bass', label: '🎸 Bass', color: '#bd93f9' },
  { id: 'drums', label: '🥁 Percussion', color: '#ffb86c' },
];

function Slider({ min = 0, max = 100, value, onChange }: {
  min?: number; max?: number; value: number; onChange: (value: number) => void;
}) {
  const progress = ((value - min) / (max - min)) * 100;
  return <input type="range" min={min} max={max} value={value}
    style={{ '--range-progress': `${progress}%` } as React.CSSProperties}
    onChange={(event) => onChange(+event.target.value)} />;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const placementsRef = useRef<Placement[]>([]);
  const livePlacementRef = useRef<Placement | null>(null);
  const beatRef = useRef<number | null>(null);
  const tempoRef = useRef(96);
  const pulseRef = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    id: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean;
  } | null>(null);
  const nextIdRef = useRef(1);

  const [hasImage, setHasImage] = useState(false);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selected, setSelected] = useState<Instrument>('keys');
  const [mode, setMode] = useState<'place' | 'live'>('place');
  const [radius, setRadius] = useState(50);
  const [controls, setControls] = useState({
    tempo: 96, pitch: 0, complexity: 52, space: 58,
    keys: 78, keysTone: 62, keysSustain: 55,
    bass: 68, bassDepth: 70, bassMovement: 45,
    drums: 60, drumPunch: 70, drumDensity: 50,
  });

  const draw = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
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
    if (imgRatio > canvasRatio) { dh = width / imgRatio; dy = (height - dh) / 2; }
    else { dw = height * imgRatio; dx = (width - dw) / 2; }
    ctx.drawImage(image, dx, dy, dw, dh);

    const drawnPlacements = livePlacementRef.current
      ? [...placementsRef.current, livePlacementRef.current]
      : placementsRef.current;
    if (drawnPlacements.length) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.38)';
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      drawnPlacements.forEach((placement) => {
        ctx.moveTo((placement.x + placement.radius) * dpr, placement.y * dpr);
        ctx.arc(placement.x * dpr, placement.y * dpr, placement.radius * dpr, 0, Math.PI * 2);
      });
      ctx.fill('evenodd');
      ctx.restore();
    }

    drawnPlacements.forEach((placement) => {
      const config = INSTRUMENTS.find((item) => item.id === placement.instrument)!;
      const x = placement.x * dpr;
      const y = placement.y * dpr;
      const r = placement.radius * dpr;
      ctx.save();
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 2 * dpr;
      ctx.shadowColor = config.color;
      ctx.shadowBlur = (7 + pulseRef.current * 12) * dpr;
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + pulseRef.current * 0.08), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  };

  const startBeat = () => {
    if (beatRef.current) return;
    beatRef.current = window.setInterval(() => {
      music.pulse();
      pulseRef.current = 1;
    }, 30000 / tempoRef.current);
  };

  const stopBeat = () => {
    if (beatRef.current) clearInterval(beatRef.current);
    beatRef.current = null;
  };

  useEffect(() => {
    tempoRef.current = controls.tempo;
    music.configure({
      transpose: controls.pitch,
      complexity: controls.complexity / 100,
      space: controls.space / 100,
      keys: controls.keys / 100,
      keysTone: controls.keysTone / 100,
      keysSustain: controls.keysSustain / 100,
      bass: controls.bass / 100,
      bassDepth: controls.bassDepth / 100,
      bassMovement: controls.bassMovement / 100,
      drums: controls.drums / 100,
      drumPunch: controls.drumPunch / 100,
      drumDensity: controls.drumDensity / 100,
    });
    if (placementsRef.current.length) { stopBeat(); startBeat(); }
  }, [controls]);

  useEffect(() => {
    let frame = 0;
    const animate = () => {
      pulseRef.current *= 0.9;
      draw();
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  });

  useEffect(() => {
    const resize = () => draw();
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  });

  const setControl = (name: keyof typeof controls, value: number) => {
    setControls((current) => ({ ...current, [name]: value }));
  };

  const canvasPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
    };
  };

  const sampleToneAt = (x: number, y: number, sampleRadius: number) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return null;
    const rect = canvas.getBoundingClientRect();
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const imgRatio = image.naturalWidth / image.naturalHeight;
    const canvasRatio = off.width / off.height;
    let dw = off.width, dh = off.height, dx = 0, dy = 0;
    if (imgRatio > canvasRatio) { dh = off.width / imgRatio; dy = (off.height - dh) / 2; }
    else { dw = off.height * imgRatio; dx = (off.width - dw) / 2; }
    ctx.drawImage(image, dx, dy, dw, dh);
    const dpr = off.width / rect.width;
    const sample = sampleAverageColor(ctx, x * dpr, y * dpr, Math.max(12, sampleRadius * 0.35) * dpr);
    return { hue: sample.h, saturation: sample.s, brightness: sample.l, texture: sample.texture };
  };

  const makePlacementAt = (clientX: number, clientY: number, id: number) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !hasImage) return null;
    const { x, y } = canvasPoint(clientX, clientY);
    const tone = sampleToneAt(x, y, radius);
    if (!tone) return null;
    return {
      id, x, y, radius,
      level: 0.25 + ((radius - 28) / 62) * 0.75,
      instrument: selected,
      tone,
    } satisfies Placement;
  };

  const placeAt = async (clientX: number, clientY: number) => {
    const placement = makePlacementAt(clientX, clientY, nextIdRef.current++);
    if (!placement) return;
    const next = [...placementsRef.current, placement].slice(-12);
    placementsRef.current = next;
    setPlacements(next);
    await music.playPlacements(next);
    startBeat();
    pulseRef.current = 1;
  };

  const playLiveAt = async (clientX: number, clientY: number) => {
    const placement = makePlacementAt(clientX, clientY, -1);
    if (!placement) return;
    livePlacementRef.current = placement;
    await music.playPlacements([...placementsRef.current, placement]);
    startBeat();
    pulseRef.current = 1;
  };

  const stopLive = () => {
    livePlacementRef.current = null;
    if (placementsRef.current.length) void music.playPlacements(placementsRef.current);
    else { stopBeat(); music.stop(); }
  };

  const updatePlacements = (next: Placement[]) => {
    placementsRef.current = next;
    setPlacements(next);
    void music.playPlacements(next);
    if (!next.length) { stopBeat(); music.stop(); }
  };

  const upload = (file?: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      music.setVariation(crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff);
      updatePlacements([]);
      setHasImage(true);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };

  return <main className="app">
    <header className="topbar">
      <div><div className="eyebrow">PHOTO COMPOSER</div><h1>Build a photo loop</h1></div>
      <label className="uploadButton">{hasImage ? 'Change image' : 'Upload image'}
        <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} />
      </label>
    </header>

    <div className="instrument composer">
      <section className="controls composerControls" aria-label="Composer controls">
        <div className="controlGroup">
          <strong>1. Choose how to play</strong>
          <div className="modePicker">
            <button className={mode === 'place' ? 'selected' : ''} onClick={() => { stopLive(); setMode('place'); }}>Place loops</button>
            <button className={mode === 'live' ? 'selected' : ''} onClick={() => setMode('live')}>Live cursor</button>
          </div>
          <strong>2. Choose an instrument</strong>
          <div className="instrumentPicker">
            {INSTRUMENTS.map((instrument) => <button key={instrument.id}
              className={selected === instrument.id ? 'selected' : ''}
              style={{ '--instrument-color': instrument.color } as React.CSSProperties}
              onClick={() => setSelected(instrument.id)}>{instrument.label}</button>)}
          </div>
        </div>
        <label><span>Circle size <output>{radius}px</output></span>
          <small>Larger circles sample more of the photo and play louder.</small>
          <Slider min={28} max={90} value={radius} onChange={setRadius} />
        </label>
        <div className="placementActions">
          <button disabled={!placements.length} onClick={() => updatePlacements(placementsRef.current.slice(0, -1))}>Undo</button>
          <button disabled={!placements.length} onClick={() => updatePlacements([])}>Clear</button>
          <span>{placements.length}/12 placed</span>
        </div>
        <small className="loopHint">Tap a placed circle to remove it from the loop.</small>
        <div className="instrumentModule keysModule"><strong>🎹 Keyboard</strong>
          {([['keys', 'Volume', 'Sets the level of every keyboard circle.'], ['keysTone', 'Tone', 'Moves from soft keys to a brighter synth.'],
            ['keysSustain', 'Sustain', 'Controls how long keyboard notes ring.']] as const).map(([key, label, help]) =>
            <label key={key}><span>{label} <output>{controls[key]}%</output></span><small>{help}</small>
              <Slider value={controls[key]} onChange={(value) => setControl(key, value)} /></label>)}</div>
        <div className="instrumentModule bassModule"><strong>🎸 Bass</strong>
          {([['bass', 'Volume', 'Sets the level of every bass circle.'], ['bassDepth', 'Depth', 'Pushes bass notes into a lower register.'],
            ['bassMovement', 'Movement', 'Adds faster notes and melodic variation.']] as const).map(([key, label, help]) =>
            <label key={key}><span>{label} <output>{controls[key]}%</output></span><small>{help}</small>
              <Slider value={controls[key]} onChange={(value) => setControl(key, value)} /></label>)}</div>
        <div className="instrumentModule drumsModule"><strong>🥁 Percussion</strong>
          {([['drums', 'Volume', 'Sets the overall drum level.'], ['drumPunch', 'Punch', 'Strengthens kick impact and snare body.'],
            ['drumDensity', 'Density', 'Adds more subdivisions to bright percussion circles.']] as const).map(([key, label, help]) =>
            <label key={key}><span>{label} <output>{controls[key]}%</output></span><small>{help}</small>
              <Slider value={controls[key]} onChange={(value) => setControl(key, value)} /></label>)}</div>
        <div className="instrumentModule globalModule"><strong>Composition</strong>
          <label><span>Tempo <output>{controls.tempo} BPM</output></span><small>Sets the speed of the loop.</small>
            <Slider min={55} max={160} value={controls.tempo} onChange={(value) => setControl('tempo', value)} /></label>
          <label><span>Pitch <output>{controls.pitch > 0 ? '+' : ''}{controls.pitch} st</output></span><small>Transposes the complete arrangement.</small>
            <Slider min={-12} max={12} value={controls.pitch} onChange={(value) => setControl('pitch', value)} /></label>
          <label><span>Variation <output>{controls.complexity}%</output></span><small>Moves from spacious patterns to busier phrases.</small>
            <Slider value={controls.complexity} onChange={(value) => setControl('complexity', value)} /></label>
          <label><span>Space <output>{controls.space}%</output></span><small>Adds echo and atmospheric depth.</small>
            <Slider value={controls.space} onChange={(value) => setControl('space', value)} /></label></div>
      </section>

      <section className={`stage ${hasImage ? 'hasImage' : ''}`}>
        {!hasImage && <label className="emptyState"><strong>Choose a photo</strong><span>Then place instruments onto its colors and textures.</span>
          <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} /></label>}
        <canvas ref={canvasRef} className={`canvas placementCanvas ${mode === 'live' ? 'liveCanvas' : ''}`}
          onPointerDown={(e) => {
            void music.unlock();
            if (mode === 'live') {
              e.currentTarget.setPointerCapture(e.pointerId);
              void playLiveAt(e.clientX, e.clientY);
              return;
            }
            const point = canvasPoint(e.clientX, e.clientY);
            const hit = [...placementsRef.current].reverse().find((placement) =>
              Math.hypot(point.x - placement.x, point.y - placement.y) <= placement.radius);
            if (hit) {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragRef.current = {
                id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y,
                startX: e.clientX, startY: e.clientY, moved: false,
              };
            } else pointerStartRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (mode === 'live') {
              if (e.pointerType === 'mouse' || e.buttons > 0) void playLiveAt(e.clientX, e.clientY);
              return;
            }
            const drag = dragRef.current;
            if (!drag) return;
            const point = canvasPoint(e.clientX, e.clientY);
            if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 7) return;
            drag.moved = true;
            const next = placementsRef.current.map((placement) => placement.id === drag.id
              ? { ...placement, x: point.x - drag.offsetX, y: point.y - drag.offsetY }
              : placement);
            placementsRef.current = next;
            setPlacements(next);
          }}
          onPointerUp={(e) => {
            if (mode === 'live') { stopLive(); return; }
            const drag = dragRef.current;
            if (drag) {
              dragRef.current = null;
              if (!drag.moved) {
                updatePlacements(placementsRef.current.filter((placement) => placement.id !== drag.id));
                return;
              }
              const next = placementsRef.current.map((placement) => {
                if (placement.id !== drag.id) return placement;
                const tone = sampleToneAt(placement.x, placement.y, placement.radius);
                return tone ? { ...placement, tone } : placement;
              });
              updatePlacements(next);
              return;
            }
            const start = pointerStartRef.current;
            pointerStartRef.current = null;
            if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 12) void placeAt(e.clientX, e.clientY);
          }}
          onPointerCancel={() => {
            if (mode === 'live') stopLive();
            dragRef.current = null; pointerStartRef.current = null;
          }}
          onPointerLeave={(e) => { if (mode === 'live' && e.pointerType === 'mouse') stopLive(); }} />
        {hasImage && !placements.length && <div className="hint">{mode === 'live'
          ? 'Move the cursor — press and drag on mobile'
          : 'Choose an instrument, set its size, then tap the photo'}</div>}
      </section>
    </div>
    <footer><span>Circle size → volume</span><span>Color → notes</span><span>Texture → rhythm</span></footer>
  </main>;
}
