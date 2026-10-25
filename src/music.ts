import { composeImage, circleEvent, phraseStep, randomAt, scaleNote, type Composition } from './composition';

export type Instrument = 'keys' | 'guitar' | 'bass' | 'drums';

export type ImageTone = {
  hue: number;
  saturation: number;
  brightness: number;
  texture: number;
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
  guitar: number;
  guitarTone: number;
  guitarStrum: number;
  guitarDelay: number;
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

export class ChordEngine {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private recorderOutput: MediaStreamAudioDestinationNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private placements: Placement[] = [];
  private activeGains: GainNode[] = [];
  private activeOscillators: OscillatorNode[] = [];
  private step = 0;
  private keyHistory = new Map<number, { pitch: number; step: number }>();
  private composition: Composition = composeImage([]);
  private variation = 0.5;
  onPlacementHit: ((id: number) => void) | null = null;
  onPlaybackState: ((running: boolean) => void) | null = null;

  get running() { return this.context?.state === 'running'; }

  stepDuration(tempo: number) {
    return (30000 / tempo) * (1 + (this.step % 2 === 1 ? 1 : -1) * this.composition.swing);
  }
  private controls: MusicControls = {
    tempo: 96, transpose: 0, complexity: 0.5, space: 0.55,
    keys: 0.78, keysTone: 0.62, keysSustain: 0.55, keysDelay: 0.42,
    guitar: 0.7, guitarTone: 0.58, guitarStrum: 0.5, guitarDelay: 0.38,
    bass: 0.68, bassDepth: 0.7, bassMovement: 0.45, bassDelay: 0.12,
    drums: 0.6, drumPunch: 0.7, drumDensity: 0.5, drumDelay: 0.08, fourOnFloor: false,
  };

  setComposition(composition: Composition) {
    this.composition = composition;
    this.variation = randomAt(composition.seed, 3);
    this.step = 0;
    this.keyHistory.clear();
    this.updateSpace();
  }

  configure(next: MusicControls) {
    const spaceChanged = next.space !== this.controls.space;
    this.controls = next;
    if (spaceChanged) this.updateSpace();
  }

  private updateSpace() {
    if (this.delay) this.delay.delayTime.setTargetAtTime(0.22 + this.controls.space * 0.25 + this.variation * 0.04, this.context!.currentTime, 0.04);
    if (this.feedback) this.feedback.gain.setTargetAtTime(Math.min(0.4, this.controls.space * 0.38), this.context!.currentTime, 0.04);
  }

  async unlock() {
    if (!this.context || this.context.state === 'closed') {
      this.activeGains = [];
      this.activeOscillators = [];
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
    if (wasEmpty && this.placements.length) this.pulse();
  }

  updatePlacements(placements: Placement[]) {
    this.placements = placements;
    const ids = new Set(placements.map(placement => placement.id));
    this.keyHistory.forEach((_, id) => { if (!ids.has(id)) this.keyHistory.delete(id); });
  }

  private tone(frequency: number, volume: number, duration: number, type: OscillatorType,
    cutoff: number, attack = 0.015, send = 0.35) {
    if (!this.context || !this.output) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = frequency;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    if (this.delay && send > 0) {
      const sendGain = this.context.createGain();
      sendGain.gain.value = send;
      gain.connect(sendGain);
      sendGain.connect(this.delay);
    }
    osc.start(now);
    osc.stop(now + duration + 0.05);
    this.activeOscillators.push(osc);
    this.activeGains.push(gain);
    osc.onended = () => {
      this.activeOscillators = this.activeOscillators.filter((item) => item !== osc);
      this.activeGains = this.activeGains.filter((item) => item !== gain);
    };
  }

  private voice(frequency: number, volume: number, duration: number, brightness: number,
    attack: number, send: number, guitar = false) {
    const style = this.composition.style;
    const tone = Math.max(0, Math.min(1, brightness));
    if (style === 'glass') {
      // Inharmonic partial gives a struck bell a distinct metallic attack.
      this.tone(frequency, volume * 0.72, duration * 1.5, 'sine', 9000, 0.004, send * 0.65);
      this.tone(frequency * 2.756, volume * 0.18, 0.22, 'sine', 9000, 0.003, send * 0.35);
      this.tone(frequency * 4, volume * 0.1, 0.1, 'sine', 11000, 0.002, 0);
    } else if (style === 'ambient') {
      this.tone(frequency * 0.998, volume * 0.55, duration * 2.4, 'triangle', 500 + tone * 1000, 0.14, send);
      this.tone(frequency * 1.002, volume * 0.45, duration * 2.1, 'sine', 1600, 0.19, send);
    } else if (style === 'pulse') {
      this.tone(frequency, volume * 0.75, duration * 0.85, tone > 0.6 ? 'sawtooth' : 'square',
        450 + tone * 3200, 0.004, send * 0.3);
      this.tone(frequency / 2, volume * 0.25, duration * 0.6, 'sine', 600, 0.006, 0);
    } else {
      this.tone(frequency, volume * 0.8, duration, guitar ? 'sawtooth' : 'triangle',
        950 + tone * 3800, Math.min(attack, 0.008), send * 0.6);
      this.tone(frequency * 2, volume * 0.2, 0.08, 'sine', 7000, 0.002, 0);
    }
  }

  private kick(volume: number, send = 0) {
    if (!this.context || !this.output) return;
    const now = this.context.currentTime;
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
    const now = this.context.currentTime;
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
  }

  private snare(volume: number, saturation: number, send: number) {
    this.noise(volume * (0.78 + saturation * 0.35), false, false, send);
    this.tone(175 + saturation * 45, volume * 0.42, 0.13, 'triangle', 520, 0.004, send);
  }

  pulse(): Instrument[] {
    if (!this.placements.length || !this.running) return [];
    const hits = new Set<Instrument>();
    const composition = this.composition;
    const bar = Math.floor(this.step / 8);
    const root = composition.progression[bar % composition.progression.length];
    const beat = this.step % 8;
    const noteAt = (degree: number, register: number) =>
      hz(scaleNote(composition, degree) + this.controls.transpose + register);
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
      const melody = circleEvent(composition, placement.tone, this.step, this.controls.complexity, lane);
      const previous = this.keyHistory.get(placement.id);
      if (!melody.active || !this.controls.keys || keyAttacks >= 2 || (previous && this.step - previous.step < 2)) continue;
      const phrase = phraseStep(composition, placement.tone, this.step, this.controls.complexity);
      const degree = beat % 4 === 0 ? root + [0, 2, 4][Math.abs(phrase.degree) % 3] : phrase.degree;
      const register = placement.tone.brightness > 0.68 ? 36 : 24;
      const pitch = scaleNote(composition, degree) + this.controls.transpose + register;
      if (previous?.pitch === pitch && this.step - previous.step < 4) continue;
      hits.add('keys');
      this.onPlacementHit?.(placement.id);
      this.keyHistory.set(placement.id, { pitch, step: this.step });
      keyAttacks++;
      const secondsPerStep = 60 / this.controls.tempo / 2;
      const duration = Math.max(0.35, melody.hold * secondsPerStep * (0.7 + this.controls.keysSustain * 0.4));
      this.voice(hz(pitch), 0.085 * placement.level * this.controls.keys * melody.accent / Math.sqrt(Math.min(keys.length, 3)),
        duration, this.controls.keysTone * 0.55 + placement.tone.saturation * 0.45,
        0.02 + (1 - this.controls.keysTone) * 0.04, this.controls.keysDelay * 0.55);
    }

    let guitarAttacks = 0;
    for (let voice = 0; voice < guitars.length; voice++) {
      const lane = (voice + Math.floor(this.step / 2)) % guitars.length;
      const placement = guitars[lane];
      const event = circleEvent(composition, placement.tone, this.step, this.controls.guitarStrum, lane);
      if (!this.controls.guitar || !event.active || guitarAttacks >= 2) continue;
      guitarAttacks++;
      const phrase = phraseStep(composition, placement.tone, this.step + 3, this.controls.complexity);
      hits.add('guitar');
      this.onPlacementHit?.(placement.id);
      const base = root + (Math.abs(phrase.degree) % 3) * 2;
      const degrees = this.controls.guitarStrum > 0.58 ? [base, base + 2, base + 4] : [base];
      degrees.forEach((degree, index) => {
        const volume = 0.065 * placement.level * this.controls.guitar * event.accent / Math.sqrt(Math.min(guitars.length, 3) * degrees.length);
        this.voice(noteAt(degree, 24), volume, 0.28 + this.controls.guitarStrum * 0.4,
          this.controls.guitarTone * 0.55 + placement.tone.saturation * 0.45,
          0.006 + index * 0.014, this.controls.guitarDelay, true);
      });
    }

    let bassAttacks = 0;
    for (let voice = 0; voice < bass.length; voice++) {
      const lane = (voice + Math.floor(this.step / 2)) % bass.length;
      const placement = bass[lane];
      const event = circleEvent(composition, placement.tone, this.step, this.controls.bassMovement, lane);
      if (!this.controls.bass || !event.active || bassAttacks >= 1) continue;
      bassAttacks++;
      hits.add('bass');
      this.onPlacementHit?.(placement.id);
      const nextRoot = composition.progression[(bar + 1) % composition.progression.length];
      const colorDegree = [0, 2, 4][Math.min(2, Math.floor(placement.tone.hue / 120))];
      const degree = beat === 7 && this.controls.bassMovement > 0.58 ? nextRoot - 1
        : root + (beat === 0 && lane === 0 ? 0 : colorDegree);
      const register = this.controls.bassDepth > 0.66 ? 0 : 12;
      this.tone(noteAt(degree, register), 0.12 * placement.level * this.controls.bass * event.accent,
        composition.style === 'pulse' ? 0.2 : beat % 4 === 0 ? 0.62 : 0.38,
        composition.style === 'pulse' ? 'triangle' : 'sine', 350 + placement.tone.texture * 400 + composition.energy * 600, 0.012, this.controls.bassDelay);
    }

    drums.forEach((placement) => {
      const variation = Math.floor(randomAt(composition.seed, Math.floor(placement.tone.hue) + 70) * 3);
      const fill = bar % 4 === 3 && beat >= 6 && this.controls.complexity > 0.45;
      const volume = placement.level * this.controls.drums / Math.sqrt(Math.max(1, drums.length));
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
          this.onPlacementHit?.(placement.id);
          this.kick((0.11 + this.controls.drumPunch * 0.14) * volume, this.controls.drumDelay);
        }
      } else if (brightness < 0.68) {
        const snarePatterns = [[2, 6], [2, 6, 7], [2, 5, 6]];
        const pattern = this.controls.complexity < 0.35 ? [2, 6] : snarePatterns[variation];
        if (pattern.includes(beat) || (fill && composition.energy > 0.45)) {
          hits.add('drums');
          this.onPlacementHit?.(placement.id);
          this.snare((0.05 + this.controls.drumPunch * 0.075) * volume,
            placement.tone.saturation, this.controls.drumDelay);
        }
      } else {
        const sparse = [1, 3, 5, 7];
        const dense = variation === 0 ? [0, 1, 2, 3, 4, 5, 6, 7]
          : variation === 1 ? [0, 1, 3, 4, 5, 7] : [1, 2, 3, 5, 6, 7];
        const pattern = placement.tone.texture * 0.35 + this.controls.drumDensity * 0.45 + composition.energy * 0.35 > 0.58 ? dense : sparse;
        if (pattern.includes(beat)) {
          hits.add('drums');
          this.onPlacementHit?.(placement.id);
          const open = placement.tone.texture > 0.62 && beat === 7;
          this.noise((open ? 0.036 : beat % 2 === 0 ? 0.026 : 0.017) * volume, true, open, this.controls.drumDelay);
        }
      }
    });
    this.step++;
    return [...hits];
  }

  stop(release = 0.12) {
    this.placements = [];
    this.keyHistory.clear();
    if (!this.context) return;
    const now = this.context.currentTime;
    this.activeGains.forEach((gain) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.025);
    });
    const oscillators = [...this.activeOscillators];
    this.activeOscillators = [];
    this.activeGains = [];
    window.setTimeout(() => oscillators.forEach((osc) => {
      try { osc.stop(); } catch {}
    }), release * 1000 + 70);
  }
}
