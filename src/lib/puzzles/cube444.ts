/**
 * 4x4x4 piece model for the random-state scrambler.
 *
 * Everything (piece slots, move cycles, wing orientation) is derived from the
 * StickerCube geometry in ../cube/nxn, so the solver and the sticker
 * simulator used for images and tests can never disagree.
 *
 * Moves are numbered m in [0, 36): m < 18 are outer turns, m >= 18 the
 * matching two-layer wide turns. Within each block m % 18 = face * 3 + pow
 * with faces U R F D L B = 0..5 and pow 0 = quarter, 1 = half, 2 = inverse
 * (the same order as Cubie.MOVES).
 *
 * Wing slot s (0..23) lies on Kociemba edge s % 12 (UR UF UL UB DR DF DL DB
 * FR FL BL BR); s < 12 is the wing nearer the negative end of the edge's
 * axis. Wing piece p is the piece whose home is slot p. Centre slot
 * c = face * 4 + k (k over the face's 2x2 centre block, row-major).
 */
import { StickerCube, stickerPos, type Vec } from '../cube/nxn';
import type { Move } from '../cube/alg';
import * as Cubie from '../cube/cubie';
import { randPerm, shuffle } from '../rand';

export const N_MOVES = 36;
const N = 4;
const FACE_AXIS = [1, 0, 2, 1, 0, 2] as const;
const FACE_SIDE = [1, 1, 1, -1, -1, -1] as const;
const FACES = 'URFDLB';

export const moveFace = (m: number) => ((m % 18) / 3) | 0;
export const moveAxis = (m: number) => FACE_AXIS[moveFace(m)];
export const isWide = (m: number) => m >= 18;
export const movePow = (m: number) => m % 3;
export const invMove = (m: number) => m - (m % 3) + (2 - (m % 3));

export function moveName(m: number): string {
  return FACES[moveFace(m)] + (isWide(m) ? 'w' : '') + ['', '2', "'"][movePow(m)];
}

/** StickerCube move for an internal move index. */
export function moveSpec(m: number): Move {
  const f = moveFace(m);
  const side = FACE_SIDE[f];
  const quarters = movePow(m) + 1;
  const deep = isWide(m) ? 2 : 1;
  return {
    axis: FACE_AXIS[f],
    lo: side > 0 ? N - deep : 0,
    hi: side > 0 ? N - 1 : deep - 1,
    q: (side > 0 ? quarters : 4 - quarters) as 1 | 2 | 3,
  };
}

// ------------------------------------------------------------------ geometry

const posKey = (p: Vec) => `${p[0]},${p[1]},${p[2]}`;

/** Cubie position of a sticker: the face coordinate ±N pulled in to ±(N-1). */
function cubiePos(i: number): Vec {
  const face = (i / 16) | 0;
  const r = ((i % 16) / 4) | 0;
  const c = i % 4;
  const p = stickerPos(N, face, r, c);
  return p.map((v) => (v === N ? N - 1 : v === -N ? -(N - 1) : v)) as Vec;
}

const NORMAL: Vec[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, -1],
];

export interface Geometry {
  /** dest[m][i]: where sticker i goes under move m. */
  stickerDest: Int16Array[];
  /** Per wing slot: [sticker on the edge's primary face, the other sticker]. */
  wingStickers: [number, number][];
  /** Per centre slot: its sticker. */
  centerSticker: number[];
  wingDest: Int8Array[];
  centerDest: Int8Array[];
  /** wingOri[p * 24 + s] = 0 when piece p's primary sticker is on slot s's primary face. */
  wingOri: Uint8Array;
  /** Colours of each wing piece: [primary, secondary]. */
  wingColors: [number, number][];
}

let GEO: Geometry | null = null;

