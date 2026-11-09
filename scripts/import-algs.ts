/** Refresh the community algorithms while preserving Facelet's case IDs and viewing angles. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import * as C from '../src/lib/cube/cubie';
import { algToString, countMoves, parseAlg } from '../src/lib/cube/alg';
import { cubieFromAlg } from '../src/lib/cube/nxn';
import { setById, withPreAuf, type CommunityData } from '../src/lib/trainer/sets';

const catalogPath = new URL('../src/lib/trainer/data/community.json', import.meta.url);
const upstream = 'https://github.com/tao-yu/Alg-Trainer/blob/cb95945c3e4839ee1e4b058d4a79bc022615b220/js/alg_list.js';
const upstreamSha256 = 'ea9741bf4adc83b1a66ddd1a5207b66a2492898c31cccd0cc106035e3b4beb6e';
const labels = {
  F2L: 'Tao Yu’s Alg Trainer (F2L)',
  ZBLS: 'Chad Batten and Tao Yu (ZBLS)',
  taoCOLL: 'Tao Yu (COLL)',
  COLL: 'Tao Yu’s Alg Trainer (COLL)',
  PLL: 'Tao Yu’s Alg Trainer (PLL)',
  CMLL: 'Tao Yu’s Alg Trainer (CMLL)',
  zbll_juliette: 'Juliette Sébastien (ZBLL)',
  zbll_jabari_justin_tao: 'Jabari Nuruddin, Justin Taylor, and Tao Yu (ZBLL)',
  OLL: 'Tao Yu’s Alg Trainer (OLL)',
};
type Source = keyof typeof labels;
type ImportedSet = keyof CommunityData['sets'];
const sourcesBySet: Record<ImportedSet, Source[]> = {
  f2l: ['F2L'],
  coll: ['taoCOLL', 'COLL', 'PLL'],
  cmll: ['CMLL'],
  zbll: ['zbll_juliette', 'zbll_jabari_justin_tao'],
  zbls: ['ZBLS', 'OLL'],
};

function readSource(path: string) {
  const contents = readFileSync(path, 'utf8');
  if (createHash('sha256').update(contents).digest('hex') !== upstreamSha256) {
    throw new Error(`Expected the pinned alg_list.js from ${upstream}`);
  }
  const file = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const tables = new Map<Source, string[]>();
  const credits: CommunityData['sources'] = {};
  // Read string literals only. The upstream file also contains browser code.
  for (const stmt of file.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !Object.hasOwn(labels, decl.name.text)) continue;
      const source = decl.name.text as Source;
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) throw new Error(`Invalid table: ${source}`);
      const algs: string[] = [];
      for (const row of decl.initializer.properties) {
        if (!ts.isPropertyAssignment(row) || !ts.isArrayLiteralExpression(row.initializer)) throw new Error(`Invalid row: ${source}`);
        for (const cell of row.initializer.elements) {
          if (!ts.isStringLiteral(cell)) throw new Error(`Invalid algorithm: ${source}`);
          algs.push(...cell.text.split('/').map((alg) => alg.trim()).filter(Boolean));
        }
      }
      const { line } = file.getLineAndCharacterOfPosition(stmt.getStart(file));
      tables.set(source, algs);
      credits[source] = { name: labels[source], url: `${upstream}#L${line + 1}` };
    }
  }
  return { tables, credits };
}

const uTurns = Array.from({ length: 4 }, (_, i) => C.applyMoves(C.solved(), Array(i).fill(0)));
const rotationCount = (alg: string) => parseAlg(alg).filter((move) => move.kind === 'rot').length;
const cornersSolved = (c: C.Cubie, positions: number[]) => positions.every((p) => c.cp[p] === p && c.co[p] === 0);
const edgesSolved = (c: C.Cubie, positions: number[]) => positions.every((p) => c.ep[p] === p && c.eo[p] === 0);

/** Identify a case by its relevant pieces, ignoring top turns before and after the solve. */
function caseKey(set: ImportedSet, state: C.Cubie): string | null {
  if (set === 'f2l' || set === 'zbls') {
    if (!cornersSolved(state, [5, 6, 7]) || !edgesSolved(state, [4, 5, 6, 7, 9, 10, 11])) return null;
    return uTurns.map((u) => {
      const x = C.multiply(state, u);
      const corner = x.cp.indexOf(4);
      const edge = x.ep.indexOf(8);
      return [corner, x.co[corner], edge, x.eo[edge], ...(set === 'zbls' ? x.eo : [])].join(',');
    }).sort()[0];
  }

  if (!cornersSolved(state, [4, 5, 6, 7])) return null;
  const blockEdges = set === 'cmll' ? [4, 6, 8, 9, 10, 11] : [4, 5, 6, 7, 8, 9, 10, 11];
  if (!edgesSolved(state, blockEdges) || (set !== 'cmll' && state.eo.some(Boolean))) return null;
  return uTurns.flatMap((pre) => uTurns.map((post) => {
    const x = C.multiply(C.multiply(pre, state), post);
    return [...x.cp, ...x.co, ...(set === 'zbll' ? x.ep : [])].join(',');
  })).sort()[0];
}

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: npm run import:algs -- /path/to/Alg-Trainer/js/alg_list.js');
const { tables, credits } = readSource(sourcePath);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as CommunityData;
catalog.sources = credits;

