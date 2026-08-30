export type Instrument = 'keys' | 'bass' | 'drums';

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
  transpose: number;
  complexity: number;
  space: number;
  keys: number;
  keysTone: number;
  keysSustain: number;
  bass: number;
  bassDepth: number;
  bassMovement: number;
  drums: number;
  drumPunch: number;
  drumDensity: number;
};

const C2 = 65.406391;
const PENTATONIC = [0, 2, 4, 7, 9];
const KEYS = [0, 2, 5, 7, 9];
const PROGRESSIONS = [[0, 7, 9, 5], [0, 9, 5, 7], [9, 5, 0, 7]];

function hz(semitones: number) {
  return C2 * Math.pow(2, semitones / 12);
}

export class ChordEngine {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private placements: Placement[] = [];
  private activeGains: GainNode[] = [];
  private activeOscillators: OscillatorNode[] = [];
  private step = 0;
  private variation = 0.5;
  private controls: MusicControls = {
    transpose: 0, complexity: 0.5, space: 0.55,
    keys: 0.78, keysTone: 0.62, keysSustain: 0.55,
    bass: 0.68, bassDepth: 0.7, bassMovement: 0.45,
    drums: 0.6, drumPunch: 0.7, drumDensity: 0.5,
  };

  setVariation(seed: number) {
    this.variation = seed;
    this.step = Math.floor(seed * 16);
    this.updateSpace();
  }

  configure(next: MusicControls) {
    this.controls = next;
    this.updateSpace();
  }

  private updateSpace() {
    if (this.delay) this.delay.delayTime.value = 0.22 + this.controls.space * 0.25 + this.variation * 0.04;
    if (this.feedback) this.feedback.gain.value = Math.min(0.4, this.controls.space * 0.38);
  }

  async unlock() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
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
      this.updateSpace();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    const silent = this.context.createBufferSource();
    silent.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    silent.connect(this.context.destination);
    silent.start();
  }

  async playPlacements(placements: Placement[]) {
    await this.unlock();
    const wasEmpty = this.placements.length === 0;
    this.placements = placements;
    if (wasEmpty && this.placements.length) this.pulse();
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

  private kick(volume: number) {
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
    osc.start(now);
    osc.stop(now + 0.28);
  }

  private noise(volume: number, bright: boolean, open = false) {
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
    source.start(now);
  }

  private snare(volume: number, saturation: number) {
    this.noise(volume * (0.78 + saturation * 0.35), false);
    this.tone(175 + saturation * 45, volume * 0.42, 0.13, 'triangle', 520, 0.004, 0.08);
  }

  pulse() {
    if (!this.placements.length) return;
    const key = KEYS[Math.floor(this.variation * KEYS.length) % KEYS.length] + this.controls.transpose;
    const progression = PROGRESSIONS[Math.floor(this.variation * PROGRESSIONS.length) % PROGRESSIONS.length];
    const root = progression[Math.floor(this.step / 8) % progression.length];
    const beat = this.step % 8;

    const keys = this.placements.filter((p) => p.instrument === 'keys');
    const bass = this.placements.filter((p) => p.instrument === 'bass');
    const drums = this.placements.filter((p) => p.instrument === 'drums');

    keys.forEach((placement, index) => {
      const degree = Math.min(4, Math.floor(placement.tone.hue / 72));
      const register = placement.tone.brightness > 0.66 ? 36 : placement.tone.brightness < 0.3 ? 24 : 31;
      const rest = this.controls.complexity < 0.35 && (this.step + index) % 2 === 1;
      if (!rest) {
        const note = key + PENTATONIC[degree] + register;
        const volume = 0.085 * placement.level * this.controls.keys / Math.sqrt(Math.max(1, keys.length));
        this.tone(hz(note), volume, 0.28 + this.controls.keysSustain * 0.72 + this.controls.space * 0.18,
          this.controls.keysTone > 0.72 ? 'sawtooth' : 'triangle',
          700 + this.controls.keysTone * 2600 + placement.tone.brightness * 900,
          0.012 + (1 - this.controls.keysTone) * 0.035, 0.4);
      }
    });

    const bassInterval = this.controls.bassMovement > 0.7 ? 1 : this.controls.bassMovement > 0.32 ? 2 : 4;
    if (beat % bassInterval === 0) {
      bass.forEach((placement) => {
        const colorOffset = PENTATONIC[Math.min(4, Math.floor(placement.tone.hue / 72))];
        const bassRegister = this.controls.bassDepth > 0.66 ? 0 : this.controls.bassDepth > 0.32 ? 7 : 12;
        const melodicOffset = this.controls.bassMovement > 0.58 ? colorOffset % 5 : 0;
        const note = key + root + melodicOffset + bassRegister;
        this.tone(hz(note), 0.12 * placement.level * this.controls.bass / Math.sqrt(Math.max(1, bass.length)),
          0.58, 'sine', 650 + placement.tone.texture * 350, 0.012, 0.08);
      });
    }

    drums.forEach((placement) => {
      const variation = Math.floor(placement.tone.hue / 120) % 3;
      const volume = placement.level * this.controls.drums;
      const brightness = placement.tone.brightness;

      if (brightness < 0.34) {
        const kickPatterns = [[0, 4], [0, 3, 4, 6], [0, 4, 7]];
        const pattern = this.controls.complexity < 0.35 ? [0, 4] : kickPatterns[variation];
        if (pattern.includes(beat)) this.kick((0.11 + this.controls.drumPunch * 0.14) * volume);
      } else if (brightness < 0.68) {
        const snarePatterns = [[2, 6], [2, 6, 7], [2, 5, 6]];
        const pattern = this.controls.complexity < 0.35 ? [2, 6] : snarePatterns[variation];
        if (pattern.includes(beat)) this.snare((0.05 + this.controls.drumPunch * 0.075) * volume, placement.tone.saturation);
      } else {
        const sparse = [1, 3, 5, 7];
        const dense = variation === 0 ? [0, 1, 2, 3, 4, 5, 6, 7]
          : variation === 1 ? [0, 1, 3, 4, 5, 7] : [1, 2, 3, 5, 6, 7];
        const pattern = placement.tone.texture * 0.45 + this.controls.drumDensity * 0.75 > 0.58 ? dense : sparse;
        if (pattern.includes(beat)) {
          const open = placement.tone.texture > 0.62 && beat === 7;
          this.noise((open ? 0.036 : 0.026) * volume, true, open);
        }
      }
    });
    this.step++;
  }

  stop(release = 0.12) {
    this.placements = [];
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
