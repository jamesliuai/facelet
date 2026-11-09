/** Shared coordinate helpers: Lehmer codes, combinations, binomials. */

export const FACT: number[] = (() => {
  const f = [1];
  for (let i = 1; i <= 13; i++) f[i] = f[i - 1] * i;
  return f;
})();

export const BINOM: number[][] = (() => {
  const c: number[][] = [];
  for (let n = 0; n <= 24; n++) {
    c[n] = [];
    for (let k = 0; k <= 24; k++) {
      c[n][k] = k === 0 ? 1 : n === 0 ? 0 : c[n - 1][k - 1] + (c[n - 1][k] ?? 0);
    }
  }
  return c;
})();

export function binom(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0;
  return BINOM[n][k];
}

/** Lehmer index of p[0..n-1] (a permutation of n distinct values). */
export function permToIndex(p: ArrayLike<number>, n = p.length, off = 0): number {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    let c = 0;
    const v = p[off + i];
    for (let j = i + 1; j < n; j++) if (p[off + j] < v) c++;
    idx = idx * (n - i) + c;
  }
  return idx;
}

export function indexToPerm(idx: number, n: number): number[] {
  const d = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    d[i] = idx % (n - i);
    idx = Math.floor(idx / (n - i));
  }
  const avail: number[] = [];
  for (let i = 0; i < n; i++) avail.push(i);
  const p = new Array<number>(n);
  for (let i = 0; i < n; i++) p[i] = avail.splice(d[i], 1)[0];
  return p;
}

/** Index of an even permutation of n elements in [0, n!/2). */
export function evenPermToIndex(p: ArrayLike<number>, n = p.length): number {
  return permToIndex(p, n) >> 1;
}

export function indexToEvenPerm(idx: number, n: number): number[] {
  let p = indexToPerm(idx * 2, n);
  if (parityOf(p)) p = indexToPerm(idx * 2 + 1, n);
  return p;
}

export function parityOf(p: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) s ^= 1;
  return s;
}

/** Combination index of the set bits in mask (n bits, k set), colex order. */
export function combToIndex(chosen: ArrayLike<boolean | number>, n: number): number {
  let idx = 0;
  let k = 0;
  for (let p = 0; p < n; p++) {
    if (chosen[p]) {
      k++;
      idx += binom(p, k);
    }
  }
  return idx;
}

export function indexToComb(idx: number, n: number, k: number): boolean[] {
  const chosen = new Array<boolean>(n).fill(false);
  for (let kk = k; kk >= 1; kk--) {
    let p = kk - 1;
    while (binom(p + 1, kk) <= idx) p++;
    chosen[p] = true;
    idx -= binom(p, kk);
  }
  return chosen;
}

/** BFS distance table over a coordinate space. neighbor(i, m) returns the index after move m. */
export function bfsTable(size: number, start: number | number[], nMoves: number, neighbor: (i: number, m: number) => number): Int8Array {
  const t = new Int8Array(size).fill(-1);
  const starts = Array.isArray(start) ? start : [start];
  let filled = 0;
  for (const s of starts) {
    if (t[s] !== 0) filled++;
    t[s] = 0;
  }
  let depth = 0;
  while (filled < size) {
    let changed = 0;
    for (let i = 0; i < size; i++) {
      if (t[i] !== depth) continue;
      for (let m = 0; m < nMoves; m++) {
        const j = neighbor(i, m);
        if (t[j] === -1) {
          t[j] = depth + 1;
          changed++;
        }
      }
    }
    filled += changed;
    if (!changed) break;
    depth++;
  }
  return t;
}