for (const id of Object.keys(sourcesBySet) as ImportedSet[]) {
  const set = setById(id);
  const byKey = new Map(set.cases.map((c) => [caseKey(id, c.state), c]));
  if (byKey.has(null) || byKey.size !== set.cases.length) throw new Error(`Invalid or duplicate Facelet case in ${id}`);

  const matches = new Map(set.cases.map((c) => [c.id, new Map<string, Source>()]));
  for (const source of sourcesBySet[id]) {
    const algs = tables.get(source);
    if (!algs) throw new Error(`Missing upstream table: ${source}`);
    // These three ZBLS cases already have the pair inserted, so a short OLL is enough.
    const ranked = source === 'OLL' ? algs.slice().sort((a, b) => countMoves(a).htm - countMoves(b).htm) : algs;
    for (const raw of ranked) {
      let alg: string;
      try {
        // Some source entries write a prime after a parenthesized setup turn.
        const moves = parseAlg(raw.replace(/\(([UDLRFBMESudlrfbxyz][2']?)\)'/g, "$1'"));
        // The source's initial U turn is for its own diagram. Align to ours below.
        const first = moves.findIndex((move) => move.kind !== 'face' || move.base !== 'U');
        if (first < 0) continue;
        alg = algToString(moves.slice(first));
      } catch {
        continue;
      }
      const prefixes = id === 'f2l' || id === 'zbls' ? ['', 'y ', 'y2 ', "y' "] : [''];
      for (const prefix of prefixes) {
        const candidate = prefix + alg;
        const move = cubieFromAlg(candidate);
        if (!move) continue;
        const c = byKey.get(caseKey(id, C.invert(move)));
        if (!c || (source === 'OLL' && c.group !== 'Pair solved')) continue;
        const fit = withPreAuf(set, c.state, candidate);
        if (!fit) continue;
        const aligned = fit.auf ? `${fit.auf} ${fit.alg}` : fit.alg;
        const options = matches.get(c.id)!;
        if (!options.has(aligned)) options.set(aligned, source);
        break;
      }
    }
  }

  for (const c of catalog.sets[id]) {
    const options = matches.get(c.id)!;
    if (!options.size) throw new Error(`No community algorithm solves ${c.id}`);
    const ranked = [...options];
    // Prefer options that keep the cube in hand when inserting the front-right pair.
    if (id === 'f2l' || id === 'zbls') ranked.sort(([a], [b]) => rotationCount(a) - rotationCount(b));
    c.algs = ranked.slice(0, 3).map(([moves, source]) => ({ moves, source }));
  }
  console.log(`${id}: ${set.cases.length} cases matched`);
}

const sets = Object.entries(catalog.sets).map(([id, cases]) =>
  `    "${id}": [\n${cases.map((c) => '      ' + JSON.stringify(c)).join(',\n')}\n    ]`);
writeFileSync(catalogPath, `{\n  "sources": ${JSON.stringify(credits, null, 2).replaceAll('\n', '\n  ')},\n  "sets": {\n${sets.join(',\n')}\n  }\n}\n`);
