/**
 * Generates F2L, COLL, CMLL and ZBLL case sets with computer-searched
 * algorithms (shortest in <R,U>, <R,U,D> and <R,U,F>, scored for
 * ergonomics). Output: src/lib/trainer/data/generated.json
 *
 *   npx tsx scripts/gen-algs.ts [f2l|coll|cmll|zbll ...]
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import * as C from '../src/lib/cube/cubie';
import { cubieFromAlg } from '../src/lib/cube/nxn';
import { llProblem, f2lProblem, zblsProblem, search, type Gen, type Problem } from './search';

const OUT = new URL('../src/lib/trainer/data/generated.json', import.meta.url);

interface CaseOut {
  id: string;
  name: string;
  group: string;
  algs: string[];
}

const U = (k: number) => C.applyMoves(C.solved(), Array(((k % 4) + 4) % 4).fill(0));
const key = (c: C.Cubie) => c.cp.join('') + c.co.join('') + c.ep.join('') + c.eo.join('');

/** Canonical key of the class { U^a · X · U^b }. */
function classKey(x: C.Cubie, cornersOnly = false): string {
  let best = '';
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    const y = C.multiply(C.multiply(U(a), x), U(b));
    const k = cornersOnly ? y.cp.slice(0, 4).join('') + y.co.slice(0, 4).join('') : key(y);
    if (!best || k < best) best = k;
  }
  return best;
}

/** Corner-orientation class (OCLL) name via reference algorithms. */
const OCLL_REF: [string, string][] = [
  ['H', "R U2 R' U' R U R' U' R U' R'"],
  ['Pi', "R U2 R2 U' R2 U' R2 U2 R"],
  ['U', "R2 D' R U2 R' D R U2 R"],
  ['T', "r U R' U' r' F R F'"],
  ['L', "F' r U R' U' r' F R"],
  ['AS', "R U2 R' U' R U' R'"],
  ['S', "R U R' U R U2 R'"],
];
function coKey(co: number[]): string {
  let best = '';
  for (let r = 0; r < 4; r++) {
    const k = [0, 1, 2, 3].map((i) => co[(i + r) % 4]).join('');
    if (!best || k < best) best = k;
  }
  return best;
}
const OCLL = new Map<string, string>();
for (const [name, alg] of OCLL_REF) {
  const c = C.invert(cubieFromAlg(alg)!);
  OCLL.set(coKey(c.co.slice(0, 4)), name);
}
OCLL.set('0000', 'O');
const ocllOf = (c: C.Cubie) => OCLL.get(coKey(c.co.slice(0, 4))) ?? '?';

const ORDER = ['O', 'H', 'Pi', 'U', 'T', 'L', 'S', 'AS'];

let F_COST = 0.45;
let TWO_GEN_BONUS = 0.6;
let R2_COST = 0;
function score(alg: number[]): number {
  let s = alg.length;
  let fCount = 0;
  for (let i = 0; i < alg.length; i++) {
    const m = alg[i];
    const f = (m / 3) | 0;
    if (f === 2) {
      s += F_COST;
      fCount++;
      if (m % 3 === 1) s += 0.25; // F2 is awkward
    }
    if (f === 3) s += 0.2; // D
    if (R2_COST && m === 4) s += R2_COST;
    if (m % 3 === 1) s += 0.05; // half turns are a touch slower
  }
  if (fCount === 0 && alg.every((m) => ((m / 3) | 0) <= 1)) s -= TWO_GEN_BONUS;
  return s;
}

interface Found {
  start: number;
  moves: number[];
}

function bestAlgs(problems: Problem[], starts: C.Cubie[], maxDepth: number, keep = 3, extra: number[] = []): Found[] {
  const all: Found[] = [];
  for (const [pi, p] of problems.entries()) {
    const r = search(p, starts, maxDepth, 4, 6e7, extra[pi] ?? 0);
    for (const [start, moves] of r) all.push({ start, moves });
  }
  all.sort((a, b) => score(a.moves) - score(b.moves));
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const f of all) {
    const s = C.movesToString(f.moves);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(f);
    if (out.length >= keep) break;
  }
  return out;
}

/** Re-express an alg found for start state starts[i] so that it solves its own inverse exactly. */
function finishAlg(moves: number[]): string {
  return C.movesToString(moves);
}

// ------------------------------------------------------------------ LL enumerations

