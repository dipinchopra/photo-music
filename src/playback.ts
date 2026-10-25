type RecoveryOptions = {
  visible: () => boolean;
  hasLoops: () => boolean;
  running: () => boolean;
  play: () => Promise<void>;
  startScheduler: () => void;
  stopScheduler: () => void;
  pauseAudio: () => void;
  setPaused: (paused: boolean) => void;
};

/** Audio hardware state and the note scheduler are separate parts of recovery. */
export class PlaybackRecovery {
  private epoch = 0;
  private disposed = false;
  private options: RecoveryOptions;
  constructor(options: RecoveryOptions) { this.options = options; }
  pause() {
    this.epoch++;
    this.options.stopScheduler();
    this.options.pauseAudio();
  }
  async resume() {
    const o = this.options;
    if (this.disposed || !o.visible() || !o.hasLoops()) return;
    const epoch = this.epoch;
    // Start the pump even if resume() needs a gesture or remains pending in Safari.
    // The pump waits for running audio and never schedules against a frozen clock.
    o.startScheduler();
    o.setPaused(!o.running());
    try {
      await o.play();
      if (this.disposed || epoch !== this.epoch || !o.visible() || !o.hasLoops()) return;
      o.startScheduler();
      o.setPaused(!o.running());
    } catch {
      if (!this.disposed && epoch === this.epoch && o.visible() && o.hasLoops()) o.setPaused(true);
    }
  }
  stateChanged(running: boolean) {
    const o = this.options;
    if (this.disposed || !o.visible() || !o.hasLoops()) return;
    if (running) o.startScheduler();
    o.setPaused(!running);
  }
  dispose() { this.disposed = true; this.epoch++; }
}
