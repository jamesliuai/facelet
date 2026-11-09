/** Trainer cases and their recommended algorithms. */
import * as C from '../cube/cubie';
import { cubieFromAlg, StickerCube, toCubie } from '../cube/nxn';
import { PLL, OLL, OLL2, PLL2, type RawCase } from './data/known';
import community from './data/community.json';
import type { Filler } from './setup';

export type SetId = 'pll' | 'oll' | 'f2l' | 'oll2' | 'pll2' | 'coll' | 'zbls' | 'zbll' | 'cmll';
export type View = 'll-oll' | 'll-pll' | 'll-full' | 'll-corners' | 'f2l' | 'zbls';

interface AlgSource {
  name: string;
  url: string;
}

export interface TCase {
  id: string;
  name: string;
  group: string;
  state: C.Cubie;
  algs: string[];
  sources?: Record<string, AlgSource>;
}

export interface TSet {
  id: SetId;
  name: string;
  short: string;
  method: 'CFOP' | 'ZB' | 'Roux';
  blurb: string;
  view: View;
  filler: Filler;
  cases: TCase[];
  groups: string[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function fromRaw(prefix: string, raw: RawCase[]): TCase[] {
  return raw.map((c) => ({ ...c, id: `${prefix}-${slug(c.name)}`, state: caseState(c.algs[0]) }));
}

interface CommunityCase {
  id: string;
  name: string;
  group: string;
  sub?: number;
  state: string;
  algs: { moves: string; source: string }[];
}

export interface CommunityData {
  sources: Record<string, AlgSource>;
  sets: Record<'f2l' | 'zbls' | 'coll' | 'zbll' | 'cmll', CommunityCase[]>;
}

const catalog: CommunityData = community;

function communityCases(set: keyof CommunityData['sets']): TCase[] {
  return catalog.sets[set].map(({ id, name, group, sub, state, algs }) => {
    const cubie = C.fromFacelets(Array.from(state, Number));
    if (!cubie) throw new Error(`Invalid trainer case: ${id}`);
    return {
      id,
      name,
      group: set === 'zbll' && sub ? `${group} · ${sub}` : group,
      state: cubie,
      algs: algs.map(({ moves }) => moves),
      sources: Object.fromEntries(algs.map(({ moves, source }) => [moves, catalog.sources[source]])),
    };
  });
}

const groupsOf = (cases: TCase[]) => [...new Set(cases.map((c) => c.group))];

function mk(s: Omit<TSet, 'groups'>): TSet {
  return { ...s, groups: groupsOf(s.cases) };
}

export const SETS: TSet[] = [
  mk({ id: 'f2l', name: 'F2L', short: 'F2L', method: 'CFOP', blurb: 'First two layers: every corner–edge pair case for the front-right slot.', view: 'f2l', filler: 'll', cases: communityCases('f2l') }),
  mk({ id: 'oll', name: 'OLL', short: 'OLL', method: 'CFOP', blurb: 'Orient the last layer in one algorithm. 57 cases.', view: 'll-oll', filler: 'pll', cases: fromRaw('oll', OLL) }),
  mk({ id: 'pll', name: 'PLL', short: 'PLL', method: 'CFOP', blurb: 'Permute the last layer in one algorithm. 21 cases.', view: 'll-pll', filler: 'auf', cases: fromRaw('pll', PLL) }),
  mk({ id: 'oll2', name: '2-look OLL', short: '2LOOK OLL', method: 'CFOP', blurb: 'Beginner OLL: orient edges, then corners. 10 algorithms.', view: 'll-oll', filler: 'none', cases: fromRaw('oll2', OLL2) }),
  mk({ id: 'pll2', name: '2-look PLL', short: '2LOOK PLL', method: 'CFOP', blurb: 'Beginner PLL: corners, then edges. 6 algorithms.', view: 'll-pll', filler: 'none', cases: fromRaw('pll2', PLL2) }),
  mk({ id: 'zbls', name: 'ZBLS', short: 'ZBLS', method: 'ZB', blurb: 'Insert the last F2L pair while orienting every last-layer edge, so ZBLL always follows.', view: 'zbls', filler: 'll-eo', cases: communityCases('zbls') }),
  mk({ id: 'coll', name: 'COLL', short: 'COLL', method: 'ZB', blurb: 'Corners of the last layer with edges oriented, leaving only an EPLL. 42 cases.', view: 'll-corners', filler: 'epll', cases: communityCases('coll') }),
  mk({ id: 'zbll', name: 'ZBLL', short: 'ZBLL', method: 'ZB', blurb: 'Solve any last layer with oriented edges in one algorithm. 472 cases in 7 sets.', view: 'll-full', filler: 'auf', cases: communityCases('zbll') }),
  mk({ id: 'cmll', name: 'CMLL', short: 'CMLL', method: 'Roux', blurb: 'Roux: solve the top corners without breaking the two blocks. 42 cases.', view: 'll-corners', filler: 'l6e', cases: communityCases('cmll') }),
];

export const setById = (id: string) => SETS.find((s) => s.id === id) ?? SETS[2];

/** Derive the diagram for a hand-curated case from its original algorithm. */
function caseState(alg: string): C.Cubie {
  const s = cubieFromAlg(alg);
  return s ? C.invert(s) : C.solved();
}

const U = (k: number) => C.applyMoves(C.solved(), Array(((k % 4) + 4) % 4).fill(0));

/** Does `alg` solve the case (within what the set requires)? */
export function algSolves(set: TSet, state: C.Cubie, alg: string): boolean {
  let after: C.Cubie | null;
  try {
    const sc = new StickerCube(3, Uint8Array.from(C.toFacelets(state))).apply(alg);
    after = toCubie(sc);
  } catch {
    return false;
  }
  if (!after) return false;
  const f2l = (c: C.Cubie) => [4, 5, 6, 7].every((i) => c.cp[i] === i && c.co[i] === 0) && [4, 5, 6, 7, 8, 9, 10, 11].every((i) => c.ep[i] === i && c.eo[i] === 0);
  switch (set.id) {
    case 'zbls':
      return f2l(after) && after.eo.every((x) => x === 0);
    case 'f2l':
      return [4, 5, 6, 7].every((i) => after!.cp[i] === i && after!.co[i] === 0) && [4, 5, 6, 7, 8, 9, 10, 11].every((i) => after!.ep[i] === i && after!.eo[i] === 0);
    case 'oll':
    case 'oll2':
      if (set.id === 'oll2' && state.eo.some((x) => x)) return f2l(after) && after.eo.every((x) => x === 0);
      return f2l(after) && after.co.every((x) => x === 0) && after.eo.every((x) => x === 0);
    case 'coll':
      return f2l(after) && after.eo.every((x) => x === 0) && [0, 1, 2, 3].some((k) => {
        const y = C.multiply(after!, U(k));
        return [0, 1, 2, 3].every((i) => y.cp[i] === i && y.co[i] === 0);
      });
    case 'cmll': {
      const ok = (c: C.Cubie) =>
        [4, 5, 6, 7].every((i) => c.cp[i] === i && c.co[i] === 0) && [4, 6, 8, 9, 10, 11].every((i) => c.ep[i] === i && c.eo[i] === 0) &&
        [0, 1, 2, 3].some((k) => {
          const y = C.multiply(c, U(k));
          return [0, 1, 2, 3].every((i) => y.cp[i] === i && y.co[i] === 0);
        });
      if (ok(after)) return true;
      // Roux algorithms may finish with the M slice turned; centres don't matter in CMLL.
      for (const m of [' M', ' M2', " M'"]) {
        try {
          const c = toCubie(new StickerCube(3, Uint8Array.from(C.toFacelets(state))).apply(alg + m));
          if (c && ok(c)) return true;
        } catch {
          /* ignore */
        }
      }
      return false;
    }
    case 'pll2': {
      const cornersDone = (c: C.Cubie) => [0, 1, 2, 3].some((k) => {
        const y = C.multiply(c, U(k));
        return [0, 1, 2, 3].every((i) => y.cp[i] === i);
      });
      if (cornersDone(state)) return [0, 1, 2, 3].some((k) => C.isSolved(C.multiply(after!, U(k))));
      // The corner step must keep the last layer oriented, not just place the corners.
      return f2l(after) && after.co.every((x) => x === 0) && after.eo.every((x) => x === 0) && cornersDone(after);
    }
    default:
      return [0, 1, 2, 3].some((k) => C.isSolved(C.multiply(after!, U(k))));
  }
}

const PRE_AUF = ['', 'U', "U'", 'U2'];

/**
 * `alg` as it must be executed from the drawn angle: with the U turn it needs
 * in front (alternatives are often written for another angle), or null if no
 * U turn makes it solve the case.
 */
export function withPreAuf(set: TSet, state: C.Cubie, alg: string): { auf: string; alg: string } | null {
  for (const auf of PRE_AUF) {
    if (algSolves(set, state, auf ? `${auf} ${alg}` : alg)) return { auf, alg };
  }
  return null;
}

/** Filler for one case: 2-look sets mix case kinds, so pick by what the case leaves to do. */
export function fillerFor(set: TSet, c: TCase): Filler {
  if (set.id === 'oll2') return c.state.eo.some((x) => x) ? 'll-eo' : 'pll';
  if (set.id === 'pll2') {
    const cornersDone = [0, 1, 2, 3].some((k) => {
      const y = C.multiply(c.state, U(k));
      return [0, 1, 2, 3].every((i) => y.cp[i] === i);
    });
    return cornersDone ? 'auf' : 'epll';
  }
  return set.filler;
}
