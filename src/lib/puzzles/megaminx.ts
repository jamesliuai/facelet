/**
 * Megaminx: WCA (Pochmann) random-move scrambles (Regulation 12d, allowed as
 * random-move by 4b3e) and a dodecahedron sticker model for images.
 *
 * R++ / D++ turn the whole puzzle except the layer opposite R / U by 144°.
 */
import { randInt } from '../rand';
import {
  type V2, type V3, type StickerDef, add, centroid, cross, dot, lerp, movePerm, mul, norm, sub, applyPerm, len,
} from './geom';

export function randomScramble(lines = 7, perLine = 10): string {
  const out: string[] = [];
  for (let l = 0; l < lines; l++) {
    const row: string[] = [];
    let lastD = '';
    for (let i = 0; i < perLine; i++) {
      const dir = randInt(2) ? '++' : '--';
      if (i % 2 === 0) row.push('R' + dir);
      else {
        row.push('D' + dir);
        lastD = dir;
      }
    }
    row.push(lastD === '++' ? 'U' : "U'");
    out.push(row.join(' '));
  }
  return out.join('\n');
}

// ------------------------------------------------------------------ geometry

const PHI = (1 + Math.sqrt(5)) / 2;

function rotateAbout(p: V3, k: V3, a: number): V3 {
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

const near = (a: V3, b: V3) => len(sub(a, b)) < 1e-6;

/** Dodecahedron vertices and face normals, oriented with U up and F in front. */
const { VERTS, NORMALS } = (() => {
  let verts: V3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) verts.push([x, y, z]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    verts.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [b * PHI, 0, a / PHI]);
  }
  const candidates: V3[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) candidates.push([0, a * PHI, b], [a * PHI, b, 0], [b, 0, a * PHI]);
  let normals = candidates.map(norm);
  const inr = Math.max(...verts.map((v) => dot(v, normals[0])));
  verts = verts.map((v) => mul(v, 1 / inr));
  // rotate so normals[0] points up
  const up = normals[0];
  const axis = cross(up, [0, 1, 0]);
  const ang = Math.acos(Math.max(-1, Math.min(1, up[1])));
  const r1 = (p: V3): V3 => (len(axis) < 1e-9 ? p : rotateAbout(p, norm(axis), ang));
  normals = normals.map(r1);
  verts = verts.map(r1);
  // spin about y so an upper-ring face points to +z
  const f = normals.find((n) => n[1] > 0.3 && n[1] < 0.9)!;
  const spin = Math.atan2(f[0], f[2]);
  const r2 = (p: V3): V3 => rotateAbout(p, [0, 1, 0], -spin);
  return { VERTS: verts.map(r2), NORMALS: normals.map(r2) };
})();

const az = (n: V3) => Math.atan2(n[0], n[2]);
const U_IDX = NORMALS.findIndex((n) => n[1] > 0.99);
const D_IDX = NORMALS.findIndex((n) => n[1] < -0.99);
/** Upper ring clockwise seen from above, starting at F: F, L, BL, BR, R. */
const UPPER = NORMALS.map((n, i) => [n, i] as const)
  .filter(([n]) => n[1] > 0.3 && n[1] < 0.9)
  .sort((a, b) => az(b[0]) - az(a[0]))
  .map(([, i]) => i);
while (Math.abs(az(NORMALS[UPPER[0]])) > 1e-6) UPPER.push(UPPER.shift()!);
/** Lower ring, each face listed opposite to UPPER[k]. */
const LOWER = UPPER.map((u) => NORMALS.findIndex((n) => near(n, mul(NORMALS[u], -1))));

export const MINX_FACE_NAMES = ['U', 'F', 'L', 'BL', 'BR', 'R', 'D', 'B', 'DR', 'DBR', 'DBL', 'DL'];
/** Colour index -> normal index. Lower faces named by position: opposite F is B, etc. */
export const FACE_ORDER: number[] = [U_IDX, ...UPPER, D_IDX, ...LOWER];

function faceVertices(n: V3): V3[] {
  const vs = VERTS.filter((v) => dot(v, n) > 0.999);
  const ref = norm(sub(vs[0], mul(n, dot(vs[0], n))));
  const ref2 = cross(n, ref);
  return vs.sort((a, b) => Math.atan2(dot(a, ref2), dot(a, ref)) - Math.atan2(dot(b, ref2), dot(b, ref)));
}

function lineIntersect(p1: V3, d1: V3, p2: V3, d2: V3): V3 {
  const w = sub(p1, p2);
  const a = dot(d1, d1);
  const b = dot(d1, d2);
  const c = dot(d2, d2);
  const d = dot(d1, w);
  const e = dot(d2, w);
  const t = (b * e - c * d) / (a * c - b * b);
  return add(p1, mul(d1, t));
}

