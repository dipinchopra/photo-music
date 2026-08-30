export type ChordInfo = {
  id: string;
  name: string;
  frequencies: number[];
  brightness: number;
  texture: number;
};

type MusicControls = {
  transpose: number;
  complexity: number;
  warmth: number;
  space: number;
};

const C4 = 261.625565;
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const TRIADS = [
  [0, 4, 7],   // I
  [0, 3, 7],   // ii
  [0, 3, 7],   // iii
  [0, 4, 7],   // IV
  [0, 4, 7],   // V
  [0, 3, 7],   // vi
  [0, 3, 6],   // vii°
];
const NAMES = ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°'];

function semitoneToFrequency(semitonesFromC4: number) {
  return C4 * Math.pow(2, semitonesFromC4 / 12);
}

export function colorToChord(h: number, s: number, l: number, texture = 0): ChordInfo {
  const degree = Math.min(6, Math.floor(((h % 360) / 360) * 7));
  const root = MAJOR_SCALE[degree];

  // Darker image areas play lower, brighter image areas higher.
  // Use four brightness bands so similarly hued areas can still sound distinct.
  const octaveBand = l < 0.22 ? -1 : l < 0.48 ? 0 : l < 0.74 ? 1 : 2;
  const octaveShift = (octaveBand - 1) * 12;
  const intervals = [...TRIADS[degree]];

  // Saturated colors add a seventh; very saturated colors add a high ninth.
  const colorRichness = s > 0.72 ? 2 : s > 0.42 ? 1 : 0;
  const textureRichness = texture > 0.62 ? 2 : texture > 0.32 ? 1 : 0;
  const richness = Math.max(colorRichness, textureRichness);
  if (richness >= 1) intervals.push(degree === 4 ? 10 : 11);
  if (richness >= 2) intervals.push(14);

  const octaveMark = octaveShift < 0 ? '↓' : octaveShift > 0 ? '↑' : '';

  return {
    id: `${degree}:${octaveBand}:${richness}`,
    name: `${NAMES[degree]}${octaveMark}`,
    frequencies: intervals.map((interval) => semitoneToFrequency(root + interval + octaveShift)),
    brightness: l,
    texture,
  };
}

export class ChordEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private voices: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private currentId = '';
  private scene: ChordInfo | null = null;
  private step = 0;
  private controls: MusicControls = { transpose: 0, complexity: 0.55, warmth: 0.65, space: 0.3 };

  configure(next: MusicControls) {
    this.controls = next;
    if (this.feedback) this.feedback.gain.value = Math.min(0.52, next.space * 0.48);
    if (this.delay) this.delay.delayTime.value = 0.16 + next.space * 0.32;
  }

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.delay = this.context.createDelay(1);
      this.feedback = this.context.createGain();
      this.master.gain.value = 0.72;
      this.delay.delayTime.value = 0.16 + this.controls.space * 0.32;
      this.feedback.gain.value = this.controls.space * 0.48;
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(this.master);
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  async play(chord: ChordInfo) {
    await this.unlock();
    if (!this.context || !this.master) return;
    if (chord.id === this.currentId && this.scene) return;

    const wasSilent = !this.scene;
    this.currentId = chord.id;
    this.scene = chord;
    if (wasSilent) this.pulse();
  }

  pulse() {
    if (!this.context || !this.master || !this.scene) return;
    const now = this.context.currentTime;
    const scene = this.scene;
    const smoothMotif = [0, 1, 2, 1, 0, 1, 3, 2];
    const livelyMotif = [0, 2, 1, 3, 2, 4, 1, 3];
    const activity = scene.texture * 0.55 + this.controls.complexity * 0.75;
    const motif = activity > 0.62 ? livelyMotif : smoothMotif;
    const index = motif[this.step % motif.length] % scene.frequencies.length;
    const octaveLeap = this.step % 8 === 7 && activity > 0.72 ? 2 : 1;
    const transposeRatio = Math.pow(2, this.controls.transpose / 12);
    const frequency = scene.frequencies[index] * octaveLeap * transposeRatio;
    const duration = 0.3 + (1 - activity) * 0.42;
    this.step++;

    const osc = this.context.createOscillator();
    const overtone = this.context.createOscillator();
    const gain = this.context.createGain();
    const overtoneGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    osc.type = this.controls.warmth > 0.48 ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(frequency, now);
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(frequency * 2, now);
    overtone.detune.setValueAtTime(scene.texture * 5, now);
    filter.type = 'lowpass';
    const warmthCut = (1 - this.controls.warmth) * 2600;
    filter.frequency.setValueAtTime(700 + warmthCut + scene.brightness * 1900 + scene.texture * 900, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    overtoneGain.gain.value = 0.012 + activity * 0.038 + (1 - this.controls.warmth) * 0.018;

    osc.connect(filter);
    overtone.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    if (this.delay && this.controls.space > 0.01) gain.connect(this.delay);
    osc.start(now);
    overtone.start(now);
    osc.stop(now + duration + 0.05);
    overtone.stop(now + duration + 0.05);
    this.voices.push(osc, overtone);
    this.gains.push(gain);
    osc.onended = () => {
      this.voices = this.voices.filter((voice) => voice !== osc && voice !== overtone);
      this.gains = this.gains.filter((voiceGain) => voiceGain !== gain);
    };
  }

  stop(release = 0.28) {
    this.scene = null;
    this.step = 0;
    if (!this.context || !this.voices.length) {
      this.currentId = '';
      return;
    }

    const now = this.context.currentTime;
    if (this.master) {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
    }
    this.gains.forEach((gain) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, Math.max(0.02, release / 4));
    });

    const oldVoices = [...this.voices];
    this.voices = [];
    this.gains = [];
    this.currentId = '';

    window.setTimeout(() => {
      oldVoices.forEach((osc) => {
        try { osc.stop(); } catch {}
      });
    }, release * 1000 + 120);
  }
}
