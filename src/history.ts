/** Bounded undo/redo for committed board edits; animation frames are not edits. */
export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private limit: number;
  constructor(limit = 100) { this.limit = limit; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  record(before: T) {
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current: T): T | undefined {
    if (!this.past.length) return undefined;
    this.future.push(current);
    return this.past.pop();
  }
  redo(current: T): T | undefined {
    if (!this.future.length) return undefined;
    this.past.push(current);
    return this.future.pop();
  }
  clear() { this.past = []; this.future = []; }
}
