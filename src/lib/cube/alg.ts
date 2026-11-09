/**
 * Algorithm notation for NxN cubes: WCA (`R`, `Rw`, `3Rw`), SiGN (`r`, `3r`,
 * `2R`), slices (`M E S`), rotations (`x y z`), grouping `( … )n`,
 * commutators `[A, B]` and conjugates `[A: B]`. Comments with `//` are ignored.
 */

export type FaceChar = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';

export interface Token {
  /** Base letter as written, upper-cased: U D L R F B M E S X Y Z */
  base: string;
  /** 'face' outer layer, 'wide' block from a face, 'slice' a single inner layer, 'mid' M/E/S, 'rot' x/y/z */
  kind: 'face' | 'wide' | 'slice' | 'mid' | 'rot';
  /** Block depth for wide moves, or layer number for single-slice moves. */
  depth: number;
  /** Signed quarter turns as written: 1, 2, -1 (and -2 for "2'"). */
  amount: number;
}

export interface Move {
  axis: 0 | 1 | 2; // x (R), y (U), z (F)
  lo: number; // inclusive layer range counted from the L/D/B side
  hi: number;
  q: 1 | 2 | 3; // clockwise quarter turns as seen from the R/U/F side
}

const AXIS: Record<string, [0 | 1 | 2, 1 | -1]> = {
  R: [0, 1], L: [0, -1], M: [0, -1], X: [0, 1],
  U: [1, 1], D: [1, -1], E: [1, -1], Y: [1, 1],
  F: [2, 1], B: [2, -1], S: [2, 1], Z: [2, 1],
};

export class AlgError extends Error {}

