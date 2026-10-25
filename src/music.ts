import { composeImage, circleEvent, phraseStep, randomAt, scaleNote, arpeggioDegree, type ArpMode, type Composition } from './composition';
import { SampleBank, PHOTO_PADS } from './pads';

export type Instrument = 'keys' | 'guitar' | 'bass' | 'drums';

export type ImageTone = {
  hue: number;
  saturation: number;
  brightness: number;
  texture: number;
  profile?: { contour: readonly number[]; activity: readonly number[] };
};

export type Placement = {
  id: number;
  x: number;
  y: number;
  radius: number;
  level: number;
  instrument: Instrument;
  tone: ImageTone;
};

type MusicControls = {
  tempo: number;
  transpose: number;
  complexity: number;
  space: number;
  keys: number;
  keysTone: number;
  keysSustain: number;
  keysDelay: number;
  keysArp: ArpMode;
  keysArpRate: number;
  guitar: number;
  guitarTone: number;
  guitarStrum: number;
  guitarDelay: number;
  guitarArp: ArpMode;
  guitarArpRate: number;
  bass: number;
  bassDepth: number;
  bassMovement: number;
  bassDelay: number;
  drums: number;
  drumPunch: number;
  drumDensity: number;
  drumDelay: number;
  fourOnFloor: boolean;
};

const C2 = 65.406391;

function hz(semitones: number) {
  return C2 * Math.pow(2, semitones / 12);
}

type TimbreBinding = { filter: BiquadFilterNode; colourGain: GainNode; cutoff: number; tone: ImageTone };

export class ChordEngine {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private recorderOutput: MediaStreamAudioDestinationNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private placements: Placement[] = [];
  private activeGains: GainNode[] = [];
  private activeSources: AudioScheduledSourceNode[] = [];
  private sourceStarts = new WeakMap<AudioScheduledSourceNode, number>();
  private step = 0;
  private soundingPlacement: Placement | null = null;
  private timbreBindings = new Map<number, Set<TimbreBinding>>();
  private nextStepTime: number | null = null;
  private scheduledTime: number | null = null;
  private hitTimers = new Set<number>();
  private samples = new SampleBank();
  private sampleVoices: { source: AudioBufferSourceNode; gain: GainNode; index: number; repeating: boolean; timer?: number }[] = [];
  private sampleLoops = new Map<number, { placement: Placement; everySteps: number; startStep: number }>();
  get sampleLoopIndices() { return [...this.sampleLoops.keys()]; }
  get hasSampleLoops() { return this.sampleLoops.size > 0; }
  onSampleHit: ((index: number) => void) | null = null;
  get samplesReady() { return this.samples.ready; }

  async prepareSamples(baseUrl: string) {
    // Create the graph synchronously on the gesture; decoding need not wait
    // for Safari's possibly pending resume promise.
    void this.unlock().catch(() => {});
    if (!this.context) throw new Error('Audio unavailable');
    await this.samples.load(this.context, baseUrl);
  }

  async playSample(index: number, placement: Placement, valid: () => boolean = () => true): Promise<boolean> {
    const buffer = this.samples.get(index);
    if (!buffer || !PHOTO_PADS[index]) return false;
    await this.unlock();
    if (!valid() || !this.running || !this.context || !this.output) return false;
    return this.startSample(index, placement, this.context.currentTime, false);
  }