/** 11 stickers per face: centre, then corner/edge pairs. */
export const STICKERS: StickerDef[] = [];
const CUT = 0.42; // cut line position: fraction of the way from a side towards the face centre
FACE_ORDER.forEach((fi, colour) => {
  const n = NORMALS[fi];
  const v = faceVertices(n);
  const c = mul(n, dot(v[0], n));
  const lines = v.map((a, k) => {
    const b = v[(k + 1) % 5];
    return { p: lerp(lerp(a, b, 0.5), c, CUT), d: sub(b, a) };
  });
  // inner[k]: intersection of lines k-1 and k, near vertex k
  const inner = lines.map((l, k) => lineIntersect(l.p, l.d, lines[(k + 4) % 5].p, lines[(k + 4) % 5].d));
  STICKERS.push({ face: colour, poly: inner.slice(), c: centroid(inner) });
  for (let k = 0; k < 5; k++) {
    const a = v[k];
    const b = v[(k + 1) % 5];
    const prev = v[(k + 4) % 5];
    const onPrevSide = lineIntersect(lines[k].p, lines[k].d, a, sub(prev, a));
    const onNextSide = lineIntersect(lines[(k + 4) % 5].p, lines[(k + 4) % 5].d, a, sub(b, a));
    const corner = [a, onNextSide, inner[k], onPrevSide];
    STICKERS.push({ face: colour, poly: corner, c: centroid(corner) });
    const bPrev = lineIntersect(lines[(k + 1) % 5].p, lines[(k + 1) % 5].d, b, sub(a, b));
    const edge = [onNextSide, bPrev, inner[(k + 1) % 5], inner[k]];
    STICKERS.push({ face: colour, poly: edge, c: centroid(edge) });
  }
});

/** Threshold separating a face's layer (26 stickers) from the rest. */
const LAYER_DEPTH = (() => {
  const n = NORMALS[U_IDX];
  const ds = STICKERS.map((s) => dot(s.c, n)).sort((a, b) => b - a);
  return (ds[25] + ds[26]) / 2;
})();

const ANG72 = (2 * Math.PI) / 5;
const L_IDX = UPPER[1];
const P_U = movePerm(STICKERS, { axis: NORMALS[U_IDX], depth: LAYER_DEPTH, angle: ANG72 });
// R++: all but the L layer, clockwise seen from the right. D++: all but the U layer, clockwise from below.
const P_R = movePerm(STICKERS, { axis: mul(NORMALS[L_IDX], -1), depth: -LAYER_DEPTH, angle: 2 * ANG72 });
const P_D = movePerm(STICKERS, { axis: NORMALS[D_IDX], depth: -LAYER_DEPTH, angle: 2 * ANG72 });

export function solvedState(): Uint8Array {
  return Uint8Array.from(STICKERS.map((s) => s.face));
}

export function applyScramble(state: Uint8Array, scr: string): Uint8Array {
  let s = state;
  for (const tok of scr.trim().split(/\s+/)) {
    switch (tok) {
      case 'R++': s = applyPerm(s, P_R, 1); break;
      case 'R--': s = applyPerm(s, P_R, 4); break;
      case 'D++': s = applyPerm(s, P_D, 1); break;
      case 'D--': s = applyPerm(s, P_D, 4); break;
      case 'U': s = applyPerm(s, P_U, 1); break;
      case "U'": s = applyPerm(s, P_U, 4); break;
    }
  }
  return s;
}

// ------------------------------------------------------------------ net

/**
 * Two flowers: U with its ring (front at the bottom), and D with its ring as
 * seen after flipping the puzzle over (x2). Neighbour faces are unfolded about
 * their shared edge into the centre face's plane.
 */
export function netPolygons(): V2[][] {
  const out: V2[][] = new Array(STICKERS.length);
  const place = (centreIdx: number, ring: number[], ox: number, flip: boolean) => {
    const n = NORMALS[centreIdx];
    const to2 = (p: V3): V2 => [ox + p[0], flip ? -p[2] : p[2]];
    const unfold = (faceIdx: number, p: V3): V3 => {
      if (faceIdx === centreIdx) return p;
      const m = NORMALS[faceIdx];
      const axis = norm(cross(m, n));
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(m, n))));
      const pivot = mul(add(n, m), 1 / (1 + dot(n, m)));
      return add(pivot, rotateAbout(sub(p, pivot), axis, ang));
    };
    FACE_ORDER.forEach((fi, colour) => {
      if (fi !== centreIdx && !ring.includes(fi)) return;
      STICKERS.forEach((s, i) => {
        if (s.face === colour) out[i] = s.poly.map((p) => to2(unfold(fi, p)));
      });
    });
  };
  place(U_IDX, UPPER, 0, false);
  place(D_IDX, LOWER, 3.25, true);
  return out;
}
