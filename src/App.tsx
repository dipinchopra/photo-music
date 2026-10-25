import { useEffect, useRef, useState } from 'react';
import { sampleAverageColor } from './color';
import { composeImage, type ArpMode } from './composition';
import { photoBounds, recordingSize, moveCircle, type Motion } from './scene';
import { refractPhoto, drawGlassRim } from './glass';
import { ChordEngine, type Instrument, type Placement } from './music';

const music = new ChordEngine();
const INSTRUMENTS: Array<{ id: Instrument; label: string; color: string }> = [
  { id: 'keys', label: '🎹 Keyboard', color: '#8be9fd' },
  { id: 'guitar', label: '🎸 Guitar', color: '#50fa7b' },
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

function Arpeggiator({ mode, rate, onMode, onRate }: {
  mode: ArpMode; rate: number; onMode: (mode: ArpMode) => void; onRate: (rate: number) => void;
}) {
  return <fieldset className="arpControls"><legend>Arpeggiator</legend>
    <label><span>Pattern</span><select value={mode} onChange={event => onMode(event.target.value as ArpMode)}>
      <option value="off">Off · image phrase</option><option value="up">Up</option><option value="down">Down</option><option value="upDown">Up / down</option>
    </select></label>
    <label><span>Rate</span><select disabled={mode === 'off'} value={rate} onChange={event => onRate(Number(event.target.value))}>
      <option value={2}>1/4 · once per beat</option><option value={1}>1/8 · twice per beat</option>
    </select></label>
  </fieldset>;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const toneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const placementsRef = useRef<Placement[]>([]);
  const livePlacementsRef = useRef(new Map<number, Placement>());
  const beatRef = useRef<number | null>(null);
  const visualHitsRef = useRef(new Map<number, number>());
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    id: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean;
  } | null>(null);
  const nextIdRef = useRef(1);

  const sheetDragStart = useRef<number | null>(null);
  const [sheet, setSheet] = useState<Instrument | 'mix' | null>(null);
  const openSheet = (value: Instrument | 'mix') => {
    if (value !== 'mix') {
      setSelected(value);
    }
    setSheet(current => current === value ? null : value);
  };

  useEffect(() => {
    if (!sheet) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setSheet(null); };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [sheet]);

  const [hasImage, setHasImage] = useState(false);
  const [audioPaused, setAudioPaused] = useState(false);
  const [imageStyle, setImageStyle] = useState('');
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selected, setSelected] = useState<Instrument>('keys');
  const [mode, setMode] = useState<'place' | 'live'>('place');
  const [radius, setRadius] = useState(50);
  const [fourOnFloor, setFourOnFloor] = useState(false);
  const [arps, setArps] = useState({ keys: 'off' as ArpMode, guitar: 'off' as ArpMode, keysRate: 2, guitarRate: 2 });
  const [controls, setControls] = useState({
    tempo: 96, pitch: 0, complexity: 52, space: 58,
    keys: 78, keysTone: 62, keysSustain: 55, keysDelay: 0,
    guitar: 70, guitarTone: 58, guitarStrum: 50, guitarDelay: 0,
    bass: 68, bassDepth: 70, bassMovement: 45, bassDelay: 0,
    drums: 60, drumPunch: 70, drumDensity: 50, drumDelay: 0,
  });

  const [motion, setMotion] = useState<Motion>('off');
  const motionRef = useRef<Motion>('off');
  const [motionAmount, setMotionAmount] = useState(55);
  const motionAmountRef = useRef(0.55);
  const motionSecondsRef = useRef(0);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingType, setRecordingType] = useState('');
  const [recordError, setRecordError] = useState('');

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const startRecording = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasImage) return;
    setRecordError('');
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      setRecordError('Video recording is unavailable in this browser. Use your phone’s screen recorder.');
      return;
    }
    try {
      const audio = await music.recordingStream();
      const image = imageRef.current!;
      const cropped = document.createElement('canvas');
      const size = recordingSize(image.naturalWidth, image.naturalHeight);
      cropped.width = size.width; cropped.height = size.height;
      recordingCanvasRef.current = cropped;
      draw();
      const stream = cropped.captureStream(30);
      // Clone audio so stopping a recording never stops the engine’s audio track.
      audio.getAudioTracks().forEach(track => stream.addTrack(track.clone()));
      recordingStreamRef.current = stream;
      const mimeType = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        recordingCanvasRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (!chunks.length) return;
        if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
        const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
        recordingUrlRef.current = url;
        setRecordingType(recorder.mimeType);
        setRecordingUrl(url);
      };
      recorder.onerror = () => { setRecordError('Recording failed. Please try again.'); stopRecording(); };
      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
    } catch {
      recordingStreamRef.current?.getTracks().forEach(track => track.stop());
      recordingStreamRef.current = null;
      recordingCanvasRef.current = null;
      setRecordError('Could not start recording in this browser. Try your phone’s screen recorder.');
    }
  };

  useEffect(() => () => {
    if (beatRef.current !== null) clearInterval(beatRef.current);
    const recorder = recorderRef.current;
    if (recorder) { recorder.onstop = null; if (recorder.state !== 'inactive') recorder.stop(); }
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    music.stop();
  }, []);

  useEffect(() => {
    music.onPlacementHit = id => visualHitsRef.current.set(id, 1);
    const canvas = canvasRef.current;
    const prevent = (event: Event) => event.preventDefault();
    canvas?.addEventListener('touchstart', prevent, { passive: false });
    canvas?.addEventListener('selectstart', prevent);
    return () => {
      music.onPlacementHit = null;
      canvas?.removeEventListener('touchstart', prevent);
      canvas?.removeEventListener('selectstart', prevent);
    };
  }, []);

  const scenePlacements = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return placementsRef.current;
    const rect = canvas.getBoundingClientRect();
    const bounds = photoBounds(rect.width, rect.height, image.naturalWidth, image.naturalHeight);
    return placementsRef.current.map(placement => dragRef.current?.id === placement.id ? placement
      : moveCircle(placement, motionRef.current, motionSecondsRef.current, bounds, motionAmountRef.current));
  };

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
    const { x: dx, y: dy, width: dw, height: dh } = photoBounds(width, height, image.naturalWidth, image.naturalHeight);
    ctx.drawImage(image, dx, dy, dw, dh);

    const drawnPlacements = [...scenePlacements(), ...livePlacementsRef.current.values()];

    drawnPlacements.forEach(placement => {
      refractPhoto(ctx, image, { x: dx, y: dy, width: dw, height: dh },
        placement.x * dpr, placement.y * dpr, placement.radius * dpr);
    });

    if (drawnPlacements.length) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.16)';
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
      drawGlassRim(ctx, x, y, r, config.color, dpr,
        visualHitsRef.current.get(placement.id) ?? 0);
    });
    const cropped = recordingCanvasRef.current;
    const recordingContext = cropped?.getContext('2d');
    if (cropped && recordingContext) {
      // Copy only the photo rectangle, including all rendered lenses and glints.
      recordingContext.drawImage(canvas, dx, dy, dw, dh, 0, 0, cropped.width, cropped.height);
    }

  };

  const startBeat = () => {
    if (beatRef.current) return;
    beatRef.current = window.setInterval(() => {
      if (!music.needsScheduling) return;
      if (motionRef.current !== 'off' || dragRef.current) {
        const moving = scenePlacements().map(placement => ({
          ...placement, tone: sampleToneAt(placement.x, placement.y, placement.radius) ?? placement.tone,
        }));
        music.updatePlacements([...moving, ...livePlacementsRef.current.values()]);
      }
      music.schedule();
    }, 25);
  };

  const stopBeat = () => {
    if (beatRef.current) clearInterval(beatRef.current);
    beatRef.current = null;
  };

  useEffect(() => {
    music.configure({
      tempo: controls.tempo,
      transpose: controls.pitch,
      complexity: controls.complexity / 100,
      space: controls.space / 100,
      keys: controls.keys / 100,
      keysTone: controls.keysTone / 100,
      keysSustain: controls.keysSustain / 100,
      keysDelay: controls.keysDelay / 100,
      keysArp: arps.keys, keysArpRate: arps.keysRate,
      guitar: controls.guitar / 100,
      guitarTone: controls.guitarTone / 100,
      guitarStrum: controls.guitarStrum / 100,
      guitarDelay: controls.guitarDelay / 100,
      guitarArp: arps.guitar, guitarArpRate: arps.guitarRate,
      bass: controls.bass / 100,
      bassDepth: controls.bassDepth / 100,
      bassMovement: controls.bassMovement / 100,
      bassDelay: controls.bassDelay / 100,
      drums: controls.drums / 100,
      drumPunch: controls.drumPunch / 100,
      drumDensity: controls.drumDensity / 100,
      drumDelay: controls.drumDelay / 100,
      fourOnFloor,
    });
  }, [controls, fourOnFloor, arps]);

  useEffect(() => {
    let frame = 0;
    let previousTime = performance.now();
    const animate = () => {
      const now = performance.now();
      if (!document.hidden) motionSecondsRef.current += Math.min(0.05, (now - previousTime) / 1000);
      previousTime = now;
      visualHitsRef.current.forEach((strength, id) => {
        if (strength < 0.01) visualHitsRef.current.delete(id);
        else visualHitsRef.current.set(id, strength * 0.95);
      });
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
    const image = imageRef.current;
    const bounds = image ? photoBounds(rect.width, rect.height, image.naturalWidth, image.naturalHeight)
      : { x: 0, y: 0, width: rect.width, height: rect.height };
    return {
      x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, clientX - rect.left)),
      y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, clientY - rect.top)),
    };
  };

  const sampleToneAt = (x: number, y: number, sampleRadius: number) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return null;
    const rect = canvas.getBoundingClientRect();
    const off = toneCanvasRef.current;
    const ctx = off?.getContext('2d', { willReadFrequently: true });
    if (!off || !ctx) return null;
    const bounds = photoBounds(rect.width, rect.height, image.naturalWidth, image.naturalHeight);
    const scale = off.width / bounds.width;
    const sx = Math.max(0, Math.min(off.width - 1, (x - bounds.x) * scale));
    const sy = Math.max(0, Math.min(off.height - 1, (y - bounds.y) * scale));
    const sample = sampleAverageColor(ctx, sx, sy, Math.max(2, sampleRadius * scale));
    return { hue: sample.h, saturation: sample.s, brightness: sample.l, texture: sample.texture, profile: sample.profile };
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
    const next = [...placementsRef.current, placement];
    placementsRef.current = next;
    setPlacements(next);
    await music.playPlacements(next);
    startBeat();
  };

  const playLiveAt = async (clientX: number, clientY: number, pointerId: number) => {
    const placement = makePlacementAt(clientX, clientY, -pointerId - 1);
    if (!placement) return;
    const previous = livePlacementsRef.current.get(pointerId);
    // A held touch keeps its instrument when another instrument is selected.
    if (previous) placement.instrument = previous.instrument;
    livePlacementsRef.current.set(pointerId, placement);
    await music.playPlacements([...placementsRef.current, ...livePlacementsRef.current.values()]);
    if (placementsRef.current.length || livePlacementsRef.current.size) startBeat();
  };

  const stopLive = (pointerId?: number) => {
    if (pointerId === undefined) livePlacementsRef.current.clear();
    else livePlacementsRef.current.delete(pointerId);
    const next = [...placementsRef.current, ...livePlacementsRef.current.values()];
    if (next.length) void music.playPlacements(next);
    else { stopBeat(); music.stop(); }
  };

  const resumePlayback = async () => {
    if (document.hidden || !placementsRef.current.length) return;
    setAudioPaused(!music.running);
    try {
      await music.playPlacements(placementsRef.current);
      if (document.hidden) return;
      if (music.running) {
        startBeat();
      }
      setAudioPaused(!music.running);
    } catch { setAudioPaused(true); }
  };

  useEffect(() => {
    music.onPlaybackState = running => {
      setAudioPaused(!running && placementsRef.current.length > 0 && !document.hidden);
    };
    const pause = () => {
      livePlacementsRef.current.clear();
      stopBeat();
      music.stop();
    };
    const show = () => {
      if (document.hidden) pause();
      else void resumePlayback();
    };
    const focus = () => { if (!document.hidden) void resumePlayback(); };
    const gesture = () => { if (!music.running) void resumePlayback(); };
    window.addEventListener('blur', pause);
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', focus);
    document.addEventListener('visibilitychange', show);
    document.addEventListener('pointerdown', gesture, true);
    document.addEventListener('keydown', gesture, true);
    return () => {
      music.onPlaybackState = null;
      window.removeEventListener('blur', pause);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', focus);
      document.removeEventListener('visibilitychange', show);
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('keydown', gesture, true);
    };
  }, []);

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
      stopRecording();
      imageRef.current = image;
      const toneCanvas = document.createElement('canvas');
      const toneScale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
      toneCanvas.width = Math.max(1, Math.round(image.naturalWidth * toneScale));
      toneCanvas.height = Math.max(1, Math.round(image.naturalHeight * toneScale));
      toneCanvas.getContext('2d', { willReadFrequently: true })?.drawImage(image, 0, 0, toneCanvas.width, toneCanvas.height);
      toneCanvasRef.current = toneCanvas;
      motionSecondsRef.current = 0;
      // Analyze a fixed-size copy, independent of display size and device pixel ratio.
      const analysis = document.createElement('canvas');
      analysis.width = 64; analysis.height = 64;
      const context = analysis.getContext('2d', { willReadFrequently: true });
      if (context) {
        context.drawImage(image, 0, 0, 64, 64);
        const cells = [];
        for (let y = 8; y < 64; y += 16) for (let x = 8; x < 64; x += 16) {
          const cell = sampleAverageColor(context, x, y, 8);
          cells.push({ hue: cell.h, saturation: cell.s, brightness: cell.l, texture: cell.texture, profile: cell.profile });
        }
        const composition = composeImage(cells);
        music.setComposition(composition);
        setImageStyle({ ambient: 'Soft atmosphere', glass: 'Glass bells', plucked: 'Plucked groove', pulse: 'Synth pulse' }[composition.style]);
        setControls(current => ({ ...current, tempo: composition.tempo }));
      }
      stopLive();
      updatePlacements([]);
      setHasImage(true);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };

  return <main className="app" onContextMenu={event => event.preventDefault()}>
    <header className="topbar">
      <div><div className="eyebrow">IMAGE / MUSIC</div><h1>Build a photo loop</h1></div>
      <div className="headerActions">
      <button className={`recordButton ${recording ? 'recording' : ''}`} disabled={!hasImage} onClick={() => { if (recording) stopRecording(); else void startRecording(); }} aria-pressed={recording}><span aria-hidden="true">{recording ? '■' : '●'}</span> {recording ? 'Stop' : 'Record'}</button>
      <label className="uploadButton">{hasImage ? '↗ Change photo' : '↗ Add photo'}
        <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      </div>
    </header>
    {audioPaused && <div className="recordMessage" role="status"><span>Audio paused</span><button onClick={() => void resumePlayback()}>Resume sound ▶</button></div>}
    {hasImage && <div className="recordMessage"><span>{imageStyle}</span><span>{controls.tempo} BPM</span></div>}
    {recordError && <div className="recordMessage" role="alert">{recordError}</div>}
    {recordingUrl && <div className="recordMessage"><a href={recordingUrl} download={`image-music.${recordingType.includes('mp4') ? 'mp4' : 'webm'}`}>↓ Save recording</a><button onClick={() => { URL.revokeObjectURL(recordingUrl); setRecordingUrl(null); }}>Dismiss</button></div>}

    <div className="instrument composer">
      <section className={`stage ${hasImage ? 'hasImage' : ''}`}>

        {!hasImage && <label className="emptyState"><div className="orb"><span>＋</span></div><strong>Choose a photo</strong><span>Place instruments onto its colors and textures.</span><b className="emptyCta">Choose a photo ↗</b>
          <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} /></label>}
        <canvas ref={canvasRef} draggable={false} className={`canvas placementCanvas ${mode === 'live' ? 'liveCanvas' : ''}`}
          onContextMenu={e => e.preventDefault()}
          onDragStart={e => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            void music.unlock();
            if (mode === 'live') {
              e.currentTarget.setPointerCapture(e.pointerId);
              void playLiveAt(e.clientX, e.clientY, e.pointerId);
              return;
            }
            const point = canvasPoint(e.clientX, e.clientY);
            const hit = [...scenePlacements()].reverse().find((placement) =>
              Math.hypot(point.x - placement.x, point.y - placement.y) <= placement.radius);
            if (hit) {
              placementsRef.current = placementsRef.current.map(placement => placement.id === hit.id ? hit : placement);
              e.currentTarget.setPointerCapture(e.pointerId);
              dragRef.current = {
                id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y,
                startX: e.clientX, startY: e.clientY, moved: false,
              };
            } else pointerStartRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (mode === 'live') {
              if (e.pointerType === 'mouse' || livePlacementsRef.current.has(e.pointerId)) void playLiveAt(e.clientX, e.clientY, e.pointerId);
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
            if (mode === 'live') { stopLive(e.pointerId); return; }
            const drag = dragRef.current;
            if (drag) {
              dragRef.current = null;
              if (!drag.moved) {
                updatePlacements(placementsRef.current.filter(placement => placement.id !== drag.id));
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
          onLostPointerCapture={e => { if (mode === 'live') stopLive(e.pointerId); }}
          onPointerCancel={(e) => {
            if (mode === 'live') stopLive(e.pointerId);
            dragRef.current = null; pointerStartRef.current = null;
          }}
          onPointerLeave={(e) => { if (mode === 'live' && e.pointerType === 'mouse') stopLive(e.pointerId); }} />
        {hasImage && !placements.length && <div className="hint">{mode === 'live'
          ? 'Touch and play — use multiple fingers'
          : 'Choose an instrument, set its size, then tap the photo'}</div>}
      </section>
    </div>
    <section className="performanceBar" aria-label="Common controls">
      <div className="modePicker">
        <button aria-pressed={mode === 'place'} className={mode === 'place' ? 'selected' : ''} onClick={() => { stopLive(); setMode('place'); }}>Place loops</button>
        <button aria-pressed={mode === 'live'} className={mode === 'live' ? 'selected' : ''} onClick={() => { stopLive(); setMode('live'); }}>Play live</button>
      </div>
      <div className="placementActions">
        <button aria-label="Undo last loop" disabled={!placements.length} onClick={() => updatePlacements(placementsRef.current.slice(0, -1))}>↶ <span>Undo</span></button>
        <button disabled={!placements.length} onClick={() => updatePlacements([])}>Clear</button>
      </div>
    </section>
    <section className="motionControls" aria-label="Circle motion">
      <span>Motion</span>
      <div className="modePicker">
        {(['off', 'breathe', 'sway'] as const).map(value => <button key={value} disabled={!hasImage}
          aria-pressed={motion === value} className={motion === value ? 'selected' : ''}
          onClick={() => {
            motionRef.current = value; setMotion(value); motionSecondsRef.current = 0;
            music.updatePlacements([...placementsRef.current, ...livePlacementsRef.current.values()]);
          }}>{value === 'off' ? 'Off' : value === 'breathe' ? 'Breathe' : 'Sway'}</button>)}
      </div>
      <small>{motion === 'sway' ? 'Drift across colors · sound follows' : motion === 'breathe' ? 'Gently expand and settle' : 'Keep circles still'}</small>
    </section>
    <div className={`dockRegion ${sheet ? 'sheetExpanded' : ''}`}>
    <nav className="instrumentDock" aria-label="Instruments and mix">
      {INSTRUMENTS.map((instrument, index) => <button key={instrument.id}
        style={{ '--instrument-color': instrument.color } as React.CSSProperties}
        className={selected === instrument.id ? 'active' : ''}
        aria-label={`${instrument.label.slice(3)} controls`} aria-pressed={selected === instrument.id} aria-controls="instrumentSheet" aria-expanded={sheet === instrument.id}
        onClick={() => openSheet(instrument.id)}>
        <span className="instrumentGlyph" aria-hidden="true">{['▥', '≋', '⌁', '⠿'][index]}</span>
        <span>{['Keys', 'Guitar', 'Bass', 'Drums'][index]}</span><i />
      </button>)}
      <button className={`mixButton ${sheet === 'mix' ? 'active' : ''}`} aria-controls="instrumentSheet" aria-expanded={sheet === 'mix'} onClick={() => openSheet('mix')}><span className="instrumentGlyph" aria-hidden="true">☷</span><span>Mix</span><small>{controls.tempo}</small></button>
    </nav>
    <section id="instrumentSheet" className={`controlSheet ${sheet ? 'isOpen' : ''}`} inert={!sheet} aria-hidden={!sheet}
      aria-labelledby="sheetTitle">
      <div className="sheetContent controls" style={{ '--instrument-color': INSTRUMENTS.find(i => i.id === sheet)?.color || '#f5f5f5' } as React.CSSProperties}>
        <button className="sheetHandle" aria-label="Collapse controls" onClick={() => setSheet(null)}
          onPointerDown={event => { sheetDragStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerUp={event => { if (sheetDragStart.current !== null && event.clientY - sheetDragStart.current > 30) setSheet(null); sheetDragStart.current = null; }}
          onPointerCancel={() => { sheetDragStart.current = null; }}><span /></button>
        <header className="sheetHeader"><div><h2 id="sheetTitle">{sheet === 'mix' ? 'The mix' : INSTRUMENTS.find(i => i.id === sheet)?.label}</h2></div><button onClick={() => setSheet(null)} aria-label="Close controls">✕</button></header>
        {sheet === 'keys' && <div className="instrumentModule keysModule"><strong>🎹 Keyboard</strong>
          {([['keys', 'Volume', 'Sets the level of every keyboard circle.'], ['keysTone', 'Tone', 'Moves from soft keys to a brighter synth.'],
            ['keysSustain', 'Note length', 'Controls how long keyboard notes ring.']] as const).map(([key, label, help]) =>
            <label key={key}><span>{label} <output>{controls[key]}%</output></span><small>{help}</small>
              <Slider value={controls[key]} onChange={(value) => setControl(key, value)} /></label>)}
          <Arpeggiator mode={arps.keys} rate={arps.keysRate}
            onMode={value => setArps(current => ({ ...current, keys: value }))}
            onRate={value => setArps(current => ({ ...current, keysRate: value }))} />
        </div>}
        {sheet === 'guitar' && <div className="instrumentModule guitarModule"><strong>🎸 Guitar</strong>
          {([['guitar', 'Volume', 'Sets the level of every guitar circle.'], ['guitarTone', 'Tone', 'Moves from mellow plucks to brighter strings.'],
            ['guitarStrum', 'Note length', 'Controls how long guitar notes ring.']] as const).map(([key, label, help]) =>
            <label key={key}><span>{label} <output>{controls[key]}%</output></span><small>{help}</small>
              <Slider value={controls[key]} onChange={(value) => setControl(key, value)} /></label>)}
          <Arpeggiator mode={arps.guitar} rate={arps.guitarRate}
            onMode={value => setArps(current => ({ ...current, guitar: value }))}
            onRate={value => setArps(current => ({ ...current, guitarRate: value }))} />
        </div>}
        {sheet === 'bass' && <div className="instrumentModule bassModule"><strong>🎸 Bass</strong>
          {([['bass', 'Volume', 'Sets the level of every bass circle.'], ['bassDepth', 'Depth', 'Pushes bass notes into a lower register.'],
            ['bassMovement', 'Movement', 'Adds beat-aligned bass notes.']] as const).map(([key, label, help]) =>
            <label key={key}><span>{label} <output>{controls[key]}%</output></span><small>{help}</small>
              <Slider value={controls[key]} onChange={(value) => setControl(key, value)} /></label>)}</div>}
        {sheet === 'drums' && <div className="instrumentModule drumsModule"><strong>🥁 Percussion</strong>
          {([['drums', 'Volume', 'Sets the overall drum level.'], ['drumPunch', 'Punch', 'Strengthens kick impact and snare body.'],
            ['drumDensity', 'Detail', 'Adds subdivisions to bright percussion circles.']] as const).map(([key, label, help]) =>
            <label key={key}><span>{label} <output>{controls[key]}%</output></span><small>{help}</small>
              <Slider value={controls[key]} onChange={(value) => setControl(key, value)} /></label>)}
          <button className={`floorToggle ${fourOnFloor ? 'selected' : ''}`}
            aria-pressed={fourOnFloor} onClick={() => setFourOnFloor((value) => !value)}>
            <span>Four-on-the-floor</span><small>{fourOnFloor ? 'On · kick plays every beat' : 'Off · kick follows the image pattern'}</small>
          </button>
        </div>}
        {sheet === 'mix' && <div className="instrumentModule globalModule"><strong>Composition</strong>
          <label><span>Tempo <output>{controls.tempo} BPM</output></span><small>Sets the speed of the loop.</small>
            <Slider min={55} max={160} value={controls.tempo} onChange={(value) => setControl('tempo', value)} /></label>
          <label><span>Pitch <output>{controls.pitch > 0 ? '+' : ''}{controls.pitch} st</output></span><small>Transposes the complete arrangement.</small>
            <Slider min={-12} max={12} value={controls.pitch} onChange={(value) => setControl('pitch', value)} /></label>
          <label><span>Variation <output>{controls.complexity}%</output></span><small>Moves from spacious patterns to busier phrases.</small>
            <Slider value={controls.complexity} onChange={(value) => setControl('complexity', value)} /></label>
          <label><span>Space <output>{controls.space}%</output></span><small>Adds echo and atmospheric depth.</small>
            <Slider value={controls.space} onChange={(value) => setControl('space', value)} /></label></div>}

        {sheet === 'mix' && <label className="sizeControl"><span>Circle size <output>{Math.round(radius)}px</output></span><Slider min={28} max={90} value={radius} onChange={setRadius} /><small>Larger circles sample more color and play louder.</small></label>}
        {sheet === 'mix' && motion !== 'off' && <label className="sizeControl"><span>Motion amount <output>{motionAmount}%</output></span><Slider value={motionAmount} onChange={value => { setMotionAmount(value); motionAmountRef.current = value / 100; }} /></label>}
      </div>
    </section>
    </div>

  </main>;
}
