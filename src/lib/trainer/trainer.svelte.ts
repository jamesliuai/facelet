/** Persistent trainer state: selections, learning status, per-case times, custom algorithms. */
import * as db from '../store/db';
import { SETS, type SetId, type TCase } from './sets';

export type Status = 'new' | 'learning' | 'learned';
export type Mode = 'random' | 'weighted' | 'recap' | 'recognize';

interface Data {
  set: SetId;
  mode: Mode;
  selected: Partial<Record<SetId, string[]>>;
  status: Record<string, Status>;
  times: Record<string, number[]>;
  /** All-time best per case (times keep only the most recent attempts). */
  bests: Record<string, number>;
  custom: Record<string, string>;
}

const KEEP = 200;

const DEFAULT: Data = {
  set: 'pll',
  mode: 'random',
  selected: {},
  status: {},
  times: {},
  bests: {},
  custom: {},
};

class Trainer {
  data: Data = $state(structuredClone(DEFAULT));
  loaded = $state(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  async load() {
    if (this.loaded) return;
    const saved = await db.kvGet<Data>('trainer');
    if (saved) this.data = { ...structuredClone(DEFAULT), ...saved, bests: saved.bests ?? {} };
    this.loaded = true;
  }

  save() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void db.kvSet('trainer', $state.snapshot(this.data)), 250);
  }

  /** Re-read from storage (after a backup import), dropping any pending save of the old data. */
  async reload() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.loaded = false;
    this.data = structuredClone(DEFAULT);
    await this.load();
  }

  selectedOf(set: SetId): Set<string> {
    const ids = this.data.selected[set];
    if (ids) return new Set(ids);
    // default: everything selected for small sets, the first group for large ones
    const s = SETS.find((x) => x.id === set)!;
    return new Set(s.cases.length <= 60 ? s.cases.map((c) => c.id) : s.cases.filter((c) => c.group === s.groups[0]).map((c) => c.id));
  }

  setSelected(set: SetId, ids: Iterable<string>) {
    this.data.selected[set] = [...ids];
    this.save();
  }

  toggle(set: SetId, id: string) {
    const cur = this.selectedOf(set);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    this.setSelected(set, cur);
  }

  status(id: string): Status {
    return this.data.status[id] ?? 'new';
  }

  setStatus(id: string, s: Status) {
    if (s === 'new') delete this.data.status[id];
    else this.data.status[id] = s;
    this.save();
  }

  record(id: string, ms: number) {
    const t = Math.round(ms);
    const arr = (this.data.times[id] ??= []);
    arr.push(t);
    if (arr.length > KEEP) arr.splice(0, arr.length - KEEP);
    if (t > 0 && !(this.data.bests[id] <= t)) this.data.bests[id] = t;
    this.save();
  }

  /** Throw away an attempt (a mis-stop): removes its time and fixes up the best. */
  discard(id: string, ms: number) {
    const arr = this.data.times[id];
    if (!arr) return;
    const i = arr.lastIndexOf(Math.round(ms));
    if (i < 0) return;
    arr.splice(i, 1);
    if (this.data.bests[id] === Math.round(ms)) {
      const rest = arr.filter((x) => x > 0);
      if (rest.length) this.data.bests[id] = rest.reduce((a, b) => Math.min(a, b));
      else delete this.data.bests[id];
    }
    this.save();
  }

  timesOf(id: string): number[] {
    return this.data.times[id] ?? [];
  }

  mean(id: string): number {
    const t = this.timesOf(id).filter((x) => x > 0).slice(-12);
    return t.length ? t.reduce((a, b) => a + b, 0) / t.length : NaN;
  }

  best(id: string): number {
    const b = this.data.bests?.[id];
    if (b != null) return b;
    let best = NaN;
    for (const x of this.timesOf(id)) if (x > 0 && !(best <= x)) best = x;
    return best;
  }

  mainAlg(c: TCase): string {
    return this.data.custom[c.id] ?? c.algs[0];
  }

  setCustom(id: string, alg: string | null) {
    if (alg) this.data.custom[id] = alg;
    else delete this.data.custom[id];
    this.save();
  }
}

export const trainer = new Trainer();
