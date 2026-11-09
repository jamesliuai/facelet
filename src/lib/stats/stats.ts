/**
 * Statistics with WCA semantics.
 *
 * - Singles are truncated to centiseconds (Regulation 9f1) when precision = 2.
 * - Averages and means are rounded to the nearest unit of precision.
 * - aoN trims ceil(N · trim%) from each end (csTimer/community default 5%:
 *   ao5 and ao12 trim 1, ao50 trims 3, ao100 trims 5). Too many DNFs → DNF.
 * - moN (mean) trims nothing; any DNF makes it DNF.
 */

export const DNF = Infinity;

export interface TimedSolve {
  time: number; // raw milliseconds
  penalty: number; // 0, 2000 (+2) or -1 (DNF)
}

export type Precision = 2 | 3;

export function solveValue(s: TimedSolve, precision: Precision = 2): number {
  if (s.penalty < 0) return DNF;
  const raw = precision === 2 ? Math.floor(s.time / 10) * 10 : s.time;
  return raw + s.penalty;
}

export function roundAvg(v: number, precision: Precision): number {
  if (!isFinite(v)) return v;
  return precision === 2 ? Math.round(v / 10) * 10 : Math.round(v);
}

/** Number of solves trimmed from each end of an average of n. */
export function trimCount(n: number, pct = 5): number {
  if (n < 3) return 0;
  let t = Math.ceil((n * pct) / 100 - 1e-9);
  if (2 * t >= n) t = Math.max(0, Math.ceil(n / 2) - 1);
  return t;
}

export interface AvgSpec {
  n: number;
  mean: boolean; // true = moN, no trimming
}

export function parseAvgSpec(s: string): AvgSpec | null {
  const m = /^(ao|mo)(\d+)$/.exec(s);
  if (!m) return null;
  return { n: parseInt(m[2], 10), mean: m[1] === 'mo' };
}

export const specLabel = (a: AvgSpec) => (a.mean ? 'mo' : 'ao') + a.n;

