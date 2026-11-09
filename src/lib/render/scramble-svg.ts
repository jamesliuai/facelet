/**
 * SVG scramble previews for every puzzle. Returned as strings so they can be
 * cached and rendered with {@html}. Colours: U R F D L B from settings.
 */
import { StickerCube } from '../cube/nxn';
import { isValidAlg } from '../cube/alg';
import * as Pyra from '../puzzles/pyraminx';
import * as Skewb from '../puzzles/skewb';
import * as Minx from '../puzzles/megaminx';
import * as Sq1 from '../puzzles/sq1';
import * as Clock from '../puzzles/clock';
import { eventById } from '../scramble/events';

const LINE = 'var(--sticker-line, #1a1a1a)';

export const MINX_COLORS = [
  '#ffffff', '#009b48', '#7a3fb0', '#ffd500', '#0046ad', '#c8102e',
  '#9aa0a6', '#7fd3ff', '#ff5800', '#b7e34a', '#f6a6c9', '#f2e6b4',
];

const poly = (pts: [number, number][], fill: string, sw = 1) =>
  `<polygon points="${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="${fill}" stroke="${LINE}" stroke-width="${sw}" stroke-linejoin="round"/>`;

function wrap(w: number, h: number, body: string, label: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="${label}">${body}</svg>`;
}

// ------------------------------------------------------------------ NxN

export function nxnSvg(n: number, scramble: string, colors: string[]): string {
  let cube: StickerCube;
  try {
    cube = new StickerCube(n).apply(scramble);
  } catch {
    cube = new StickerCube(n);
  }
  return nxnStateSvg(cube, colors);
}

export function nxnStateSvg(cube: StickerCube, colors: string[], mask?: (i: number) => boolean): string {
  const n = cube.n;
  const face = 60;
  const gap = 5;
  const cell = face / n;
  const inset = n <= 3 ? 1.1 : n <= 5 ? 0.8 : 0.6;
  const pos: Record<number, [number, number]> = {
    0: [1, 0], // U
    4: [0, 1], // L
    2: [1, 1], // F
    1: [2, 1], // R
    5: [3, 1], // B
    3: [1, 2], // D
  };
  let body = '';
  for (let f = 0; f < 6; f++) {
    const [fx, fy] = pos[f];
    const ox = fx * (face + gap) + 1;
    const oy = fy * (face + gap) + 1;
    body += `<rect x="${ox}" y="${oy}" width="${face}" height="${face}" rx="2.5" fill="${LINE}"/>`;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = f * n * n + r * n + c;
        const col = mask && !mask(i) ? '#8a8a8a' : colors[cube.s[i]];
        body += `<rect x="${(ox + c * cell + inset).toFixed(2)}" y="${(oy + r * cell + inset).toFixed(2)}" width="${(cell - 2 * inset).toFixed(2)}" height="${(cell - 2 * inset).toFixed(2)}" rx="${Math.min(2, cell / 8).toFixed(2)}" fill="${col}"/>`;
      }
    }
  }
  return wrap(4 * face + 3 * gap + 2, 3 * face + 2 * gap + 2, body, `${n}x${n} scramble`);
}

// ------------------------------------------------------------------ pyraminx

const PYRA_FACE_COLOR = (colors: string[]) => [colors[2], colors[1], colors[5], colors[3]];
let pyraNet: [number, number][][] | null = null;

export function pyraSvg(scramble: string, colors: string[]): string {
  pyraNet ??= Pyra.netPolygons(1, 0.035) as [number, number][][];
  const st = Pyra.applyScramble(Pyra.solvedState(), scramble);
  const fc = PYRA_FACE_COLOR(colors);
  const all = pyraNet.flat();
  const minX = Math.min(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const s = 120 / (maxX - minX);
  let body = '';
  pyraNet.forEach((pts, i) => {
    body += poly(pts.map(([x, y]) => [(x - minX) * s + 2, (y - minY) * s + 2]), fc[st[i]], 1.4);
  });
  return wrap((maxX - minX) * s + 4, (maxY - minY) * s + 4, body, 'Pyraminx scramble');
}

// ------------------------------------------------------------------ skewb

export function skewbSvg(scramble: string, colors: string[]): string {
  const st = Skewb.applyScramble(Skewb.solvedState(), scramble);
  const face = 50;
  const gap = 4;
  const pos: Record<number, [number, number]> = { 0: [1, 0], 4: [0, 1], 2: [1, 1], 1: [2, 1], 5: [3, 1], 3: [1, 2] };
  let body = '';
  Skewb.STICKERS.forEach((s, i) => {
    const [fx, fy] = pos[s.face];
    const ox = fx * (face + gap) + face / 2 + 2;
    const oy = fy * (face + gap) + face / 2 + 2;
    body += poly(s.local.map(([a, b]) => [ox + (a * face) / 2, oy - (b * face) / 2]), colors[st[i]], 1.3);
  });
  return wrap(4 * face + 3 * gap + 4, 3 * face + 2 * gap + 4, body, 'Skewb scramble');
}

// ------------------------------------------------------------------ megaminx

let minxNet: [number, number][][] | null = null;

export function minxSvg(scramble: string): string {
  minxNet ??= Minx.netPolygons() as [number, number][][];
  const st = Minx.applyScramble(Minx.solvedState(), scramble);
  const all = minxNet.flat();
  const minX = Math.min(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const s = 250 / (maxX - minX);
  let body = '';
  minxNet.forEach((pts, i) => {
    body += poly(pts.map(([x, y]) => [(x - minX) * s + 2, (y - minY) * s + 2]), MINX_COLORS[st[i]], 1);
  });
  return wrap((maxX - minX) * s + 4, (maxY - minY) * s + 4, body, 'Megaminx scramble');
}

// ------------------------------------------------------------------ square-1

function sq1Layer(layer: number[], cx: number, cy: number, R: number, top: boolean, colors: string[]): string {
  const re = R / Math.cos(Math.PI / 12); // distance to an edge-wedge outer vertex
  const rc = R * Math.SQRT2; // distance to a corner tip
  const startDeg = top ? 15 : -15;
  const dir = (deg: number, r: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    // degrees clockwise from straight down on screen
    return [cx - Math.sin(a) * r, cy + Math.cos(a) * r];
  };
  let body = '';
  let i = 0;
  // start at a slot that begins a piece
  let s0 = 0;
  while (layer[s0] === layer[(s0 + 11) % 12] && Sq1.isCorner(layer[s0])) s0 = (s0 + 1) % 12;
  const visited = new Set<number>();
  for (let k = 0; k < 12; k++) {
    const slot = (s0 + k) % 12;
    const p = layer[slot];
    if (visited.has(p)) continue;
    visited.add(p);
    const a0 = startDeg + slot * 30;
    const topCol = colors[Sq1.pieceTop(p)];
    const sides = Sq1.PIECE_SIDES[p];
    if (Sq1.isCorner(p)) {
      const pts = [[cx, cy] as [number, number], dir(a0, re * 0.62), dir(a0 + 30, rc * 0.62), dir(a0 + 60, re * 0.62)];
      body += poly(pts, topCol, 1.2);
      // side stickers as an outer band
      const outer1 = [dir(a0, re * 0.62), dir(a0, re), dir(a0 + 30, rc), dir(a0 + 30, rc * 0.62)] as [number, number][];
      const outer2 = [dir(a0 + 30, rc * 0.62), dir(a0 + 30, rc), dir(a0 + 60, re), dir(a0 + 60, re * 0.62)] as [number, number][];
      body += poly(outer1, colors[sides[0]], 1.2) + poly(outer2, colors[sides[1]], 1.2);
    } else {
      const pts = [[cx, cy] as [number, number], dir(a0, re * 0.62), dir(a0 + 30, re * 0.62)];
      body += poly(pts, topCol, 1.2);
      body += poly([dir(a0, re * 0.62), dir(a0, re), dir(a0 + 30, re), dir(a0 + 30, re * 0.62)], colors[sides[0]], 1.2);
    }
    i++;
  }
  void i;
  // slice line
  const l1 = dir(startDeg - 0.0, rc * 1.08);
  const l2 = dir(startDeg + 180, rc * 1.08);
  body += `<line x1="${l1[0].toFixed(1)}" y1="${l1[1].toFixed(1)}" x2="${l2[0].toFixed(1)}" y2="${l2[1].toFixed(1)}" stroke="var(--fg-3, #888)" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  return body;
}