  private startSample(index: number, placement: Placement, now: number, repeating: boolean) {
    const buffer = this.samples.get(index);
    if (!buffer || !this.context || !this.output) return false;
    // Bound rapid multi-finger playing without clipping existing loop voices.
    if (this.sampleVoices.length >= 20) {
      const oldest = this.sampleVoices.shift()!;
      oldest.gain.gain.setTargetAtTime(0.0001, now, 0.005);
      oldest.source.stop(now + 0.025);
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    const instrument = PHOTO_PADS[index].instrument;
    source.playbackRate.value = instrument === 'drums' ? 1 : Math.pow(2, this.controls.transpose / 12);
    filter.type = 'lowpass';
    filter.frequency.value = 1800 + placement.tone.brightness * 11000;
    const volume = this.controls[instrument];
    gain.gain.value = volume * (0.58 + placement.tone.saturation * 0.18);
    source.connect(filter); filter.connect(gain); gain.connect(this.output);
    const voice: (typeof this.sampleVoices)[number] = { source, gain, index, repeating };
    this.sampleVoices.push(voice);
    this.trackSource(source, gain, now, () => {
      filter.disconnect();
      if (voice.timer !== undefined) { window.clearTimeout(voice.timer); this.hitTimers.delete(voice.timer); }
      this.sampleVoices = this.sampleVoices.filter(item => item !== voice);
    });
    source.start(now);
    const wait = (now - this.context.currentTime) * 1000;
    if (wait < 5) this.onSampleHit?.(index);
    else {
      voice.timer = window.setTimeout(() => {
        this.hitTimers.delete(voice.timer!); voice.timer = undefined;
        this.onSampleHit?.(index);
      }, wait);
      this.hitTimers.add(voice.timer);
    }
    return true;
  }

  async toggleSampleLoop(index: number, placement: Placement, beats = 4, valid: () => boolean = () => true) {
    if (this.sampleLoops.has(index)) { this.removeSampleLoop(index); return false; }
    await this.unlock();
    if (!valid() || !this.running || !this.samples.get(index)) return false;
    // A second toggle may have arrived while Safari was resuming.
    if (this.sampleLoops.has(index)) { this.removeSampleLoop(index); return false; }
    this.sampleLoops.set(index, { placement, everySteps: Math.max(1, beats) * 2, startStep: Math.ceil(this.step / 2) * 2 });
    this.schedule();
    return true;
  }

  private removeSampleLoop(index: number) {
    this.sampleLoops.delete(index);
    const now = this.context?.currentTime ?? 0;
    this.sampleVoices.filter(voice => voice.index === index && voice.repeating).forEach(voice => {
      if (voice.timer !== undefined) { window.clearTimeout(voice.timer); this.hitTimers.delete(voice.timer); }
      voice.gain.gain.setTargetAtTime(0.0001, now, 0.015);
      try { voice.source.stop((this.sourceStarts.get(voice.source) ?? 0) >= now ? now : now + 0.08); } catch {}
    });
  }

  clearSampleLoops() {
    this.sampleLoopIndices.forEach(index => this.removeSampleLoop(index));
  }

  stopSamples() {
    this.clearSampleLoops();
    const now = this.context?.currentTime ?? 0;
    this.sampleVoices.forEach(({ source, gain }) => {
      gain.gain.setTargetAtTime(0.0001, now, 0.02);
      try { source.stop(now + 0.1); } catch {}
    });
    this.sampleVoices = [];
  }

  private get noteTime() { return this.scheduledTime ?? this.context!.currentTime; }

  private placementHit(id: number) {
    const wait = (this.noteTime - this.context!.currentTime) * 1000;
    if (wait < 5) { this.onPlacementHit?.(id); return; }
    const timer = window.setTimeout(() => {
      this.hitTimers.delete(timer);
      this.onPlacementHit?.(id);
    }, wait);
    this.hitTimers.add(timer);
  }

  schedule() {
    if (!this.running || (!this.placements.length && !this.hasSampleLoops)) { this.nextStepTime = null; return; }
    const now = this.context!.currentTime;
    // Never burst missed notes after a stalled tab or an audio interruption.
    if (this.nextStepTime === null || this.nextStepTime < now) this.nextStepTime = now + 0.02;
    while (this.nextStepTime < now + 0.1) {
      this.pulse(this.nextStepTime);
      this.nextStepTime += this.stepDuration(this.controls.tempo) / 1000;
    }
  }
  private keyHistory = new Map<number, { pitch: number; step: number }>();
  private composition: Composition = composeImage([]);
  private variation = 0.5;
  onPlacementHit: ((id: number) => void) | null = null;
  onPlaybackState: ((running: boolean) => void) | null = null;

  get running() { return this.context?.state === 'running'; }
  get playbackTime() { return this.context?.currentTime ?? 0; }

  async rebuildPlayback(placements: Placement[]) {
    const previous = this.context;
    this.stop(0.12, true);
    if (previous) {
      previous.onstatechange = null;
      // Never wait for the broken context's close promise to unlock a new one.
      try { void previous.close().catch(() => {}); } catch {}
    }
    this.context = null;
    await this.playPlacements(placements);
  }
  get needsScheduling() { return this.running && (this.nextStepTime === null || this.nextStepTime < this.context!.currentTime + 0.1); }

  stepDuration(tempo: number) {
    return (30000 / tempo) * (1 + (this.step % 2 === 1 ? 1 : -1) * this.composition.swing);
  }
  private controls: MusicControls = {
    tempo: 96, transpose: 0, complexity: 0.5, space: 0.55,
    keys: 0.78, keysTone: 0.62, keysSustain: 0.55, keysDelay: 0, keysArp: 'off', keysArpRate: 2,
    guitar: 0.7, guitarTone: 0.58, guitarStrum: 0.5, guitarDelay: 0, guitarArp: 'off', guitarArpRate: 2,
    bass: 0.68, bassDepth: 0.7, bassMovement: 0.45, bassDelay: 0,
    drums: 0.6, drumPunch: 0.7, drumDensity: 0.5, drumDelay: 0, fourOnFloor: true,
  };

  setComposition(composition: Composition) {
    this.composition = composition;
    this.variation = randomAt(composition.seed, 3);
    this.step = 0;
    this.nextStepTime = null;
    this.keyHistory.clear();
    this.updateSpace();
  }

  configure(next: Partial<MusicControls>) {
    const spaceChanged = next.space !== undefined && next.space !== this.controls.space;
    this.controls = { ...this.controls, ...next };
    if (spaceChanged) this.updateSpace();
  }

  private updateSpace() {
    if (this.delay) this.delay.delayTime.setTargetAtTime(0.22 + this.controls.space * 0.25 + this.variation * 0.04, this.context!.currentTime, 0.04);
    if (this.feedback) this.feedback.gain.setTargetAtTime(Math.min(0.4, this.controls.space * 0.38), this.context!.currentTime, 0.04);
  }

  async unlock() {
    if (!this.context || this.context.state === 'closed') {
      this.activeGains = [];
      this.activeSources = [];
      this.sampleVoices = [];
      this.timbreBindings.clear();
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.context.onstatechange = () => this.onPlaybackState?.(this.running);
      this.output = this.context.createGain();
      this.delay = this.context.createDelay(1);
      this.feedback = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();
      this.output.gain.value = 0.78;
      compressor.threshold.value = -16;
      compressor.ratio.value = 3;
      this.output.connect(compressor);
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(compressor);
      compressor.connect(this.context.destination);
      this.recorderOutput = this.context.createMediaStreamDestination();
      compressor.connect(this.recorderOutput);
      this.updateSpace();
    }
    // Safari uses 'interrupted' after screen lock as well as 'suspended'.
    if (this.context.state !== 'running') await this.context.resume();
    this.onPlaybackState?.(this.running);
    if (!this.running) return;
    const silent = this.context.createBufferSource();
    silent.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    silent.connect(this.context.destination);
    silent.start();
  }

  async recordingStream(): Promise<MediaStream> {
    await this.unlock();
    if (!this.recorderOutput) throw new Error('Audio recording unavailable');
    return this.recorderOutput.stream;
  }

  async playPlacements(placements: Placement[]) {
    const wasEmpty = this.placements.length === 0;
    this.updatePlacements(placements);
    await this.unlock();
    if (wasEmpty && (this.placements.length || this.hasSampleLoops)) this.schedule();
  }

  updatePlacements(placements: Placement[]) {
    this.placements = placements;
    const ids = new Set(placements.map(placement => placement.id));
    this.keyHistory.forEach((_, id) => { if (!ids.has(id)) this.keyHistory.delete(id); });
    if (this.context) placements.forEach(placement => {
      this.timbreBindings.get(placement.id)?.forEach(binding => {
        const colour = (tone: ImageTone) => 0.3 + tone.brightness * 1.1 + tone.saturation * 0.6;
        const ratio = colour(placement.tone) / colour(binding.tone);
        binding.filter.frequency.setTargetAtTime(Math.max(100, Math.min(16000, this.context!.sampleRate * 0.45, binding.cutoff * ratio)), this.context!.currentTime, 0.04);
        const level = (0.7 + placement.tone.brightness * 0.6) / (0.7 + binding.tone.brightness * 0.6);
        binding.colourGain.gain.setTargetAtTime(Math.max(0.6, Math.min(1.4, level)), this.context!.currentTime, 0.04);
      });
    });
  }

  private tone(frequency: number, volume: number, duration: number, type: OscillatorType,
    cutoff: number, attack = 0.015, send = 0) {
    if (!this.context || !this.output) return;
    // Short upper-partial attacks read as clicks on small speakers. Fade them
    // in gently and omit partials too close to the output's Nyquist frequency.
    if (frequency >= Math.min(14000, this.context.sampleRate * 0.45)) return;
    attack = Math.max(0.008, Math.min(attack, duration * 0.45));
    volume /= Math.sqrt(1 + Math.pow(frequency / 5500, 4));
    const now = this.noteTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const colourGain = this.context.createGain();
    colourGain.gain.value = 1;
    osc.type = type;
    osc.frequency.value = frequency;
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(cutoff, this.context.sampleRate * 0.45);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(colourGain);
    colourGain.connect(this.output);
    if (this.delay && send > 0) {
      const sendGain = this.context.createGain();
      sendGain.gain.value = send;
      colourGain.connect(sendGain);
      sendGain.connect(this.delay);
    }
    osc.start(now);
    osc.stop(now + duration + 0.05);
    const placement = this.soundingPlacement;
    const binding = placement ? { filter, colourGain, cutoff, tone: placement.tone } : null;
    if (placement && binding) {
      const bindings = this.timbreBindings.get(placement.id) ?? new Set<TimbreBinding>();
      bindings.add(binding);
      this.timbreBindings.set(placement.id, bindings);
    }
    this.trackSource(osc, gain, now, () => {
      filter.disconnect(); colourGain.disconnect();
      if (placement && binding) {
        const bindings = this.timbreBindings.get(placement.id);
        bindings?.delete(binding);
        if (!bindings?.size) this.timbreBindings.delete(placement.id);
      }
    });
  }

  private trackSource(source: AudioScheduledSourceNode, gain: GainNode, start: number, cleanup = () => {}) {
    this.sourceStarts.set(source, start);
    this.activeSources.push(source);
    this.activeGains.push(gain);
    source.onended = () => {
      cleanup();
      this.activeSources = this.activeSources.filter(item => item !== source);
      this.activeGains = this.activeGains.filter(item => item !== gain);
      source.disconnect();
      gain.disconnect();
    };
  }

  private voice(frequency: number, volume: number, duration: number, brightness: number,
    attack: number, send: number, guitar = false) {
    const style = this.composition.style;
    const tone = Math.max(0, Math.min(1, brightness));
    if (guitar) {
      // A distinct plucked voice retains its identity across image palettes.
      const cutoff = (style === 'ambient' ? 600 : 1200) + tone * 3800;
      this.tone(frequency, volume * 0.76, duration, tone > 0.7 ? 'sawtooth' : 'triangle', cutoff, 0.005, send);
      this.tone(frequency * 2, volume * 0.16, duration * 0.38, 'sine', cutoff * 1.5, 0.003, 0);
      this.tone(frequency * 3, volume * 0.08, 0.09, 'sine', cutoff * 2, 0.002, 0);
    } else if (style === 'glass') {
      // Inharmonic partial gives a struck bell a distinct metallic attack.
      this.tone(frequency, volume * 0.72, duration * 1.5, 'sine', 1600 + tone * 7400, 0.004, send * 0.65);
      this.tone(frequency * 2.756, volume * (0.06 + tone * 0.2), 0.22, 'sine', 9000, 0.003, send * 0.35);
      this.tone(frequency * 4, volume * (0.02 + tone * 0.08), 0.1, 'sine', 11000, 0.002, 0);
    } else if (style === 'ambient') {
      this.tone(frequency * 0.998, volume * 0.55, duration * 2.4, 'triangle', 400 + tone * 3000, 0.05 + (1 - tone) * 0.15, send);
      this.tone(frequency * 1.002, volume * 0.45, duration * 2.1, 'sine', 1600, 0.19, send);
    } else if (style === 'pulse') {
      this.tone(frequency, volume * 0.75, duration * 0.85, tone > 0.6 ? 'sawtooth' : 'square',
        450 + tone * 3200, 0.004, send * 0.3);
      this.tone(frequency / 2, volume * 0.25, duration * 0.6, 'sine', 600, 0.006, 0);
    } else {
      this.tone(frequency, volume * 0.8, duration, 'triangle',
        950 + tone * 3800, Math.min(attack, 0.008), send * 0.6);
      this.tone(frequency * 2, volume * 0.2, 0.08, 'sine', 7000, 0.002, 0);
    }
  }

  private kick(volume: number, send = 0) {
    if (!this.context || !this.output) return;
    const now = this.noteTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.15);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.27);
    osc.connect(gain);
    gain.connect(this.output);
    if (this.delay && send > 0) {
      const sendGain = this.context.createGain();
      sendGain.gain.value = send;
      gain.connect(sendGain);
      sendGain.connect(this.delay);
    }
    osc.start(now);
    osc.stop(now + 0.28);
    this.trackSource(osc, gain, now);
  }

  private noise(volume: number, bright: boolean, open = false, send = 0) {
    if (!this.context || !this.output) return;
    const duration = bright ? (open ? 0.24 : 0.055) : 0.16;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const now = this.noteTime;
    source.buffer = buffer;
    filter.type = bright ? 'highpass' : 'bandpass';
    filter.frequency.value = bright ? (open ? 5000 : 6800) : 1550;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    if (this.delay && send > 0) {
      const sendGain = this.context.createGain();
      sendGain.gain.value = send;
      gain.connect(sendGain);
      sendGain.connect(this.delay);
    }
    source.start(now);
    this.trackSource(source, gain, now);
  }

  private snare(volume: number, saturation: number, send: number) {
    this.noise(volume * (0.78 + saturation * 0.35), false, false, send);
    this.tone(175 + saturation * 45, volume * 0.42, 0.13, 'triangle', 520, 0.004, send);
  }

  pulse(atTime?: number): Instrument[] {
    if ((!this.placements.length && !this.hasSampleLoops) || !this.running) return [];
    this.scheduledTime = atTime ?? this.context!.currentTime;
    this.soundingPlacement = null;
    const hits = new Set<Instrument>();
    const composition = this.composition;
    const bar = Math.floor(this.step / 8);
    const root = composition.progression[bar % composition.progression.length];
    const beat = this.step % 8;
    const noteAt = (degree: number, register: number) =>
      hz(scaleNote(composition, degree) + this.controls.transpose + register);
    this.sampleLoops.forEach((loop, index) => {
      if (this.step >= loop.startStep && (this.step - loop.startStep) % loop.everySteps === 0) {
        this.startSample(index, loop.placement, this.scheduledTime!, true);
      }
    });
    const groups = (instrument: Instrument) => this.placements.filter(p => p.instrument === instrument);
    const keys = groups('keys'), guitars = groups('guitar'), bass = groups('bass'), drums = groups('drums');

    // Diatonic chords follow the image's mode; inversions keep the pad compact.
    if (keys.length && beat === 0 && this.controls.keys > 0 && composition.style === 'ambient' && bar % 2 === 0) {
      hits.add('keys');
      [root, root + 2, root + 4].forEach((degree, index) => {
        this.tone(noteAt(degree >= 7 ? degree - 7 : degree, 24),
          0.012 * this.controls.keys / (1 + index * 0.2),
          3.5 + this.controls.keysSustain * 2.5,
          'sine', 650 + this.controls.keysTone * 900, 0.45, this.controls.keysDelay);
      });
    }

    // Independent phrases, with at most two attacks per instrument on one tick.
    // Rotating priority keeps additional circles audible without a unison pile-up.
    let keyAttacks = 0;
    for (let voice = 0; voice < keys.length; voice++) {
      const lane = (voice + Math.floor(this.step / 2)) % keys.length;
      const placement = keys[lane];
      this.soundingPlacement = placement;
      const melody = circleEvent(composition, placement.tone, this.step, this.controls.complexity, lane, placement.radius);
      const previous = this.keyHistory.get(placement.id);
      const arpeggiating = this.controls.keysArp !== 'off';
      const active = arpeggiating ? this.step % this.controls.keysArpRate === 0 : melody.active;
      if (!active || !this.controls.keys || keyAttacks >= 2 || (!arpeggiating && previous && this.step - previous.step < 2)) continue;
      const phrase = phraseStep(composition, placement.tone, this.step, this.controls.complexity);
      const degree = arpeggiating
        ? arpeggioDegree(root, this.step, this.controls.keysArp, this.controls.keysArpRate, Math.floor(placement.tone.hue / 90) + lane)
        : beat % 4 === 0 ? root + [0, 2, 4][Math.abs(phrase.degree) % 3] : phrase.degree;
      const register = placement.tone.brightness > 0.68 ? 36 : 24;
      const pitch = scaleNote(composition, degree) + this.controls.transpose + register;
      if (!arpeggiating && previous?.pitch === pitch && this.step - previous.step < 4) continue;
      hits.add('keys');
      this.placementHit(placement.id);
      this.keyHistory.set(placement.id, { pitch, step: this.step });
      keyAttacks++;
      const secondsPerStep = 60 / this.controls.tempo / 2;
      const duration = arpeggiating ? secondsPerStep * this.controls.keysArpRate * (0.5 + this.controls.keysSustain * 0.35)
        : Math.max(0.35, melody.hold * secondsPerStep * (0.7 + this.controls.keysSustain * 0.4));
      this.voice(hz(pitch), 0.085 * placement.level * this.controls.keys * melody.accent / Math.sqrt(Math.min(keys.length, 3)),
        duration, this.controls.keysTone * 0.55 + placement.tone.saturation * 0.45,
        0.02 + (1 - this.controls.keysTone) * 0.04, this.controls.keysDelay * 0.55);
    }

    let guitarAttacks = 0;
    for (let voice = 0; voice < guitars.length; voice++) {
      const lane = (voice + Math.floor(this.step / 2)) % guitars.length;
      const placement = guitars[lane];
      this.soundingPlacement = placement;
      const event = circleEvent(composition, placement.tone, this.step, this.controls.complexity, lane, placement.radius);
      const arpeggiating = this.controls.guitarArp !== 'off';
      const active = arpeggiating ? this.step % this.controls.guitarArpRate === 0 : event.active;
      if (!this.controls.guitar || !active || guitarAttacks >= 2) continue;
      guitarAttacks++;
      const phrase = phraseStep(composition, placement.tone, this.step + 3, this.controls.complexity);
      hits.add('guitar');
      this.placementHit(placement.id);
      const base = root + (Math.abs(phrase.degree) % 3) * 2;
      const degrees = arpeggiating
        ? [arpeggioDegree(root, this.step, this.controls.guitarArp, this.controls.guitarArpRate, Math.floor(placement.tone.hue / 90) + lane)]
        : placement.radius > 65 ? [base, base + 2, base + 4] : [base];
      degrees.forEach((degree, index) => {
        const volume = 0.065 * placement.level * this.controls.guitar * event.accent / Math.sqrt(Math.min(guitars.length, 3) * degrees.length);
        const duration = arpeggiating ? 30 / this.controls.tempo * this.controls.guitarArpRate * 0.75
          : 0.28 + this.controls.guitarStrum * 0.4;
        this.voice(noteAt(degree, 24), volume, duration,
          this.controls.guitarTone * 0.55 + placement.tone.saturation * 0.45,
          0.006 + index * 0.014, this.controls.guitarDelay, true);
      });
    }

    let bassAttacks = 0;
    for (let voice = 0; voice < bass.length; voice++) {
      const lane = (voice + Math.floor(this.step / 2)) % bass.length;
      const placement = bass[lane];
      this.soundingPlacement = placement;
      const bassBeat = beat === 0 || beat === 4 || (this.controls.bassMovement > 0.32 && this.controls.complexity > 0.25 && (beat === 2 || beat === 6))
        || (this.controls.bassMovement > 0.75 && beat === 7 && bar % 4 === 3);
      if (!this.controls.bass || !bassBeat || bassAttacks >= 1) continue;
      bassAttacks++;
      hits.add('bass');
      this.placementHit(placement.id);
      const nextRoot = composition.progression[(bar + 1) % composition.progression.length];
      const contour = placement.tone.profile?.contour;
      const localLight = contour?.length ? contour[Math.floor(this.step / 2) % contour.length] : placement.tone.brightness;
      const colorDegree = [0, 2, 4][Math.min(2, Math.floor((placement.tone.hue / 360 * 0.4 + localLight * 0.6) * 3))];
      const degree = beat === 7 && this.controls.bassMovement > 0.58 ? nextRoot - 1
        : root + (beat === 0 && lane === 0 ? 0 : colorDegree);
      const register = this.controls.bassDepth > 0.66 ? 0 : 12;
      this.tone(noteAt(degree, register), 0.12 * placement.level * this.controls.bass * (beat % 4 === 0 ? 0.85 : 0.65),
        composition.style === 'pulse' ? 0.2 : beat % 4 === 0 ? 0.62 : 0.38,
        composition.style === 'pulse' ? 'triangle' : 'sine', 350 + placement.tone.texture * 400 + composition.energy * 600, 0.012, this.controls.bassDelay);
    }

    drums.forEach((placement) => {
      this.soundingPlacement = placement;
      const variation = Math.floor(randomAt(composition.seed, Math.floor(placement.tone.hue) + 70) * 3);
      const fill = bar % 4 === 3 && beat >= 6 && this.controls.complexity > 0.45;
      const detail = placement.tone.profile?.activity;
      const localAccent = detail?.length ? 0.65 + detail[beat % detail.length] * 0.35 : 1;
      const volume = placement.level * this.controls.drums * localAccent / Math.sqrt(Math.max(1, drums.length));
      const brightness = placement.tone.brightness;

      if (brightness < 0.34) {
        const kickPatterns = composition.style === 'ambient' ? [[0], [0, 6], [0, 4]]
          : composition.style === 'pulse' ? [[0, 2, 4, 6], [0, 2, 3, 4, 6], [0, 2, 4, 7]]
          : [[0, 4], [0, 3, 4, 6], [0, 4, 7]];
        const pattern = this.controls.fourOnFloor
          ? [0, 2, 4, 6]
          : this.controls.complexity < 0.35 ? [0, 4] : kickPatterns[variation];
        if (pattern.includes(beat)) {
          hits.add('drums');
          this.placementHit(placement.id);
          this.kick((0.11 + this.controls.drumPunch * 0.14) * volume, this.controls.drumDelay);
        }
      } else if (brightness < 0.68) {
        const snarePatterns = [[2, 6], [2, 6, 7], [2, 5, 6]];
        const pattern = this.controls.complexity < 0.35 ? [2, 6] : snarePatterns[variation];
        if (pattern.includes(beat) || (fill && composition.energy > 0.45)) {
          hits.add('drums');
          this.placementHit(placement.id);
          this.snare((0.05 + this.controls.drumPunch * 0.075) * volume,
            placement.tone.saturation, this.controls.drumDelay);
        }
      } else {
        const sparse = [1, 3, 5, 7];
        const dense = variation === 0 ? [0, 1, 2, 3, 4, 5, 6, 7]
          : variation === 1 ? [0, 1, 3, 4, 5, 7] : [1, 2, 3, 5, 6, 7];
        const pattern = placement.tone.texture * 0.35 + this.controls.drumDensity * 0.3 + composition.energy * 0.25 + this.controls.complexity * 0.35 > 0.58 ? dense : sparse;
        if (pattern.includes(beat)) {
          hits.add('drums');
          this.placementHit(placement.id);
          const open = placement.tone.texture > 0.62 && beat === 7;
          this.noise((open ? 0.036 : beat % 2 === 0 ? 0.026 : 0.017) * volume, true, open, this.controls.drumDelay);
        }
      }
    });
    this.step++;
    this.soundingPlacement = null;
    this.scheduledTime = null;
    return [...hits];
  }

  stop(release = 0.12, preserveSampleLoops = false) {
    if (preserveSampleLoops) this.sampleLoops.forEach(loop => { loop.startStep = this.step; });
    else this.sampleLoops.clear();
    this.sampleVoices = [];
    this.placements = [];
    this.timbreBindings.clear();
    this.soundingPlacement = null;
    this.nextStepTime = null;
    this.scheduledTime = null;
    this.hitTimers.forEach(timer => window.clearTimeout(timer));
    this.hitTimers.clear();
    this.keyHistory.clear();
    if (!this.context) return;
    const now = this.noteTime;
    this.activeGains.forEach((gain) => {
      if (typeof gain.gain.cancelAndHoldAtTime === 'function') gain.gain.cancelAndHoldAtTime(now);
      else gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, Math.max(0.01, release / 4));
    });
    const sources = [...this.activeSources];
    this.activeSources = [];
    this.activeGains = [];
    // Cancel future drum and melody attacks as well as releasing sounding notes.
    sources.forEach(source => {
      try { source.stop((this.sourceStarts.get(source) ?? 0) >= now ? now : now + Math.max(release, 0.025)); } catch {}
    });
  }
}
