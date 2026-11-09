/**
 * Small geometry kit for twisty puzzles described by sticker polygons in 3D.
 * Moves are rotations of every sticker on one side of a cutting plane; the
 * resulting sticker permutation is found by matching rotated centroids.
 */
export type V3 = [number, number, number];
export type V2 = [number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: V3): number => Math.sqrt(dot(a, a));
export const norm = (a: V3): V3 => mul(a, 1 / len(a));
export const centroid = (pts: V3[]): V3 => mul(pts.reduce(add, [0, 0, 0] as V3), 1 / pts.length);
export const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));

/** Rodrigues rotation of p about unit axis k by angle a (right-handed). */
export function rotate(p: V3, k: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kxp = cross(k, p);
  const kdp = dot(k, p);
  return [
    p[0] * c + kxp[0] * s + k[0] * kdp * (1 - c),
    p[1] * c + kxp[1] * s + k[1] * kdp * (1 - c),
    p[2] * c + kxp[2] * s + k[2] * kdp * (1 - c),
  ];
}

export interface StickerDef {
  face: number;
  poly: V3[];
  c: V3;
}

export interface CutMove {
  axis: V3; // unit
  /** stickers with centroid·axis > depth turn */
  depth: number;
  /** clockwise angle seen from outside along +axis */
  angle: number;
}

/**
 * Gather permutation for a move: next[j] = prev[perm[j]].
 * Throws if the rotation does not map stickers onto stickers.
 */
export function movePerm(stickers: StickerDef[], m: CutMove): Int16Array {
  const n = stickers.length;
  const perm = new Int16Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;
  for (let i = 0; i < n; i++) {
    const c = stickers[i].c;
    if (dot(c, m.axis) <= m.depth) continue;
    const r = rotate(c, m.axis, -m.angle);
    let best = -1;
    let bestD = 1e9;
    for (let j = 0; j < n; j++) {
      const d = len(sub(stickers[j].c, r));
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (bestD > 1e-3) throw new Error('movePerm: rotation does not map stickers');
    perm[best] = i;
  }
  return perm;
}

export function applyPerm(state: Uint8Array, perm: Int16Array, times = 1): Uint8Array {
  let s = state;
  for (let t = 0; t < times; t++) {
    const next = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) next[i] = s[perm[i]];
    s = next;
  }
  return s;
}

/** Split triangle (a, b, c) into n² small triangles (row-major from a). */
export function subdivideTriangle(a: V3, b: V3, c: V3, n: number): V3[][] {
  const P = (i: number, j: number): V3 => add(a, add(mul(sub(b, a), i / n), mul(sub(c, a), j / n)));
  const tris: V3[][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; i + j < n; j++) {
      tris.push([P(i, j), P(i + 1, j), P(i, j + 1)]);
      if (i + j < n - 1) tris.push([P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]);
    }
  }
  return tris;
}

/**
 * Affine map of a planar 3D polygon point set into 2D, given three reference
 * points in 3D and their 2D images.
 */
export function affine3to2(p: V3, a: V3, b: V3, c: V3, a2: V2, b2: V2, c2: V2): V2 {
  // Solve p = a + u (b - a) + v (c - a) in the plane, by least squares.
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const d = sub(p, a);
  const g11 = dot(e1, e1);
  const g12 = dot(e1, e2);
  const g22 = dot(e2, e2);
  const r1 = dot(d, e1);
  const r2 = dot(d, e2);
  const det = g11 * g22 - g12 * g12;
  const u = (r1 * g22 - r2 * g12) / det;
  const v = (r2 * g11 - r1 * g12) / det;
  return [a2[0] + u * (b2[0] - a2[0]) + v * (c2[0] - a2[0]), a2[1] + u * (b2[1] - a2[1]) + v * (c2[1] - a2[1])];
}

export function reflect2(p: V2, a: V2, b: V2): V2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const fx = a[0] + t * dx;
  const fy = a[1] + t * dy;
  return [2 * fx - p[0], 2 * fy - p[1]];
}

/** Piece-level effect of a sticker permutation. */
export interface PieceMove {
  dest: number[]; // piece in slot p moves to slot dest[p]
  twist: number[]; // ... and its orientation increases by twist[p]
}

/**
 * Derive piece moves from a sticker permutation. pieces[p] lists the sticker
 * slots of piece slot p in a consistent cyclic order.
 */
export function pieceMove(perm: Int16Array, pieces: number[][]): PieceMove {
  const where = new Map<number, [number, number]>();
  pieces.forEach((st, p) => st.forEach((s, k) => where.set(s, [p, k])));
  // invert gather perm: sticker at i moves to dest(i)
  const to = new Int16Array(perm.length);
  for (let j = 0; j < perm.length; j++) to[perm[j]] = j;
  const dest: number[] = [];
  const twist: number[] = [];
  pieces.forEach((st, p) => {
    const [q, k] = where.get(to[st[0]])!;
    dest[p] = q;
    twist[p] = k;
    for (let i = 1; i < st.length; i++) {
      const [q2, k2] = where.get(to[st[i]])!;
      if (q2 !== q || k2 !== (k + i) % st.length) throw new Error('pieceMove: inconsistent sticker order');
    }
  });
  return { dest, twist };
}
