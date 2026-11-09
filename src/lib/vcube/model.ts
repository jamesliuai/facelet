/**
 * Cubie model for the virtual cube: integer positions (doubled coordinates
 * in -(N-1)..N-1) and integer rotation matrices. Moves use the same
 * convention as the sticker simulator: q quarter turns clockwise seen from
 * the positive end of the axis (R, U, F directions).
 */
import type { Move } from '../cube/alg';

export interface Sticker {
  /** outward normal in the cubie's local (solved) frame */
  n: [number, number, number];
  /** face index U R F D L B */
  face: number;
}

export interface Cubie {
  home: [number, number, number];
  pos: [number, number, number];
  rot: number[]; // 3×3 row-major
  stickers: Sticker[];
}

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** One clockwise quarter turn about +axis, as row-major 3×3. */
const QR: number[][] = [
  [1, 0, 0, 0, 0, 1, 0, -1, 0], // x: (x, z, -y)
  [0, 0, -1, 0, 1, 0, 1, 0, 0], // y: (-z, y, x)
  [0, 1, 0, -1, 0, 0, 0, 0, 1], // z: (y, -x, z)
];

function m3mul(a: number[], b: number[]): number[] {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
function m3v(a: number[], v: number[]): [number, number, number] {
  return [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]];
}

const FACE_NORMALS: [number, number, number][] = [
  [0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1],
];

export function faceOfNormal(n: number[]): number {
  for (let f = 0; f < 6; f++) {
    const fn = FACE_NORMALS[f];
    if (fn[0] === Math.round(n[0]) && fn[1] === Math.round(n[1]) && fn[2] === Math.round(n[2])) return f;
  }
  return -1;
}

export class CubeModel {
  readonly n: number;
  cubies: Cubie[] = [];

  constructor(n: number) {
    this.n = n;
    this.reset();
  }

  reset() {
    const n = this.n;
    this.cubies = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          const p: [number, number, number] = [2 * i - (n - 1), 2 * j - (n - 1), 2 * k - (n - 1)];
          const stickers: Sticker[] = [];
          if (j === n - 1) stickers.push({ n: [0, 1, 0], face: 0 });
          if (i === n - 1) stickers.push({ n: [1, 0, 0], face: 1 });
          if (k === n - 1) stickers.push({ n: [0, 0, 1], face: 2 });
          if (j === 0) stickers.push({ n: [0, -1, 0], face: 3 });
          if (i === 0) stickers.push({ n: [-1, 0, 0], face: 4 });
          if (k === 0) stickers.push({ n: [0, 0, -1], face: 5 });
          if (!stickers.length) continue; // hidden core
          this.cubies.push({ home: [...p], pos: p, rot: I3.slice(), stickers });
        }
      }
    }
  }

  layerOf(c: Cubie, axis: number): number {
    return (c.pos[axis] + this.n - 1) / 2;
  }

  inMove(c: Cubie, m: Move): boolean {
    const l = this.layerOf(c, m.axis);
    return l >= m.lo && l <= m.hi;
  }

  apply(m: Move) {
    let R = I3;
    for (let k = 0; k < m.q; k++) R = m3mul(QR[m.axis], R);
    for (const c of this.cubies) {
      if (!this.inMove(c, m)) continue;
      c.pos = m3v(R, c.pos);
      c.rot = m3mul(R, c.rot);
    }
  }

  /** Every face shows a single colour (any orientation). */
  isSolved(): boolean {
    const seen = new Map<number, number>();
    for (const c of this.cubies) {
      for (const s of c.stickers) {
        const w = faceOfNormal(m3v(c.rot, s.n));
        const prev = seen.get(w);
        if (prev === undefined) seen.set(w, s.face);
        else if (prev !== s.face) return false;
      }
    }
    return true;
  }

  /** Start from sticker colours in the same order as StickerCube. */
  setFacelets(facelets: Uint8Array) {
    if (facelets.length !== 6 * this.n * this.n) throw new Error('Facelet count does not match cube size');
    this.reset();
    for (const c of this.cubies) {
      for (const s of c.stickers) s.face = facelets[this.faceletIndex(c.pos, s.face)];
    }
  }

  /** Sticker colours in StickerCube order (U R F D L B, row-major net), for previews. */
  facelets(): Uint8Array {
    const out = new Uint8Array(6 * this.n * this.n);
    for (const c of this.cubies) {
      for (const s of c.stickers) {
        const f = faceOfNormal(m3v(c.rot, s.n));
        out[this.faceletIndex(c.pos, f)] = s.face;
      }
    }
    return out;
  }

  private faceletIndex([x, y, z]: Cubie['pos'], f: number): number {
    const n = this.n;
    // Doubled cubie coordinates to net row and column, matching nxn.ts.
    const row = f === 0 ? z : f === 3 ? -z : -y;
    let col = x;
    if (f === 1) col = -z;
    else if (f === 4) col = z;
    else if (f === 5) col = -x;
    return f * n * n + ((row + n - 1) / 2) * n + (col + n - 1) / 2;
  }
}

export { QR, m3mul, m3v };
