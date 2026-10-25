import { useEffect, useRef, useState } from 'react';
import { sampleAverageColor } from './color';
import { composeImage } from './composition';
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

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const placementsRef = useRef<Placement[]>([]);
  const livePlacementsRef = useRef(new Map<number, Placement>());
  const beatRef = useRef<number | null>(null);
  const tempoRef = useRef(96);
  const beatProgressRef = useRef(0);
  const beatTimeRef = useRef(0);
  const pulseRef = useRef(0);
  const visualHitsRef = useRef<Record<Instrument, number>>({ keys: 0, guitar: 0, bass: 0, drums: 0 });
  const phaseRef = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    id: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean;
  } | null>(null);
  const nextIdRef = useRef(1);

  const sheetDragStart = useRef<number | null>(null);
  const [sheet, setSheet] = useState<Instrument | 'mix' | null>(null);
  const openSheet = (value: Instrument | 'mix') => {
    if (value !== 'mix') setSelected(value);
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
  const [controls, setControls] = useState({
    tempo: 96, pitch: 0, complexity: 52, space: 58,
    keys: 78, keysTone: 62, keysSustain: 55, keysDelay: 42,
    guitar: 70, guitarTone: 58, guitarStrum: 50, guitarDelay: 38,
    bass: 68, bassDepth: 70, bassMovement: 45, bassDelay: 12,
    drums: 60, drumPunch: 70, drumDensity: 50, drumDelay: 8,
  });

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
      const stream = canvas.captureStream(30);
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

    const drawnPlacements = [...placementsRef.current, ...livePlacementsRef.current.values()];

    drawnPlacements.forEach(placement => {
      refractPhoto(ctx, image, { x: dx, y: dy, width: dw, height: dh },
        placement.x * dpr, placement.y * dpr, placement.radius * dpr,
        visualHitsRef.current[placement.instrument]);
    });

    if (drawnPlacements.length) {
      const hue = drawnPlacements.reduce((sum, item) => sum + item.tone.hue, 0) / drawnPlacements.length;
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.045 + visualHitsRef.current.keys * 0.025;
      ctx.fillStyle = `hsl(${hue} 75% 48%)`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      drawnPlacements.forEach((placement) => {
        const strength = visualHitsRef.current[placement.instrument];
        if (strength < 0.015) return;
        const x = placement.x * dpr;
        const y = placement.y * dpr;
        const r = placement.radius * dpr;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();
        if (placement.instrument === 'keys') {
          const offset = (2 + placement.tone.texture * 6) * strength * dpr;
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.12 * strength;
          ctx.drawImage(image, dx + offset, dy, dw, dh);
          ctx.drawImage(image, dx - offset, dy, dw, dh);
        } else if (placement.instrument === 'guitar') {
          const offset = (1.5 + controls.guitarStrum * 0.035) * strength * dpr;
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.14 * strength;
          ctx.drawImage(image, dx + offset, dy - offset, dw, dh);
        } else if (placement.instrument === 'bass') {
          const scale = 1 + 0.035 * strength;
          ctx.globalAlpha = 0.48 * strength;
          ctx.translate(x, y);
          ctx.scale(scale, scale);
          ctx.translate(-x, -y);
          ctx.drawImage(image, dx, dy, dw, dh);
        } else {
          const shake = (4 + controls.drumPunch * 0.055) * strength * dpr;
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.2 * strength;
          ctx.drawImage(image, dx + (phaseRef.current % 2 ? shake : -shake), dy, dw, dh);
        }
        ctx.restore();
      });
    }

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
      drawGlassRim(ctx, x, y, r, config.color, dpr,
        visualHitsRef.current[placement.instrument]);
    });
  };

  const startBeat = () => {
    if (beatRef.current) return;
    beatTimeRef.current = performance.now();
    beatRef.current = window.setInterval(() => {
      const now = performance.now();
      if (!music.running) { beatTimeRef.current = now; return; }
      beatProgressRef.current += (now - beatTimeRef.current) / music.stepDuration(tempoRef.current);
      beatTimeRef.current = now;
      if (beatProgressRef.current < 1) return;
      // Keep phase between ticks without bursting missed notes after backgrounding.
      beatProgressRef.current %= 1;
      const hits = music.pulse();
      hits.forEach((instrument) => { visualHitsRef.current[instrument] = 1; });
      phaseRef.current = (phaseRef.current + 1) % 8;
      pulseRef.current = 1;
    }, 16);
  };

  const stopBeat = () => {
    if (beatRef.current) clearInterval(beatRef.current);
    beatRef.current = null;
    beatProgressRef.current = 0;
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
      keysDelay: controls.keysDelay / 100,
      guitar: controls.guitar / 100,
      guitarTone: controls.guitarTone / 100,
      guitarStrum: controls.guitarStrum / 100,
      guitarDelay: controls.guitarDelay / 100,
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
  }, [controls, fourOnFloor]);

  useEffect(() => {
    let frame = 0;
    const animate = () => {
      pulseRef.current *= 0.9;
      visualHitsRef.current.keys *= 0.88;
      visualHitsRef.current.guitar *= 0.82;
      visualHitsRef.current.bass *= 0.9;
      visualHitsRef.current.drums *= 0.76;
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
    const next = [...placementsRef.current, placement];
    placementsRef.current = next;
    setPlacements(next);
    await music.playPlacements(next);
    startBeat();
    pulseRef.current = 1;
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
    pulseRef.current = 1;
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
        beatTimeRef.current = performance.now();
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
      imageRef.current = image;
      // Analyze a fixed-size copy, independent of display size and device pixel ratio.
      const analysis = document.createElement('canvas');
      analysis.width = 64; analysis.height = 64;
      const context = analysis.getContext('2d', { willReadFrequently: true });
      if (context) {
        context.drawImage(image, 0, 0, 64, 64);
        const cells = [];
        for (let y = 8; y < 64; y += 16) for (let x = 8; x < 64; x += 16) {
          const cell = sampleAverageColor(context, x, y, 8);
          cells.push({ hue: cell.h, saturation: cell.s, brightness: cell.l, texture: cell.texture });
        }
        const composition = composeImage(cells);
        music.setComposition(composition);
        setImageStyle({ ambient: 'Soft atmosphere', glass: 'Glass bells', plucked: 'Plucked groove', pulse: 'Synth pulse' }[composition.style]);
        tempoRef.current = composition.tempo;
        beatProgressRef.current = 0;
        setControls(current => ({ ...current, tempo: composition.tempo }));
      }
      stopLive();
      updatePlacements([]);
      setHasImage(true);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };

  return <main className="app">
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
        <canvas ref={canvasRef} className={`canvas placementCanvas ${mode === 'live' ? 'liveCanvas' : ''}`}
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
            ['keysSustain', 'Sustain', 'Controls how long keyboard notes ring.'], ['keysDelay', 'Delay', 'Sends keyboard notes into the echo.']] as const).map(([key, label, help]) =>
            <label key={key}><span>{label} <output>{controls[key]}%</output></span><small>{help}</small>
              <Slider value={controls[key]} onChange={(value) => setControl(key, value)} /></label>)}</div>}
        {sheet === 'guitar' && <div className="instrumentModule guitarModule"><strong>🎸 Guitar</strong>
          {([['guitar', 'Volume', 'Sets the level of every guitar circle.'], ['guitarTone', 'Tone', 'Moves from mellow plucks to brighter strings.'],
            ['guitarStrum', 'Strum', 'Controls chord size, rhythm and note length.'], ['guitarDelay', 'Delay', 'Sends guitar plucks into the echo.']] as const).map(([key, label, help]) =>
            <label key={key}><span>{label} <output>{controls[key]}%</output></span><small>{help}</small>
              <Slider value={controls[key]} onChange={(value) => setControl(key, value)} /></label>)}</div>}
        {sheet === 'bass' && <div className="instrumentModule bassModule"><strong>🎸 Bass</strong>
          {([['bass', 'Volume', 'Sets the level of every bass circle.'], ['bassDepth', 'Depth', 'Pushes bass notes into a lower register.'],
            ['bassMovement', 'Movement', 'Adds faster notes and melodic variation.'], ['bassDelay', 'Delay', 'Sends bass notes into the echo.']] as const).map(([key, label, help]) =>
            <label key={key}><span>{label} <output>{controls[key]}%</output></span><small>{help}</small>
              <Slider value={controls[key]} onChange={(value) => setControl(key, value)} /></label>)}</div>}
        {sheet === 'drums' && <div className="instrumentModule drumsModule"><strong>🥁 Percussion</strong>
          {([['drums', 'Volume', 'Sets the overall drum level.'], ['drumPunch', 'Punch', 'Strengthens kick impact and snare body.'],
            ['drumDensity', 'Density', 'Adds more subdivisions to bright percussion circles.'], ['drumDelay', 'Delay', 'Sends drum hits into the echo.']] as const).map(([key, label, help]) =>
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

        {sheet === 'mix' && <label className="sizeControl"><span>Circle size <output>{radius}px</output></span><Slider min={28} max={90} value={radius} onChange={setRadius} /><small>Larger circles sample more color and play louder.</small></label>}
      </div>
    </section>
    </div>

  </main>;
}