/** Average of exactly the given values (already solveValue'd). */
export function averageOf(values: number[], trim: number, precision: Precision): number {
  const n = values.length;
  if (n === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  let sum = 0;
  for (let i = trim; i < n - trim; i++) {
    if (!isFinite(sorted[i])) return DNF;
    sum += sorted[i];
  }
  return roundAvg(sum / (n - 2 * trim), precision);
}

/** Indices (within the window) of trimmed solves: the best `trim` and worst `trim`. */
export function trimmedIndices(values: number[], trim: number): Set<number> {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = new Set<number>();
  for (let k = 0; k < trim; k++) {
    out.add(order[k][1]);
    out.add(order[order.length - 1 - k][1]);
  }
  return out;
}

/** Standard deviation of the counting (untrimmed, finite) values. */
export function sigmaOf(values: number[], trim: number): number {
  const sorted = values.slice().sort((a, b) => a - b).slice(trim, values.length - trim).filter(isFinite);
  if (sorted.length < 2) return NaN;
  const m = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return Math.sqrt(sorted.reduce((a, b) => a + (b - m) * (b - m), 0) / sorted.length);
}

function lowerBound(arr: Float64Array, size: number, v: number): number {
  let lo = 0;
  let hi = size;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Rolling average for every index (NaN until enough solves).
 * Keeps a sorted window plus a running sum of its finite values, so each step
 * costs O(log n) to locate, a memmove to insert/remove, and O(trim) to drop the
 * extremes — instead of re-summing the whole window. Exact for integer ms.
 */
export function rolling(values: number[], spec: AvgSpec, pct: number, precision: Precision): Float64Array {
  const n = spec.n;
  const len = values.length;
  const out = new Float64Array(len).fill(NaN);
  if (len < n) return out;
  const trim = spec.mean ? 0 : trimCount(n, pct);
  const win = new Float64Array(n + 1);
  let size = 0;
  let finiteSum = 0;
  let dnfs = 0;
  const counted = n - 2 * trim;
  for (let i = 0; i < len; i++) {
    const v = values[i];
    let at = lowerBound(win, size, v);
    win.copyWithin(at + 1, at, size);
    win[at] = v;
    size++;
    if (isFinite(v)) finiteSum += v;
    else dnfs++;
    if (size > n) {
      const old = values[i - n];
      at = lowerBound(win, size, old);
      win.copyWithin(at, at + 1, size);
      size--;
      if (isFinite(old)) finiteSum -= old;
      else dnfs--;
    }
    if (size === n) {
      if (dnfs > trim) {
        out[i] = DNF;
        continue;
      }
      let sum = finiteSum;
      for (let k = 0; k < trim; k++) sum -= win[k];
      for (let k = n - trim; k < n; k++) if (isFinite(win[k])) sum -= win[k];
      out[i] = roundAvg(sum / counted, precision);
    }
  }
  return out;
}

/**
 * The slowest next single that would still set a new best for an average of n,
 * given the solves so far. Returns null when no best exists yet or nothing can
 * beat it, and Infinity when even a DNF would.
 */
export function neededForBest(values: number[], spec: AvgSpec, pct: number, precision: Precision, best: number): number | null {
  const n = spec.n;
  if (values.length < n || !Number.isFinite(best)) return null;
  const trim = spec.mean ? 0 : trimCount(n, pct);
  const base = values.slice(values.length - (n - 1));
  const unit = precision === 2 ? 10 : 1;
  const beats = (x: number) => averageOf([...base, x], trim, precision) < best;
  if (!beats(0)) return null;
  if (beats(DNF)) return Infinity;
  // averageOf is non-decreasing in x: binary search the largest passing unit.
  let lo = 0;
  let hi = Math.ceil((best * n) / unit) + 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (beats(mid * unit)) lo = mid;
    else hi = mid - 1;
  }
  return lo * unit;
}

export interface AvgStat {
  spec: AvgSpec;
  current: number; // NaN if not enough solves
  best: number;
  bestIndex: number; // index of the last solve of the best window
}

export interface SessionStats {
  count: number;
  dnf: number;
  mean: number; // of non-DNF solves
  sd: number;
  best: number;
  bestIndex: number;
  worst: number;
  worstIndex: number;
  sessionAvg: number; // trimmed average of the whole session
  avgs: AvgStat[];
}

export function bestOf(arr: ArrayLike<number>): [number, number] {
  let best = NaN;
  let idx = -1;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (Number.isNaN(v)) continue;
    if (idx < 0 || v < best) {
      best = v;
      idx = i;
    }
  }
  return [best, idx];
}

export function computeStats(values: number[], specs: AvgSpec[], pct: number, precision: Precision): SessionStats {
  const count = values.length;
  let dnf = 0;
  let sum = 0;
  let sumSq = 0;
  let best = DNF;
  let bestIndex = -1;
  let worst = -1;
  let worstIndex = -1;
  for (let i = 0; i < count; i++) {
    const v = values[i];
    if (!isFinite(v)) {
      dnf++;
      continue;
    }
    sum += v;
    sumSq += v * v;
    if (v < best) {
      best = v;
      bestIndex = i;
    }
    if (v > worst) {
      worst = v;
      worstIndex = i;
    }
  }
  const ok = count - dnf;
  const mean = ok ? roundAvg(sum / ok, precision) : NaN;
  const sd = ok > 1 ? Math.sqrt(Math.max(0, sumSq / ok - (sum / ok) ** 2)) : NaN;
  const avgs = specs.map((spec) => {
    const r = rolling(values, spec, pct, precision);
    const [b, bi] = bestOf(r);
    return { spec, current: count >= spec.n ? r[count - 1] : NaN, best: b, bestIndex: bi };
  });
  const sessionAvg = count >= 3 ? averageOf(values, trimCount(count, pct), precision) : NaN;
  return {
    count,
    dnf,
    mean,
    sd,
    best: bestIndex >= 0 ? best : NaN,
    bestIndex,
    worst: worstIndex >= 0 ? worst : NaN,
    worstIndex,
    sessionAvg,
    avgs,
  };
}
