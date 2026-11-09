/**
 * Incremental statistics for one session. Appending a solve costs
 * O(k log k) per tracked average; anything else triggers a full rebuild.
 */
import {
  type AvgSpec, type Precision, DNF, averageOf, parseAvgSpec, roundAvg, specLabel, trimCount, rolling,
} from './stats';

export interface Series {
  spec: AvgSpec;
  label: string;
  values: number[]; // NaN until enough solves
  best: number;
  bestIndex: number;
}

export interface PbEvent {
  label: string; // 'single' | 'ao5' ...
  value: number;
  previous: number;
}

export class StatsEngine {
  values: number[] = [];
  series: Series[] = [];
  count = 0;
  dnf = 0;
  sum = 0;
  sumSq = 0;
  best = NaN;
  bestIndex = -1;
  worst = NaN;
  worstIndex = -1;
  private pct = 5;
  private precision: Precision = 2;

  configure(labels: string[], pct: number, precision: Precision) {
    this.pct = pct;
    this.precision = precision;
    const uniq = [...new Set(labels)];
    this.series = uniq
      .map((l) => parseAvgSpec(l))
      .filter((s): s is AvgSpec => !!s && s.n >= 3)
      .map((spec) => ({ spec, label: specLabel(spec), values: [], best: NaN, bestIndex: -1 }));
  }

  reset(values: number[]) {
    this.values = values.slice();
    this.count = values.length;
    this.dnf = 0;
    this.sum = 0;
    this.sumSq = 0;
    this.best = NaN;
    this.bestIndex = -1;
    this.worst = NaN;
    this.worstIndex = -1;
    values.forEach((v, i) => this.single(v, i));
    for (const s of this.series) {
      s.values = Array.from(rolling(values, s.spec, this.pct, this.precision));
      s.best = NaN;
      s.bestIndex = -1;
      s.values.forEach((v, i) => {
        if (!Number.isNaN(v) && (s.bestIndex < 0 || v < s.best)) {
          s.best = v;
          s.bestIndex = i;
        }
      });
    }
  }

  private single(v: number, i: number) {
    if (!isFinite(v)) {
      this.dnf++;
      return;
    }
    this.sum += v;
    this.sumSq += v * v;
    if (this.bestIndex < 0 || v < this.best) {
      this.best = v;
      this.bestIndex = i;
    }
    if (this.worstIndex < 0 || v > this.worst) {
      this.worst = v;
      this.worstIndex = i;
    }
  }

  /** Append a value; returns the PBs it set (only when it beats an existing record). */
  append(v: number): PbEvent[] {
    const pbs: PbEvent[] = [];
    const i = this.values.length;
    const prevBest = this.best;
    this.values.push(v);
    this.count++;
    this.single(v, i);
    if (isFinite(v) && this.bestIndex === i && !Number.isNaN(prevBest)) pbs.push({ label: 'single', value: v, previous: prevBest });
    for (const s of this.series) {
      const n = s.spec.n;
      let a = NaN;
      if (this.values.length >= n) {
        a = averageOf(this.values.slice(-n), s.spec.mean ? 0 : trimCount(n, this.pct), this.precision);
      }
      s.values.push(a);
      if (!Number.isNaN(a)) {
        if (s.bestIndex < 0 || a < s.best) {
          const prev = s.best;
          s.best = a;
          s.bestIndex = i;
          if (!Number.isNaN(prev) && isFinite(a)) pbs.push({ label: s.label, value: a, previous: prev });
        }
      }
    }
    return pbs;
  }

  get mean(): number {
    const ok = this.count - this.dnf;
    return ok ? roundAvg(this.sum / ok, this.precision) : NaN;
  }

  get sd(): number {
    const ok = this.count - this.dnf;
    if (ok < 2) return NaN;
    const m = this.sum / ok;
    return Math.sqrt(Math.max(0, this.sumSq / ok - m * m));
  }

  get sessionAverage(): number {
    if (this.count < 3) return NaN;
    return averageOf(this.values, trimCount(this.count, this.pct), this.precision);
  }

  seriesFor(label: string): Series | undefined {
    return this.series.find((s) => s.label === label);
  }

  current(label: string): number {
    const s = this.seriesFor(label);
    return s && s.values.length ? s.values[s.values.length - 1] : NaN;
  }
}

export { DNF };
