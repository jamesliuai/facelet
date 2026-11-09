import { describe, expect, it } from 'vitest';
import * as C from '../src/lib/cube/cubie';
import { cubieFromAlg } from '../src/lib/cube/nxn';
import { PLL, OLL, OLL2, PLL2, OLL_EDGES } from '../src/lib/trainer/data/known';
import generated from '../src/lib/trainer/data/generated.json';

const U = (k: number) => C.applyMoves(C.solved(), Array(((k % 4) + 4) % 4).fill(0));

function caseOf(alg: string): C.Cubie {
  const s = cubieFromAlg(alg);
  if (!s) throw new Error('bad alg ' + alg);
  return C.invert(s);
}
const f2lSolved = (c: C.Cubie) =>
  [4, 5, 6, 7].every((i) => c.cp[i] === i && c.co[i] === 0) && [4, 5, 6, 7, 8, 9, 10, 11].every((i) => c.ep[i] === i && c.eo[i] === 0);

function oriKey(x: C.Cubie): string {
  let best = '';
  for (let b = 0; b < 4; b++) {
    const y = C.multiply(x, U(b));
    const k = y.co.slice(0, 4).join('') + y.eo.slice(0, 4).join('');
    if (!best || k < best) best = k;
  }
  return best;
}
function fullKey(x: C.Cubie): string {
  let best = '';
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    const y = C.multiply(C.multiply(U(a), x), U(b));
    const k = y.cp.join('') + y.co.join('') + y.ep.join('') + y.eo.join('');
    if (!best || k < best) best = k;
  }
  return best;
}

describe('PLL', () => {
  it('every algorithm is a valid, distinct PLL', () => {
    const keys = new Set<string>();
    for (const c of PLL) {
      const ks = c.algs.map((a) => {
        const x = caseOf(a);
        expect(f2lSolved(x), `${c.name}: ${a}`).toBe(true);
        expect(x.co.every((v) => v === 0) && x.eo.every((v) => v === 0), `${c.name} oriented`).toBe(true);
        return fullKey(x);
      });
      expect(new Set(ks).size, `${c.name} alternatives agree`).toBe(1);
      keys.add(ks[0]);
    }
    expect(keys.size).toBe(21);
  });
  it('edge-only and corner-only perms touch only those pieces', () => {
    for (const c of PLL) {
      const x = caseOf(c.algs[0]);
      const cornersMoved = [0, 1, 2, 3].some((i) => x.cp[i] !== i);
      const edgesMoved = [0, 1, 2, 3].some((i) => x.ep[i] !== i);
      // up to AUF: test both U^k variants
      let ok = false;
      for (let k = 0; k < 4 && !ok; k++) {
        const y = C.multiply(U(k), x);
        const cm = [0, 1, 2, 3].some((i) => y.cp[i] !== i);
        const em = [0, 1, 2, 3].some((i) => y.ep[i] !== i);
        if (c.group === 'Edges only') ok = !cm;
        else if (c.group === 'Corners only') ok = !em;
        else ok = true;
      }
      void cornersMoved;
      void edgesMoved;
      expect(ok, c.name).toBe(true);
    }
  });
});

describe('OLL', () => {
  it('57 distinct cases with the right edge shapes', () => {
    const keys = new Map<string, string>();
    expect(OLL.length).toBe(57);
    for (const c of OLL) {
      const ks = c.algs.map((a) => {
        const x = caseOf(a);
        expect(f2lSolved(x), `${c.name}: ${a}`).toBe(true);
        return oriKey(x);
      });
      expect(new Set(ks).size, `${c.name} alternatives agree`).toBe(1);
      const x = caseOf(c.algs[0]);
      const oriented = [0, 1, 2, 3].filter((i) => x.eo[i] === 0);
      const shape = oriented.length === 0 ? 'dot' : oriented.length === 4 ? 'cross' : (oriented[1] - oriented[0]) === 2 ? 'line' : 'angle';
      expect(shape, c.name).toBe(OLL_EDGES[c.name]);
      if (c.group === 'Corners oriented') expect(x.co.slice(0, 4).every((v) => v === 0), c.name).toBe(true);
      expect(keys.has(ks[0]), `${c.name} duplicates ${keys.get(ks[0])}`).toBe(false);
      keys.set(ks[0], c.name);
    }
  });
});

