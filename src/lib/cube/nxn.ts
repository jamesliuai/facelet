/**
 * Sticker-level NxN cube simulator. Faces are stored U R F D L B, each N×N
 * row-major in the standard net orientation (identical to Kociemba facelets
 * for N = 3). Used for scramble images, the virtual cube's logic checks and
 * algorithm verification (slices and rotations included).
 */
import { parseAlg, resolve, type Move } from './alg';
import * as Cubie from './cubie';

export type Vec = [number, number, number];

interface Geometry {
  n: number;
  /** For each axis and layer: gather permutation for one clockwise quarter turn. */
  layerPerm: Int16Array[][];
}

const geoCache = new Map<number, Geometry>();

export function stickerPos(n: number, face: number, r: number, c: number): Vec {
  const a = 2 * c - (n - 1);
  const b = n - 1 - 2 * r;
  switch (face) {
    case 0: return [a, n, -b]; // U
    case 1: return [n, b, -a]; // R
    case 2: return [a, b, n]; // F
    case 3: return [a, -n, b]; // D
    case 4: return [-n, b, a]; // L
    default: return [-a, b, -n]; // B
  }
}

function stickerIndex(n: number, p: Vec): number {
  const [x, y, z] = p;
  let face: number;
  let r: number;
  let c: number;
  if (y === n) {
    face = 0; c = (x + n - 1) / 2; r = (z + n - 1) / 2;
  } else if (x === n) {
    face = 1; c = (n - 1 - z) / 2; r = (n - 1 - y) / 2;
  } else if (z === n) {
    face = 2; c = (x + n - 1) / 2; r = (n - 1 - y) / 2;
  } else if (y === -n) {
    face = 3; c = (x + n - 1) / 2; r = (n - 1 - z) / 2;
  } else if (x === -n) {
    face = 4; c = (z + n - 1) / 2; r = (n - 1 - y) / 2;
  } else {
    face = 5; c = (n - 1 - x) / 2; r = (n - 1 - y) / 2;
  }
  return face * n * n + r * n + c;
}

/** One clockwise quarter turn (as seen from +axis) of a point. */
export function rotateQ(p: Vec, axis: number): Vec {
  const [x, y, z] = p;
  if (axis === 0) return [x, z, -y];
  if (axis === 1) return [-z, y, x];
  return [y, -x, z];
}

function layerOf(n: number, p: Vec, axis: number): number {
  const v = p[axis];
  const c = v === n ? n - 1 : v === -n ? -(n - 1) : v;
  return (c + n - 1) / 2;
}

function geometry(n: number): Geometry {
  let g = geoCache.get(n);
  if (g) return g;
  const total = 6 * n * n;
  const pos: Vec[] = [];
  for (let f = 0; f < 6; f++) for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) pos.push(stickerPos(n, f, r, c));
  const layerPerm: Int16Array[][] = [];
  for (let axis = 0; axis < 3; axis++) {
    layerPerm[axis] = [];
    for (let l = 0; l < n; l++) {
      const src = new Int16Array(total);
      for (let i = 0; i < total; i++) src[i] = i;
      for (let i = 0; i < total; i++) {
        if (layerOf(n, pos[i], axis) !== l) continue;
        const j = stickerIndex(n, rotateQ(pos[i], axis));
        src[j] = i;
      }
      layerPerm[axis][l] = src;
    }
  }
  g = { n, layerPerm };
  geoCache.set(n, g);
  return g;
}

export class StickerCube {
  readonly n: number;
  s: Uint8Array;
  private g: Geometry;
  private tmp: Uint8Array;

  constructor(n = 3, state?: Uint8Array) {
    this.n = n;
    this.g = geometry(n);
    this.s = new Uint8Array(6 * n * n);
    this.tmp = new Uint8Array(6 * n * n);
    if (state) this.s.set(state);
    else for (let i = 0; i < this.s.length; i++) this.s[i] = Math.floor(i / (n * n));
  }

  clone(): StickerCube {
    return new StickerCube(this.n, this.s);
  }

  reset(): this {
    const nn = this.n * this.n;
    for (let i = 0; i < this.s.length; i++) this.s[i] = Math.floor(i / nn);
    return this;
  }

  move(m: Move): this {
    for (let l = m.lo; l <= m.hi; l++) {
      const src = this.g.layerPerm[m.axis][l];
      for (let k = 0; k < m.q; k++) {
        for (let i = 0; i < src.length; i++) this.tmp[i] = this.s[src[i]];
        const t = this.s;
        this.s = this.tmp;
        this.tmp = t;
      }
    }
    return this;
  }

  /** Apply an algorithm string. Throws AlgError on bad notation. */
  apply(alg: string): this {
    for (const t of parseAlg(alg)) {
      const m = resolve(t, this.n);
      if (m) this.move(m);
    }
    return this;
  }

  /** Every face a single colour (any orientation). */
  isSolved(): boolean {
    const nn = this.n * this.n;
    for (let f = 0; f < 6; f++) {
      const c = this.s[f * nn];
      for (let i = 1; i < nn; i++) if (this.s[f * nn + i] !== c) return false;
    }
    return true;
  }

  face(f: number): Uint8Array {
    const nn = this.n * this.n;
    return this.s.subarray(f * nn, f * nn + nn);
  }
}

// ---------------------------------------------------------------- 3x3 helpers

/** The 24 whole-cube rotations as algorithm strings. */
export const ROTATIONS: string[] = (() => {
  const seen = new Map<string, string>();
  const queue: string[] = [''];
  const key = (alg: string) => {
    const c = new StickerCube(3).apply(alg);
    return [4, 13, 22, 31, 40, 49].map((i) => c.s[i]).join('');
  };
  seen.set(key(''), '');
  while (queue.length) {
    const a = queue.shift()!;
    for (const r of ['x', 'y', 'z']) {
      const b = (a + ' ' + r).trim();
      const k = key(b);
      if (!seen.has(k)) {
        seen.set(k, b);
        queue.push(b);
      }
    }
  }
  return [...seen.values()];
})();

/** Rotate a 3x3 sticker cube so its centres are in standard position. */
export function normalize3(c: StickerCube): StickerCube {
  for (const r of ROTATIONS) {
    const d = c.clone().apply(r);
    if (d.s[4] === 0 && d.s[13] === 1 && d.s[22] === 2) return d;
  }
  return c;
}

/** Cubie state of a 3x3 sticker cube (after centre normalisation). */
export function toCubie(c: StickerCube): Cubie.Cubie | null {
  const d = normalize3(c);
  return Cubie.fromFacelets(Array.from(d.s));
}

/** Cubie state produced by any 3x3 algorithm (slices and rotations allowed). */
export function cubieFromAlg(alg: string): Cubie.Cubie | null {
  return toCubie(new StickerCube(3).apply(alg));
}