export function sq1Svg(scramble: string, colors: string[]): string {
  const st = Sq1.applyScramble(scramble);
  const R = 46;
  const w = 4 * R * 1.45 + 30;
  let body = sq1Layer(st.top, R * 1.5 + 6, R * 1.5 + 6, R, true, colors);
  body += sq1Layer(st.bot, R * 4.4 + 18, R * 1.5 + 6, R, false, colors);
  // middle layer indicator
  const y = R * 3.15 + 10;
  const mid = st.midFlipped;
  body += `<rect x="${R * 1.5 + 6 - 30}" y="${y}" width="60" height="9" rx="2" fill="${colors[2]}" stroke="${LINE}" stroke-width="1.2"/>`;
  body += `<rect x="${R * 1.5 + 6 + (mid ? 6 : 30)}" y="${y}" width="${mid ? 54 : 30}" height="9" rx="2" fill="${mid ? colors[5] : colors[2]}" stroke="${LINE}" stroke-width="1.2"/>`;
  return wrap(w, y + 14, body, 'Square-1 scramble');
}

// ------------------------------------------------------------------ clock

export function clockSvg(scramble: string): string {
  const st = Clock.applyScramble(scramble);
  const D = 26; // dial spacing
  const r = 10.5;
  let body = '';
  const side = (offset: number, ox: number, dark: boolean) => {
    const face = dark ? 'var(--fg, #0a0a0a)' : 'var(--bg, #fff)';
    const ink = dark ? 'var(--bg, #fff)' : 'var(--fg, #0a0a0a)';
    body += `<rect x="${ox}" y="2" width="${D * 3 + 10}" height="${D * 3 + 10}" rx="${D * 0.9}" fill="${face}" stroke="var(--fg, #0a0a0a)" stroke-width="1.4"/>`;
    for (let i = 0; i < 9; i++) {
      const cx = ox + 5 + D * (i % 3) + D / 2;
      const cy = 7 + D * Math.floor(i / 3) + D / 2;
      const v = st.dials[offset + i];
      const a = (v * Math.PI) / 6;
      body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${face}" stroke="${ink}" stroke-width="1.2"/>`;
      body += `<circle cx="${cx}" cy="${cy - r + 2.2}" r="0.9" fill="${ink}"/>`;
      body += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.sin(a) * (r - 2.6)).toFixed(2)}" y2="${(cy - Math.cos(a) * (r - 2.6)).toFixed(2)}" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`;
      if (v === 0) body += `<circle cx="${cx}" cy="${cy}" r="1.6" fill="${ink}"/>`;
    }
  };
  side(0, 2, false);
  side(9, D * 3 + 22, true);
  return wrap(D * 6 + 34, D * 3 + 14, body, 'Clock scramble');
}

// ------------------------------------------------------------------ dispatcher

const cache = new Map<string, string>();

export function scrambleSvg(eventId: string, scramble: string, colors: string[]): string {
  const key = eventId + '|' + colors.join() + '|' + scramble;
  const hit = cache.get(key);
  if (hit) return hit;
  const ev = eventById(eventId);
  let svg = '';
  try {
    switch (ev.puzzle) {
      case 'nxn':
        svg = isValidAlg(scramble) ? nxnSvg(ev.size ?? 3, scramble, colors) : nxnSvg(ev.size ?? 3, '', colors);
        break;
      case 'pyram':
        svg = pyraSvg(scramble, colors);
        break;
      case 'skewb':
        svg = skewbSvg(scramble, colors);
        break;
      case 'minx':
        svg = minxSvg(scramble);
        break;
      case 'sq1':
        svg = sq1Svg(scramble, colors);
        break;
      case 'clock':
        svg = clockSvg(scramble);
        break;
    }
  } catch {
    svg = '';
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, svg);
  return svg;
}