function llStates(opts: { eo: boolean; edges: boolean }): C.Cubie[] {
  const perms: number[][] = [];
  const permute = (a: number[], k = 0) => {
    if (k === a.length) return void perms.push(a.slice());
    for (let i = k; i < a.length; i++) {
      [a[k], a[i]] = [a[i], a[k]];
      permute(a, k + 1);
      [a[k], a[i]] = [a[i], a[k]];
    }
  };
  permute([0, 1, 2, 3]);
  const parity = (p: number[]) => {
    let s = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (p[j] < p[i]) s ^= 1;
    return s;
  };
  const out: C.Cubie[] = [];
  for (let co = 0; co < 81; co++) {
    const o = [co % 3, ((co / 3) | 0) % 3, ((co / 9) | 0) % 3, ((co / 27) | 0) % 3];
    if ((o[0] + o[1] + o[2] + o[3]) % 3) continue;
    for (const cp of perms) {
      for (const ep of opts.edges ? perms : [[0, 1, 2, 3]]) {
        if (opts.edges && parity(cp) !== parity(ep)) continue;
        const c = C.solved();
        for (let i = 0; i < 4; i++) {
          c.cp[i] = cp[i];
          c.co[i] = o[i];
          c.ep[i] = ep[i];
        }
        if (!opts.edges && parity(cp)) {
          // corners-only sets: fix parity with an LL edge swap (edges are free)
          c.ep[0] = 1;
          c.ep[1] = 0;
        }
        out.push(c);
      }
    }
  }
  return out;
}

function classes(states: C.Cubie[], cornersOnly: boolean): C.Cubie[] {
  const map = new Map<string, C.Cubie>();
  for (const s of states) {
    const k = classKey(s, cornersOnly);
    if (!map.has(k)) map.set(k, s);
  }
  return [...map.values()];
}