/** Tokenise into a flat move list, expanding groups, repeats, commutators. */
export function parseAlg(src: string): Token[] {
  const s = src.replace(/\/\/[^\n]*/g, ' ').replace(/[’′‘`]/g, "'");
  let i = 0;

  function skipWs() {
    while (i < s.length && /[\s.]/.test(s[i])) i++;
  }

  function readInt(): number | null {
    const m = /^\d+/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseInt(m[0], 10);
  }

  function readCount(): number {
    // after a group: optional count and optional prime
    const n = readInt();
    let c = n ?? 1;
    if (s[i] === "'") {
      i++;
      c = -c;
    }
    return c;
  }

  function invert(seq: Token[]): Token[] {
    return seq
      .slice()
      .reverse()
      .map((t) => ({ ...t, amount: -t.amount }));
  }

  function repeat(seq: Token[], n: number): Token[] {
    const base = n < 0 ? invert(seq) : seq;
    const out: Token[] = [];
    for (let k = 0; k < Math.abs(n); k++) out.push(...base);
    return out;
  }

  function parseSeq(closers: string): Token[] {
    const out: Token[] = [];
    for (;;) {
      skipWs();
      if (i >= s.length) return out;
      const ch = s[i];
      if (closers.includes(ch)) return out;
      if (ch === '(') {
        i++;
        const inner = parseSeq(')');
        if (s[i] !== ')') throw new AlgError('Missing )');
        i++;
        out.push(...repeat(inner, readCount()));
        continue;
      }
      if (ch === '[') {
        i++;
        const a = parseSeq(',:]');
        const sep = s[i];
        if (sep === ']') {
          i++;
          out.push(...repeat(a, readCount()));
          continue;
        }
        if (sep !== ',' && sep !== ':') throw new AlgError('Expected , or : in brackets');
        i++;
        const b = parseSeq(']');
        if (s[i] !== ']') throw new AlgError('Missing ]');
        i++;
        const body = sep === ',' ? [...a, ...b, ...invert(a), ...invert(b)] : [...a, ...b, ...invert(a)];
        out.push(...repeat(body, readCount()));
        continue;
      }
      out.push(readMove());
    }
  }

  function readMove(): Token {
    const start = i;
    const prefix = readInt();
    const ch = s[i];
    if (!ch || !/[UDLRFBudlrfbMESxyzmes]/.test(ch)) {
      throw new AlgError(`Unexpected "${s.slice(start, start + 4).trim() || ch}"`);
    }
    i++;
    let kind: Token['kind'];
    let depth = 1;
    const upper = ch.toUpperCase();
    if ('xyz'.includes(ch)) {
      kind = 'rot';
    } else if ('MESmes'.includes(ch)) {
      kind = 'mid';
    } else if (ch === upper) {
      if (s[i] === 'w') {
        i++;
        kind = 'wide';
        depth = prefix ?? 2;
      } else if (prefix != null && prefix > 1) {
        kind = 'slice';
        depth = prefix;
      } else {
        kind = 'face';
      }
    } else {
      kind = 'wide';
      depth = prefix ?? 2;
    }
    let amount = 1;
    const n = readInt();
    if (n != null) amount = n;
    if (s[i] === "'") {
      i++;
      amount = -amount;
    }
    return { base: kind === 'rot' ? ch.toUpperCase() : upper, kind, depth, amount };
  }

  const out = parseSeq('');
  skipWs();
  if (i < s.length) throw new AlgError(`Unexpected "${s[i]}"`);
  return out;
}

/** Resolve a token for an NxN cube into an axis/layer-range move. */
export function resolve(t: Token, n: number): Move | null {
  const [axis, side] = AXIS[t.base];
  let lo: number;
  let hi: number;
  switch (t.kind) {
    case 'rot':
      lo = 0;
      hi = n - 1;
      break;
    case 'mid':
      if (n < 3) return null;
      lo = 1;
      hi = n - 2;
      break;
    case 'face':
      lo = hi = side > 0 ? n - 1 : 0;
      break;
    case 'wide': {
      const d = Math.min(t.depth, n);
      if (side > 0) {
        lo = n - d;
        hi = n - 1;
      } else {
        lo = 0;
        hi = d - 1;
      }
      break;
    }
    case 'slice': {
      if (t.depth > n) return null;
      lo = hi = side > 0 ? n - t.depth : t.depth - 1;
      break;
    }
  }
  const q = ((((t.amount * side) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  if (q === 0) return null;
  return { axis, lo, hi, q };
}

export function tokenToString(t: Token): string {
  const suf = t.amount === 1 ? '' : t.amount === -1 ? "'" : Math.abs(t.amount) === 2 ? '2' : t.amount > 0 ? String(t.amount) : `${-t.amount}'`;
  switch (t.kind) {
    case 'rot':
      return t.base.toLowerCase() + suf;
    case 'mid':
    case 'face':
      return t.base + suf;
    case 'wide':
      return (t.depth > 2 ? t.depth : '') + t.base + 'w' + suf;
    case 'slice':
      return t.depth + t.base + suf;
  }
}

export function algToString(tokens: Token[]): string {
  return tokens.map(tokenToString).join(' ');
}

export function invertAlg(src: string): string {
  return algToString(
    parseAlg(src)
      .reverse()
      .map((t) => ({ ...t, amount: -t.amount })),
  );
}

/** Move counts in common metrics. */
export function countMoves(src: string): { htm: number; qtm: number; stm: number; etm: number } {
  let tokens: Token[];
  try {
    tokens = parseAlg(src);
  } catch {
    return { htm: 0, qtm: 0, stm: 0, etm: 0 };
  }
  let htm = 0;
  let qtm = 0;
  let stm = 0;
  let etm = 0;
  for (const t of tokens) {
    const quarter = Math.abs(t.amount) % 4 === 2 ? 2 : 1;
    etm++;
    if (t.kind === 'rot') continue;
    stm++;
    // A slice move is two outer moves in HTM/QTM.
    const mult = t.kind === 'mid' || t.kind === 'slice' ? 2 : 1;
    htm += mult;
    qtm += mult * quarter;
  }
  return { htm, qtm, stm, etm };
}

/** True if the string parses as a valid NxN algorithm. */
export function isValidAlg(src: string): boolean {
  try {
    parseAlg(src);
    return true;
  } catch {
    return false;
  }
}
