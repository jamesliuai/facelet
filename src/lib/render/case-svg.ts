/**
 * Algorithm case diagrams: last-layer top views (OLL masks, PLL arrows,
 * corner-only views for COLL/CMLL) and an isometric F2L view.
 */
import * as C from '../cube/cubie';
import type { View } from '../trainer/sets';

const GREY = 'var(--case-grey, #b9b9b9)';
const GREY_SIDE = 'var(--case-grey-side, #dcdcdc)';
const LINE = 'var(--sticker-line, #1a1a1a)';

/** Face index → displayed colour index, optionally with yellow on top (z2). */
export function faceColors(colors: string[], yellowTop: boolean): string[] {
  if (!yellowTop) return colors.slice();
  // z2: U↔D, R↔L, F and B stay
  return [colors[3], colors[4], colors[2], colors[0], colors[1], colors[5]];
}

// facelet index → [kind, position]
const FACELET_PIECE: [('c' | 'e' | 'x'), number][] = (() => {
  const out: [('c' | 'e' | 'x'), number][] = new Array(54).fill(null).map(() => ['x', -1] as ['x', number]);
  C.CORNER_FACELET.forEach((fs, pos) => fs.forEach((f) => (out[f] = ['c', pos])));
  C.EDGE_FACELET.forEach((fs, pos) => fs.forEach((f) => (out[f] = ['e', pos])));
  return out;
})();

const rect = (x: number, y: number, w: number, h: number, fill: string, r = 1.6) =>
  `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${r}" fill="${fill}" stroke="${LINE}" stroke-width="1.1"/>`;

/** Top view of the last layer with side strips. */
export function llSvg(state: C.Cubie, view: View, colors: string[], arrows = false): string {
  const f = C.toFacelets(state);
  const S = 22; // sticker size
  const G = 2; // gap
  const T = 7; // side strip thickness
  const O = T + G + 2; // offset of the top face
  const col = (i: number) => colors[f[i]];
  const isU = (i: number) => f[i] === 0;
  const edgeFacelet = (i: number) => FACELET_PIECE[i][0] === 'e';
  const paint = (i: number, side: boolean): string => {
    if (view === 'll-oll') return isU(i) ? col(i) : side ? 'transparent' : GREY;
    if (view === 'll-corners' && edgeFacelet(i)) return side ? GREY_SIDE : isU(i) ? col(i) : GREY;
    return col(i);
  };
  let body = '';
  const x0 = O;
  const y0 = O;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const i = r * 3 + c;
    body += rect(x0 + c * (S + G), y0 + r * (S + G), S, S, paint(i, false), 2.4);
  }
  const span = 3 * S + 2 * G;
  // back strip (B3 B2 B1 left→right), front (F1 F2 F3), left (L1 L2 L3 top→bottom), right (R3 R2 R1)
  const strips: [number[], 'top' | 'bottom' | 'left' | 'right'][] = [
    [[47, 46, 45], 'top'],
    [[18, 19, 20], 'bottom'],
    [[36, 37, 38], 'left'],
    [[11, 10, 9], 'right'],
  ];
  for (const [ids, where] of strips) {
    ids.forEach((i, k) => {
      const fill = paint(i, true);
      if (fill === 'transparent') return;
      const along = k * (S + G);
      if (where === 'top') body += rect(x0 + along, y0 - G - T, S, T, fill, 1.4);
      if (where === 'bottom') body += rect(x0 + along, y0 + span + G, S, T, fill, 1.4);
      if (where === 'left') body += rect(x0 - G - T, y0 + along, T, S, fill, 1.4);
      if (where === 'right') body += rect(x0 + span + G, y0 + along, T, S, fill, 1.4);
    });
  }
  if (arrows) body += pllArrows(state, x0, y0, S, G);
  const W = span + 2 * O;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" role="img">${body}</svg>`;
}

const CORNER_CELL = [8, 6, 0, 2]; // URF UFL ULB UBR → top-face cell
const EDGE_CELL = [5, 7, 3, 1]; // UR UF UL UB

const UTURN = [0, 1, 2, 3].map((k) => C.applyMoves(C.solved(), Array(k).fill(0)));

/**
 * The permutation the arrows should show. Many algorithms finish with a U turn,
 * so the raw case is "PLL + AUF"; drawing that gives rings of arrows. Undo the
 * AUF that leaves the fewest pieces moving (ties: 3 corners + 3 edges, the G perms).
 */
export function arrowPermutation(state: C.Cubie): C.Cubie {
  let best = state;
  let bestScore = Infinity;
  for (let k = 0; k < 4; k++) {
    const y = C.multiply(UTURN[k], state);
    let mc = 0;
    let me = 0;
    for (let p = 0; p < 4; p++) {
      if (y.cp[p] !== p) mc++;
      if (y.ep[p] !== p) me++;
    }
    const score = (mc + me) * 10 + (mc === 3 && me === 3 ? 0 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = y;
    }
  }
  return best;
}