export function geometry(): Geometry {
  if (GEO) return GEO;
  const total = 6 * N * N;
  const ids = new Uint8Array(total);
  for (let i = 0; i < total; i++) ids[i] = i;
  const stickerDest: Int16Array[] = [];
  for (let m = 0; m < N_MOVES; m++) {
    const c = new StickerCube(N, ids).move(moveSpec(m));
    const dest = new Int16Array(total);
    for (let j = 0; j < total; j++) dest[c.s[j]] = j;
    stickerDest.push(dest);
  }

  // Group stickers into pieces by cubie position.
  const byPos = new Map<string, number[]>();
  for (let i = 0; i < total; i++) {
    const k = posKey(cubiePos(i));
    if (!byPos.has(k)) byPos.set(k, []);
    byPos.get(k)!.push(i);
  }

  // Wings: Kociemba edge order, primary face first.
  const wingStickers: [number, number][] = new Array(24);
  const wingSlotOf = new Int16Array(total).fill(-1);
  Cubie.EDGE_COLOR.forEach(([fa, fb], e) => {
    const a = NORMAL[fa];
    const b = NORMAL[fb];
    const axis = [0, 1, 2].find((k) => a[k] === 0 && b[k] === 0)!;
    for (const [j, along] of [[0, -1], [1, 1]] as const) {
      const p: Vec = [0, 0, 0];
      for (let k = 0; k < 3; k++) p[k] = (N - 1) * (a[k] + b[k]);
      p[axis] = along;
      const st = byPos.get(posKey(p))!;
      const onA = st.find((i) => ((i / 16) | 0) === fa)!;
      const onB = st.find((i) => ((i / 16) | 0) === fb)!;
      const s = e + 12 * j;
      wingStickers[s] = [onA, onB];
      wingSlotOf[onA] = s;
      wingSlotOf[onB] = s;
    }
  });
  const wingColors: [number, number][] = wingStickers.map(([a, b]) => [(a / 16) | 0, (b / 16) | 0]);

  const centerSticker: number[] = [];
  const centerSlotOf = new Int16Array(total).fill(-1);
  for (let f = 0; f < 6; f++)
    for (const [r, c] of [[1, 1], [1, 2], [2, 1], [2, 2]]) {
      const i = f * 16 + r * 4 + c;
      centerSlotOf[i] = centerSticker.length;
      centerSticker.push(i);
    }

  const wingDest: Int8Array[] = [];
  const centerDest: Int8Array[] = [];
  for (let m = 0; m < N_MOVES; m++) {
    const d = stickerDest[m];
    const wd = new Int8Array(24);
    for (let s = 0; s < 24; s++) wd[s] = wingSlotOf[d[wingStickers[s][0]]];
    const cd = new Int8Array(24);
    for (let c = 0; c < 24; c++) cd[c] = centerSlotOf[d[centerSticker[c]]];
    wingDest.push(wd);
    centerDest.push(cd);
  }

  // Wing orientation is forced by position: track each piece's primary sticker.
  const wingOri = new Uint8Array(24 * 24).fill(255);
  for (let p = 0; p < 24; p++) {
    wingOri[p * 24 + p] = 0;
    const queue: number[] = [wingStickers[p][0]];
    const seen = new Set<number>(queue);
    while (queue.length) {
      const k = queue.shift()!;
      for (let m = 0; m < N_MOVES; m++) {
        const k2 = stickerDest[m][k];
        if (seen.has(k2)) continue;
        seen.add(k2);
        const s = wingSlotOf[k2];
        const o = wingStickers[s][0] === k2 ? 0 : 1;
        const prev = wingOri[p * 24 + s];
        if (prev !== 255 && prev !== o) throw new Error('cube444: wing orientation is not position-determined');
        wingOri[p * 24 + s] = o;
        queue.push(k2);
      }
    }
  }
  if (wingOri.includes(255)) throw new Error('cube444: wing orbit incomplete');

  GEO = { stickerDest, wingStickers, centerSticker, wingDest, centerDest, wingOri, wingColors };
  return GEO;
}

