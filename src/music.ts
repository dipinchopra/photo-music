export type ChordInfo = {
  id: string;
  name: string;
  brightness: number;
  texture: number;
  hue: number;
  saturation: number;
};

type MusicControls = {
  transpose: number;
  complexity: number;
  warmth: number;
  space: number;
};

const C3 = 130.8127825;
const PENTATONIC = [0, 2, 4, 7, 9];
const KEY_NAMES = ['C', 'D', 'F', 'G', 'A'];
const KEY_OFFSETS = [0, 2, 5, 7, 9];
const PROGRESSIONS = [
  [0, 7, 9, 5],
  [0, 9, 5, 7],
  [9, 5, 0, 7],
];

function frequency(semitonesFromC3: number) {
  return C3 * Math.pow(2, semitonesFromC3 / 12);
}

export function colorToChord(h: number, s: number, l: number, texture = 0): ChordInfo {
  const melodicDegree = Math.min(4, Math.floor((((h % 360) + 360) % 360) / 72));
  const register = l < 0.3 ? 0 : l < 0.68 ? 1 : 2;
  return {
    id: `${melodicDegree}:${register}:${Math.round(texture * 4)}`,
    name: `${KEY_NAMES[melodicDegree]}${register === 0 ? '↓' : register === 2 ? '↑' : ''}`,
    brightness: l,
    texture,
    hue: h,
    saturation: s,
  };
}

export class ChordEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private voices: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private touchScenes = new Map<number, ChordInfo>();
  private step = 0;
  private lastMelodyDegrees = new Map<number, number>();
  private variation = 0.5;
  private controls: MusicControls = { transpose: 0, complexity: 0.55, warmth: 0.65, space: 0.65 };

  setVariation(seed: number) {
    this.variation = seed;
    this.step = Math.floor(seed * 16);
    this.lastMelodyDegrees.clear();
    this.updateSpace();
  }

  configure(next: MusicControls) {
    this.controls = next;
    this.updateSpace();
  }

  private updateSpace() {
    if (this.feedback) this.feedback.gain.value = Math.min(0.42, this.controls.space * 0.4);
    if (this.delay) this.delay.delayTime.value = 0.22 + this.controls.space * 0.24 + this.variation * 0.035;
  }

  async unlock() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.delay = this.context.createDelay(1);
      this.feedback = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();
      this.master.gain.value = 0.72;
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.02;
      compressor.release.value = 0.3;
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(compressor);
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
      this.updateSpace();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    const source = this.context.createBufferSource();
    source.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    source.connect(this.context.destination);
    source.start(0);
  }

  async playTouches(touches: Array<{ id: number; scene: ChordInfo }>) {
    await this.unlock();
    if (!this.context || !this.master) return;
    const wasSilent = this.touchScenes.size === 0;
    this.touchScenes = new Map(touches.map(({ id, scene }) => [id, scene]));
    const activeIds = new Set(touches.map(({ id }) => id));
    this.lastMelodyDegrees.forEach((_, id) => {
      if (!activeIds.has(id)) this.lastMelodyDegrees.delete(id);
    });
    if (wasSilent) this.pulse();
  }

  removeTouch(id: number) {
    this.touchScenes.delete(id);
    this.lastMelodyDegrees.delete(id);
  }

  private triggerVoice(noteFrequency: number, volume: number, duration: number,
    type: OscillatorType, cutoff: number, attack = 0.02) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(noteFrequency, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.value = 0.35;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    if (this.delay && this.controls.space > 0.04) gain.connect(this.delay);
    osc.start(now);
    osc.stop(now + duration + 0.06);
    this.voices.push(osc);
    this.gains.push(gain);
    osc.onended = () => {
      this.voices = this.voices.filter((voice) => voice !== osc);
      this.gains = this.gains.filter((voiceGain) => voiceGain !== gain);
    };
  }

  pulse() {
    if (!this.touchScenes.size) return;
    const scenes = [...this.touchScenes.entries()];
    const keyIndex = Math.floor(this.variation * KEY_OFFSETS.length) % KEY_OFFSETS.length;
    const key = KEY_OFFSETS[keyIndex] + this.controls.transpose;
    const progression = PROGRESSIONS[Math.floor(this.variation * PROGRESSIONS.length) % PROGRESSIONS.length];
    const chordRoot = progression[Math.floor(this.step / 8) % progression.length];
    const chordPosition = this.step % 8;
    const warmth = this.controls.warmth;

    if (chordPosition === 0) {
      const third = chordRoot === 9 ? 3 : 4;
      [0, third, 7, 12].forEach((interval, index) => {
        this.triggerVoice(frequency(key + chordRoot + interval), 0.025 - index * 0.0025,
          2.2 + this.controls.space * 1.4, 'sine', 1000 + warmth * 900, 0.18);
      });
    }

    if (chordPosition % 4 === 0) {
      this.triggerVoice(frequency(key + chordRoot - 12), 0.065, 0.75,
        warmth > 0.45 ? 'triangle' : 'sine', 620, 0.025);
    }

    const shouldRest = this.controls.complexity < 0.28 && chordPosition % 2 === 1;
    if (!shouldRest) {
      const voiceVolume = 0.085 / Math.sqrt(scenes.length);
      scenes.forEach(([id, scene], voiceIndex) => {
        const imageTarget = Math.min(4, Math.floor((((scene.hue % 360) + 360) % 360) / 72));
        const previous = this.lastMelodyDegrees.get(id) ?? imageTarget;
        const maxMove = this.controls.complexity > 0.72 ? 2 : 1;
        const degree = previous + Math.max(-maxMove, Math.min(maxMove, imageTarget - previous));
        this.lastMelodyDegrees.set(id, degree);
        const octave = scene.brightness < 0.28 ? 7 : scene.brightness > 0.72 ? 24 : 12;
        const note = key + PENTATONIC[degree] + octave;
        const cutoff = 900 + (1 - warmth) * 2100 + scene.brightness * 900 + scene.texture * 650;
        const duration = 0.44 + warmth * 0.3 + this.controls.space * 0.22 + voiceIndex * 0.025;
        this.triggerVoice(frequency(note), voiceVolume + scene.saturation * 0.012, duration,
          warmth > 0.38 ? 'triangle' : 'sine', cutoff, 0.02 + warmth * 0.025);
      });
    }
    this.step++;
  }

  stop(release = 0.2) {
    this.touchScenes.clear();
    this.lastMelodyDegrees.clear();
    this.step = Math.floor(this.variation * 16);
    if (!this.context) return;
    const now = this.context.currentTime;
    this.gains.forEach((gain) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, Math.max(0.015, release / 4));
    });
    const oldVoices = [...this.voices];
    this.voices = [];
    this.gains = [];
    window.setTimeout(() => oldVoices.forEach((osc) => {
      try { osc.stop(); } catch {}
    }), release * 1000 + 80);
  }
}
