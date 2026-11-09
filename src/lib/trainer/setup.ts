/**
 * Random-state setups for algorithm training. The case state C (what the
 * solver sees before the algorithm) is wrapped as  R · C · U^k :
 * R randomises the pieces the algorithm does not care about (so the rest of
 * the cube looks like a real solve), U^k randomises the pre-AUF. The result
 * is solved by the two-phase solver, so the scramble never reveals the alg.
 */
import * as Cubie from '../cube/cubie';
import { solveShort } from '../cube/twophase';
import { randInt } from '../rand';
import { randomSubsetCube } from '../scramble/generate';

export type Filler = 'none' | 'auf' | 'll' | 'll-eo' | 'pll' | 'epll' | 'l6e';

export interface CaseOptions {
  filler: Filler;
  preAuf: boolean;
  budgetMs?: number;
}

const U4 = [0, 1, 2, 3];

function filler(kind: Filler): Cubie.Cubie {
  switch (kind) {
    case 'auf':
      return Cubie.applyMoves(Cubie.solved(), Array(randInt(4)).fill(0));
    case 'll':
      return randomSubsetCube({ cperm: U4, cori: U4, eperm: U4, eori: U4 });
    case 'll-eo':
      // randomise the last layer but keep edge orientation (ZBLS cases are about EO)
      return randomSubsetCube({ cperm: U4, cori: U4, eperm: U4, eori: [] });
    case 'pll':
      return randomSubsetCube({ cperm: U4, cori: [], eperm: U4, eori: [] });
    case 'epll': {
      // edge permutation only: needs even parity, so draw until it is
      for (;;) {
        const c = randomSubsetCube({ cperm: [], cori: [], eperm: U4, eori: [] });
        if (Cubie.isValid(c)) return c;
      }
    }
    case 'l6e':
      return randomSubsetCube({ cperm: [], cori: [], eperm: [0, 1, 2, 3, 5, 7], eori: [0, 1, 2, 3, 5, 7] });
    default:
      return Cubie.solved();
  }
}

export function caseScramble(state: Cubie.Cubie, opts: CaseOptions): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let x = Cubie.multiply(filler(opts.filler), state);
    if (opts.preAuf) x = Cubie.applyMoves(x, Array(randInt(4)).fill(0));
    if (!Cubie.isValid(x)) continue;
    const sol = solveShort(x, opts.budgetMs ?? 140);
    if (sol.length === 0) continue;
    return Cubie.movesToString(Cubie.invertMoves(sol));
  }
  return '';
}