// ------------------------------------------------------------------ state

export interface State444 {
  /** Corners as a 3x3 cubie (edges unused). */
  corners: Cubie.Cubie;
  /** wp[slot] = wing piece. */
  wp: Int8Array;
  /** ct[slot] = centre colour (face index). */
  ct: Int8Array;
}

export function solved444(): State444 {
  const ct = new Int8Array(24);
  for (let c = 0; c < 24; c++) ct[c] = (c / 4) | 0;
  return { corners: Cubie.solved(), wp: Int8Array.from({ length: 24 }, (_, i) => i), ct };
}

export function clone444(s: State444): State444 {
  return { corners: Cubie.clone(s.corners), wp: s.wp.slice(), ct: s.ct.slice() };
}

export function applyMove444(s: State444, m: number): State444 {
  const g = geometry();
  const wp = new Int8Array(24);
  const ct = new Int8Array(24);
  const wd = g.wingDest[m];
  const cd = g.centerDest[m];
  for (let i = 0; i < 24; i++) {
    wp[wd[i]] = s.wp[i];
    ct[cd[i]] = s.ct[i];
  }
  return { corners: Cubie.multiply(s.corners, Cubie.MOVES[m % 18]), wp, ct };
}

export function applyMoves444(s: State444, moves: readonly number[]): State444 {
  let r = s;
  for (const m of moves) r = applyMove444(r, m);
  return r;
}

/** A uniformly random arrangement of every piece (centre parity is invisible). */
export function random444(): State444 {
  const cube = Cubie.random();
  const corners = Cubie.solved();
  corners.cp = cube.cp;
  corners.co = cube.co;
  const colors: number[] = [];
  for (let c = 0; c < 24; c++) colors.push((c / 4) | 0);
  return { corners, wp: Int8Array.from(randPerm(24)), ct: Int8Array.from(shuffle(colors)) };
}

const R3 = [0, 3]; // 3x3 corner row/col → 4x4 row/col

/** Sticker colours (StickerCube layout) of a state. */
export function render444(s: State444): Uint8Array {
  const g = geometry();
  const out = new Uint8Array(96);
  for (let c = 0; c < 24; c++) out[g.centerSticker[c]] = s.ct[c];
  for (let slot = 0; slot < 24; slot++) {
    const p = s.wp[slot];
    const [c0, c1] = g.wingColors[p];
    const [k1, k2] = g.wingStickers[slot];
    if (g.wingOri[p * 24 + slot] === 0) {
      out[k1] = c0;
      out[k2] = c1;
    } else {
      out[k1] = c1;
      out[k2] = c0;
    }
  }
  const f3 = Cubie.toFacelets(s.corners);
  for (const corner of Cubie.CORNER_FACELET)
    for (const i of corner) {
      const face = (i / 9) | 0;
      const r = ((i % 9) / 3) | 0;
      const c = i % 3;
      out[face * 16 + R3[r >> 1] * 4 + R3[c >> 1]] = f3[i];
    }
  return out;
}

/**
 * The 3x3 cubie of a reduced 4x4 (centres solved, edges paired), or null when
 * the state is not a valid reduction.
 */
export function reducedToCubie(s: State444): Cubie.Cubie | null {
  const st = render444(s);
  const f = new Array<number>(54);
  for (let face = 0; face < 6; face++)
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) f[face * 9 + r * 3 + c] = st[face * 16 + [0, 1, 3][r] * 4 + [0, 1, 3][c]];
  // Paired edges: both wings show the same colours.
  for (let slot = 0; slot < 12; slot++) {
    const g = geometry();
    const [a1, b1] = g.wingStickers[slot];
    const [a2, b2] = g.wingStickers[slot + 12];
    if (st[a1] !== st[a2] || st[b1] !== st[b2]) return null;
  }
  const c = Cubie.fromFacelets(f);
  return c && Cubie.isValid(c) ? c : null;
}