function runLL(set: 'zbll' | 'coll' | 'cmll', maxDepth: number): CaseOut[] {
  const t0 = Date.now();
  const goal = set === 'zbll' ? 'full' : set;
  const gens: Gen[] = set === 'cmll' ? ['RU', 'RUF', 'RUD'] : ['RU', 'RUD', 'RUF'];
  const problems = gens.map((g) => llProblem(g, goal as 'full' | 'coll' | 'cmll'));
  console.log(`[${set}] tables ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const states = llStates({ eo: true, edges: set === 'zbll' });
  let cls = classes(states, set !== 'zbll');
  if (set === 'zbll') cls = cls.filter((c) => c.co.slice(0, 4).some((x) => x)); // PLLs are their own set
  else cls = cls.filter((c) => !C.isSolved(c) && classKey(c, true) !== classKey(C.solved(), true));
  console.log(`[${set}] ${cls.length} cases`);
  if (process.env.LIMIT) cls = cls.slice(0, parseInt(process.env.LIMIT));
  const out: (CaseOut & { sub: string; order: number })[] = [];
  let i = 0;
  for (const x of cls) {
    const starts = [0, 1, 2, 3].map((b) => C.multiply(x, U(b)));
    const found = bestAlgs(problems, starts, maxDepth);
    i++;
    if (!found.length) {
      console.log(`  ! no alg for case ${i}`);
      continue;
    }
    const algs = found.map((f) => finishAlg(f.moves));
    const display = C.invert(C.applyMoves(C.solved(), found[0].moves));
    const ocll = ocllOf(display);
    out.push({ id: '', name: '', group: ocll, algs, sub: classKey(display, true), order: ORDER.indexOf(ocll) });
    if (i % 20 === 0) console.log(`  ${i}/${cls.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s  e.g. ${algs[0]}`);
  }
  // name: within each OCLL set, group by corner subcase
  out.sort((a, b) => a.order - b.order || (a.sub < b.sub ? -1 : a.sub > b.sub ? 1 : 0) || a.algs[0].length - b.algs[0].length);
  const counters = new Map<string, number>();
  const subIndex = new Map<string, number>();
  for (const c of out) {
    const n = (counters.get(c.group) ?? 0) + 1;
    counters.set(c.group, n);
    const sk = c.group + '|' + c.sub;
    if (!subIndex.has(sk)) subIndex.set(sk, [...subIndex.keys()].filter((k) => k.startsWith(c.group + '|')).length + 1);
    c.name = `${c.group} ${n}`;
    c.id = `${set}-${c.group.toLowerCase()}-${n}`;
    if (set === 'zbll') c.group = `${c.group}`;
    (c as any).subgroup = subIndex.get(sk);
  }
  console.log(`[${set}] done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return out.map(({ id, name, group, algs, ...rest }) => ({ id, name, group, algs, sub: (rest as any).subgroup }));
}

// ------------------------------------------------------------------ F2L

function f2lCases(): { state: C.Cubie; group: string; key: string }[] {
  const out: { state: C.Cubie; group: string; key: string }[] = [];
  const seen = new Set<string>();
  const cornerSpots = [0, 1, 2, 3, 4];
  const edgeSpots = [0, 1, 2, 3, 8];
  for (const q of cornerSpots) for (let o = 0; o < 3; o++) for (const r of edgeSpots) for (let e = 0; e < 2; e++) {
    if (q === 4 && o === 0 && r === 8 && e === 0) continue;
    const c = C.solved();
    // place corner DFR (4) at q
    if (q !== 4) {
      c.cp[4] = c.cp[q];
      c.cp[q] = 4;
    }
    c.co[q] = o;
    if (q !== 4) c.co[4] = (3 - o) % 3;
    else if (o) c.co[0] = (3 - o) % 3; // keep twist sum: compensate on an LL corner
    if (r !== 8) {
      c.ep[8] = c.ep[r];
      c.ep[r] = 8;
    }
    c.eo[r] = e;
    if (r !== 8) c.eo[8] = e;
    else if (e) c.eo[0] = 1;
    // parity: one swap each side, or compensate with an LL edge swap
    if ((q !== 4) !== (r !== 8)) {
      const a = [0, 1, 2, 3].filter((x) => x !== r);
      [c.ep[a[0]], c.ep[a[1]]] = [c.ep[a[1]], c.ep[a[0]]];
    }
    if (!C.isValid(c)) throw new Error('invalid f2l state');
    // class key: pair pieces after any pre-AUF
    let k = '';
    for (let b = 0; b < 4; b++) {
      const y = C.multiply(c, U(b));
      const kk = `${y.cp.indexOf(4)}.${y.co[y.cp.indexOf(4)]}.${y.ep.indexOf(8)}.${y.eo[y.ep.indexOf(8)]}`;
      if (!k || kk < k) k = kk;
    }
    if (seen.has(k)) continue;
    seen.add(k);
    const group = q === 4 && r === 8 ? 'Both in slot' : q === 4 ? 'Corner in slot' : r === 8 ? 'Edge in slot' : 'Both in top';
    out.push({ state: c, group, key: k });
  }
  return out;
}

/** Well-known human F2L algorithms (FR slot). Each is classified by the case it actually solves. */
const F2L_POOL = `R U R' | U R U' R' | U' F' U F | F' U' F | R U' R' | F' U F
U' R U R' U2 R U' R' | U F' U' F U2 F' U F | U' R U2 R' U2 R U' R' | U F' U2 F U2 F' U F
U' R U' R' U F' U' F | U' R U R' U R U R' | U F' U F U' F' U' F | U' R U' R' U R U R'
U R U' R' U' R U' R' U R U' R' | U F' U' F U F' U2 F | R U2 R' U' R U R' | F' U2 F U F' U' F
U R U2 R' U R U' R' | U' F' U2 F U' F' U F | U2 R U R' U R U' R' | U2 F' U' F U' F' U F
R U R' U2 R U R' U' R U R' | F' U' F U2 F' U' F U F' U' F | U2 R U' R' U' R U R' | R U' R' U2 R U R'
R U R' U' R U R' U' R U R' | R U' R' U R U2 R' U R U' R' | R U' R' U' R U R' U2 R U' R'
R U2 R U R' U R U2 R2 | R2 U2 F R2 F' U2 R' U R' | R U' R' F R' F' R | R U R' U' R U R'
R U' R' U R U' R' | U' R' F R F' R U R' | F' U F U' F' U F | R U' R' U2 F' U' F
U F' U' F U' R U R' | U' R U R' U F' U' F | U R U R' U2 R U R' | U' R U' R' U2 R U' R'
R U R' F R' F' R | U R U' R' F R' F' R | R U2 R' U R U' R' | U F' U2 F U F' U2 F
U' R U2 R' U R U R' | R U R' U2 R U' R' | U2 R2 U2 R' U' R U' R2 | R U' R' U' R U2 R'
U R U' R' U F' U' F | U2 R U R' U R U R' | R' U' R' U' R' U R U R | R U' R U2 R' U' R U' R2`
  .split(/[|\n]/)
  .map((s) => s.trim())
  .filter(Boolean);

function f2lKeyOfAlg(alg: string): string | null {
  const c = C.invert(cubieFromAlg(alg) ?? C.solved());
  // cross and the three other slots must be untouched
  for (const i of [5, 6, 7]) if (c.cp[i] !== i || c.co[i] !== 0) return null;
  for (const i of [4, 5, 6, 7, 9, 10, 11]) if (c.ep[i] !== i || c.eo[i] !== 0) return null;
  if (c.cp[4] === 4 && c.co[4] === 0 && c.ep[8] === 8 && c.eo[8] === 0) return null;
  let k = '';
  for (let b = 0; b < 4; b++) {
    const y = C.multiply(c, U(b));
    const kk = `${y.cp.indexOf(4)}.${y.co[y.cp.indexOf(4)]}.${y.ep.indexOf(8)}.${y.eo[y.ep.indexOf(8)]}`;
    if (!k || kk < k) k = kk;
  }
  return k;
}

function runF2L(): CaseOut[] {
  F_COST = 1.0;
  TWO_GEN_BONUS = 1.4;
  R2_COST = 0.6;
  const problems = (['RU', 'RUF'] as Gen[]).map((g) => f2lProblem(g));
  const cases = f2lCases();
  console.log(`[f2l] ${cases.length} cases`);
  const order = ['Both in top', 'Edge in slot', 'Corner in slot', 'Both in slot'];
  const human = new Map<string, string[]>();
  let accepted = 0;
  for (const alg of F2L_POOL) {
    const k = f2lKeyOfAlg(alg);
    if (!k) {
      console.log('  rejected (not an F2L alg):', alg);
      continue;
    }
    accepted++;
    if (!human.has(k)) human.set(k, []);
    human.get(k)!.push(alg);
  }
  console.log(`[f2l] ${accepted}/${F2L_POOL.length} human algs classified into ${human.size} cases`);
  const out = cases.map(({ state, group, key }) => {
    const starts = [0, 1, 2, 3].map((b) => C.multiply(state, U(b)));
    const found = bestAlgs(problems, starts, 13, 3, [4, 2]).map((f) => C.movesToString(f.moves));
    const h = (human.get(key) ?? []).sort((a, b) => score(C.parseMoves(a)) - score(C.parseMoves(b)));
    const algs = [...new Set([...h, ...found])].slice(0, 4);
    return { group, algs };
  });
  out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.algs[0].split(' ').length - b.algs[0].split(' ').length);
  return out.map((c, i) => ({ id: `f2l-${i + 1}`, name: `F2L ${i + 1}`, group: c.group, algs: c.algs }));
}

// ------------------------------------------------------------------ ZBLS

function runZBLS(): CaseOut[] {
  F_COST = 0.5;
  TWO_GEN_BONUS = 0;
  R2_COST = 0.3;
  const problems = [zblsProblem('RUF')];
  const seen = new Set<string>();
  const cases: { state: C.Cubie; group: string }[] = [];
  const pairs = [...f2lCases().map((c) => ({ state: c.state, group: c.group })), { state: C.solved(), group: 'Pair solved' }];
  for (const { state, group } of pairs) {
    // edge positions that hold last-layer edges (U positions without the FR edge, plus the slot if displaced)
    const llPos = [0, 1, 2, 3, 8].filter((p) => state.ep[p] !== 8 && (p < 4 || state.ep[8] !== 8));
    for (let mask = 0; mask < 1 << llPos.length; mask++) {
      const c = C.clone(state);
      llPos.forEach((p, i) => (c.eo[p] = (mask >> i) & 1));
      if (!C.isValid(c)) continue;
      if (C.isSolved(c)) continue;
      // class key under pre-AUF: pair pieces + EO of every edge position
      let k = '';
      for (let b = 0; b < 4; b++) {
        const y = C.multiply(c, U(b));
        const kk = `${y.cp.indexOf(4)}.${y.co[y.cp.indexOf(4)]}.${y.ep.indexOf(8)}.${y.eo[y.ep.indexOf(8)]}|${y.eo.join('')}`;
        if (!k || kk < k) k = kk;
      }
      if (seen.has(k)) continue;
      seen.add(k);
      cases.push({ state: c, group });
    }
  }
  console.log(`[zbls] ${cases.length} cases`);
  const order = ['Pair solved', 'Both in top', 'Edge in slot', 'Corner in slot', 'Both in slot'];
  const t0 = Date.now();
  const out = cases.map(({ state, group }, i) => {
    const starts = [0, 1, 2, 3].map((b) => C.multiply(state, U(b)));
    const found = bestAlgs(problems, starts, 14, 3, [1]).map((f) => C.movesToString(f.moves));
    if (i % 40 === 0) console.log(`  ${i}/${cases.length} ${((Date.now() - t0) / 1000).toFixed(0)}s e.g. ${found[0]}`);
    const flips = 12 - state.eo.filter((x) => x === 0).length;
    return { group, algs: found, flips };
  });
  out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.flips - b.flips || a.algs[0].split(' ').length - b.algs[0].split(' ').length);
  return out.filter((c) => c.algs.length).map((c, i) => ({ id: `zbls-${i + 1}`, name: `ZBLS ${i + 1}`, group: c.group, algs: c.algs }));
}

// ------------------------------------------------------------------ main

const which = process.argv.slice(2);
const want = (s: string) => !which.length || which.includes(s);
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const result: Record<string, CaseOut[]> = { ...prev };
if (want('f2l')) result.f2l = runF2L();
if (want('coll')) result.coll = runLL('coll', 14);
if (want('cmll')) result.cmll = runLL('cmll', 14);
if (want('zbll')) result.zbll = runLL('zbll', 17);
if (want('zbls')) result.zbls = runZBLS();
writeFileSync(OUT, JSON.stringify(result, null, 0).replace(/\},\{/g, '},\n{'));
console.log('wrote', OUT.pathname, Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.length])));