function pllArrows(raw: C.Cubie, x0: number, y0: number, S: number, G: number): string {
  const state = arrowPermutation(raw);
  const centre = (cell: number): [number, number] => [x0 + (cell % 3) * (S + G) + S / 2, y0 + Math.floor(cell / 3) * (S + G) + S / 2];
  const pairs: [number, number][] = [];
  for (let p = 0; p < 4; p++) if (state.cp[p] !== p) pairs.push([CORNER_CELL[p], CORNER_CELL[state.cp[p]]]);
  for (let p = 0; p < 4; p++) if (state.ep[p] !== p) pairs.push([EDGE_CELL[p], EDGE_CELL[state.ep[p]]]);
  // merge swaps into double arrows
  const seen = new Set<string>();
  let out = '';
  for (const [a, b] of pairs) {
    const twoWay = pairs.some(([c, d]) => c === b && d === a);
    const k = twoWay ? [Math.min(a, b), Math.max(a, b)].join('-') : `${a}-${b}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const [x1, y1] = centre(a);
    const [x2, y2] = centre(b);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const sx = x1 + ux * 5;
    const sy = y1 + uy * 5;
    const ex = x2 - ux * 5;
    const ey = y2 - uy * 5;
    const head = (x: number, y: number, vx: number, vy: number) => {
      const s = 5.2;
      const px = -vy;
      const py = vx;
      return `M${(x - vx * s + px * s * 0.62).toFixed(2)},${(y - vy * s + py * s * 0.62).toFixed(2)} L${x.toFixed(2)},${y.toFixed(2)} L${(x - vx * s - px * s * 0.62).toFixed(2)},${(y - vy * s - py * s * 0.62).toFixed(2)}`;
    };
    let d = `M${sx.toFixed(2)},${sy.toFixed(2)} L${ex.toFixed(2)},${ey.toFixed(2)} ${head(ex, ey, ux, uy)}`;
    if (twoWay) d += ` ${head(sx, sy, -ux, -uy)}`;
    out += `<path d="${d}" fill="none" stroke="var(--bg, #fff)" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    out += `<path d="${d}" fill="none" stroke="var(--fg, #0a0a0a)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return out;
}

/**
 * Isometric U/F/R view; stickers of last-layer pieces are greyed (F2L style).
 * With `eo`, top stickers of last-layer edges show the U colour when the edge is oriented.
 */
export function f2lSvg(state: C.Cubie, colors: string[], eo = false): string {
  const f = C.toFacelets(state);
  const fade = (i: number) => {
    const [kind, pos] = FACELET_PIECE[i];
    if (kind === 'x') return false;
    const piece = kind === 'c' ? state.cp[pos] : state.ep[pos];
    if (eo && kind === 'e' && piece < 4 && i < 9 && f[i] === 0) return false; // oriented LL edge, top sticker
    return piece < 4; // last-layer piece
  };
  const k = 15;
  const c30 = Math.cos(Math.PI / 6) * k;
  const s30 = Math.sin(Math.PI / 6) * k;
  const P = (x: number, y: number, z: number): [number, number] => [(x - z) * c30, (x + z) * s30 - y * k];
  // face geometry: origin, u (col) and v (row) vectors, in units of the 3-cube [0,3]
  const faces: { base: number; o: [number, number, number]; u: [number, number, number]; v: [number, number, number] }[] = [
    { base: 0, o: [0, 3, 0], u: [1, 0, 0], v: [0, 0, 1] }, // U: row 0 at back (z=0)
    { base: 18, o: [0, 3, 3], u: [1, 0, 0], v: [0, -1, 0] }, // F: front z=3
    { base: 9, o: [3, 3, 3], u: [0, 0, -1], v: [0, -1, 0] }, // R: right x=3, col 0 at front
  ];
  let body = '';
  const all: [number, number][] = [];
  for (const fc of faces) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const i = fc.base + r * 3 + c;
      const inset = 0.06;
      const corner = (a: number, b: number): [number, number] =>
        P(
          fc.o[0] + fc.u[0] * (c + a) + fc.v[0] * (r + b),
          fc.o[1] + fc.u[1] * (c + a) + fc.v[1] * (r + b),
          fc.o[2] + fc.u[2] * (c + a) + fc.v[2] * (r + b),
        );
      const pts = [corner(inset, inset), corner(1 - inset, inset), corner(1 - inset, 1 - inset), corner(inset, 1 - inset)];
      all.push(...pts);
      const fill = fade(i) ? GREY : colors[f[i]];
      body += `<polygon points="${pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ')}" fill="${fill}" stroke="${LINE}" stroke-width="1.1" stroke-linejoin="round"/>`;
    }
  }
  const minX = Math.min(...all.map((p) => p[0])) - 2;
  const minY = Math.min(...all.map((p) => p[1])) - 2;
  const maxX = Math.max(...all.map((p) => p[0])) + 2;
  const maxY = Math.max(...all.map((p) => p[1])) + 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}" role="img">${body}</svg>`;
}

const cache = new Map<string, string>();
export function caseSvg(state: C.Cubie, view: View, colors: string[], arrows = false): string {
  const key = view + arrows + colors.join() + state.cp.join('') + state.co.join('') + state.ep.join('') + state.eo.join('');
  const hit = cache.get(key);
  if (hit) return hit;
  const svg = view === 'f2l' || view === 'zbls' ? f2lSvg(state, colors, view === 'zbls') : llSvg(state, view, colors, arrows);
  if (cache.size > 2000) cache.clear();
  cache.set(key, svg);
  return svg;
}