describe('2-look sets', () => {
  it('are valid', () => {
    for (const c of [...OLL2, ...PLL2]) for (const a of c.algs) expect(f2lSolved(caseOf(a)), `${c.name}: ${a}`).toBe(true);
  });
});

describe('generated sets', () => {
  const sets = generated as Record<string, { name: string; algs: string[] }[]>;
  it('F2L algorithms keep the cross and other slots', () => {
    for (const c of sets.f2l) for (const a of c.algs) {
      const x = caseOf(a);
      expect([5, 6, 7].every((i) => x.cp[i] === i && x.co[i] === 0), `${c.name}: ${a}`).toBe(true);
      expect([4, 5, 6, 7, 9, 10, 11].every((i) => x.ep[i] === i && x.eo[i] === 0), `${c.name}: ${a}`).toBe(true);
    }
    expect(sets.f2l.length).toBe(41);
  });
  it('COLL keeps F2L and EO; CMLL keeps F2B', () => {
    for (const c of sets.coll) for (const a of c.algs) {
      const x = caseOf(a);
      expect(f2lSolved(x), `${c.name}: ${a}`).toBe(true);
      expect(x.eo.every((v) => v === 0), `${c.name} EO`).toBe(true);
    }
    for (const c of sets.cmll) for (const a of c.algs) {
      const x = caseOf(a);
      expect([4, 5, 6, 7].every((i) => x.cp[i] === i && x.co[i] === 0), `${c.name}: ${a}`).toBe(true);
      expect([4, 6, 8, 9, 10, 11].every((i) => x.ep[i] === i && x.eo[i] === 0), `${c.name}: ${a}`).toBe(true);
    }
    expect(sets.coll.length).toBe(42);
    expect(sets.cmll.length).toBe(42);
  });
  it('ZBLS algorithms keep F2L and orient every edge', () => {
    for (const c of sets.zbls) for (const a of c.algs) {
      const x = caseOf(a);
      expect([5, 6, 7].every((i) => x.cp[i] === i && x.co[i] === 0), `${c.name}: ${a}`).toBe(true);
      expect([4, 5, 6, 7, 9, 10, 11].every((i) => x.ep[i] === i && x.eo[i] === 0), `${c.name}: ${a}`).toBe(true);
      // applying the alg to its case leaves all edges oriented
      const after = C.multiply(x, C.applyMoves(C.solved(), C.parseMoves(a)));
      expect(after.eo.every((v) => v === 0), c.name).toBe(true);
    }
    expect(sets.zbls.length).toBeGreaterThan(300);
  });
  it('ZBLL algorithms solve oriented-edge last layers', () => {
    if (!sets.zbll) return;
    const keys = new Set<string>();
    for (const c of sets.zbll) {
      const x = caseOf(c.algs[0]);
      expect(f2lSolved(x), c.name).toBe(true);
      expect(x.eo.every((v) => v === 0), c.name).toBe(true);
      keys.add(fullKey(x));
    }
    expect(keys.size).toBe(sets.zbll.length);
  });
});

describe('alternatives and diagrams', () => {
  it('every alternative solves its case once the right U turn is in front', async () => {
    const { SETS, caseState, withPreAuf } = await import('../src/lib/trainer/sets');
    for (const set of SETS) {
      for (const c of set.cases) {
        const st = caseState(c.algs[0]);
        for (const a of c.algs) expect(withPreAuf(set, st, a), `${set.id} ${c.name}: ${a}`).not.toBeNull();
      }
    }
  });
  it('PLL arrows show the textbook permutation', async () => {
    const { SETS, caseState } = await import('../src/lib/trainer/sets');
    const { arrowPermutation } = await import('../src/lib/render/case-svg');
    const want: Record<string, string> = { Aa: '3/0', Ab: '3/0', E: '4/0', H: '0/4', Ua: '0/3', Ub: '0/3', Z: '0/4', Ga: '3/3', Gb: '3/3', Gc: '3/3', Gd: '3/3' };
    for (const c of SETS.find((s) => s.id === 'pll')!.cases) {
      const y = arrowPermutation(caseState(c.algs[0]));
      let mc = 0;
      let me = 0;
      for (let p = 0; p < 4; p++) {
        if (y.cp[p] !== p) mc++;
        if (y.ep[p] !== p) me++;
      }
      expect(`${mc}/${me}`, c.name).toBe(want[c.name] ?? '2/2');
    }
  });
});
