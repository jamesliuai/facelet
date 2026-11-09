/** Event metadata shared by the UI and the scramble worker. No solver code here. */

export type PuzzleKind = 'nxn' | 'pyram' | 'skewb' | 'clock' | 'minx' | 'sq1';

export interface ScrambleType {
  id: string;
  name: string;
  note?: string;
}

export interface EventDef {
  id: string;
  name: string;
  short: string;
  puzzle: PuzzleKind;
  size?: number;
  /** Primary competition format; drives which average is highlighted. */
  format: 'ao5' | 'mo3' | 'bo3' | 'bo5';
  scrambles: ScrambleType[];
  wca: boolean;
  /** Inspection default per WCA rules (BLD events have none). */
  inspection: boolean;
}

const WCA_333: ScrambleType = { id: 'wca', name: 'WCA (random state)' };

export const SUBSETS_333: ScrambleType[] = [
  WCA_333,
  { id: 'rm', name: 'Random move (25)' },
  { id: 'f2l', name: 'Cross solved (F2L)', note: 'Cross done; train F2L and last layer' },
  { id: 'lsll', name: 'Last slot + last layer' },
  { id: 'll', name: 'Last layer' },
  { id: 'zbll', name: 'ZBLL (edges oriented)' },
  { id: 'oll', name: 'OLL (permutation solved)' },
  { id: 'pll', name: 'PLL' },
  { id: 'cmll', name: 'CMLL (Roux F2B solved)' },
  { id: 'l6e', name: 'L6E (Roux last six edges)' },
  { id: 'eo', name: 'EO solved (ZZ)' },
  { id: 'eoline', name: 'EOLine solved (ZZ F2L)' },
  { id: 'corners', name: 'Corners only' },
  { id: 'edges', name: 'Edges only' },
  { id: '2gen', name: '2-gen <R,U>' },
];

export const EVENTS: EventDef[] = [
  { id: '333', name: '3x3x3 Cube', short: '3x3', puzzle: 'nxn', size: 3, format: 'ao5', scrambles: SUBSETS_333, wca: true, inspection: true },
  { id: '222', name: '2x2x2 Cube', short: '2x2', puzzle: 'nxn', size: 2, format: 'ao5', scrambles: [{ id: 'wca', name: 'WCA (random state)' }, { id: 'rm', name: 'Random move (11)' }], wca: true, inspection: true },
  { id: '444', name: '4x4x4 Cube', short: '4x4', puzzle: 'nxn', size: 4, format: 'ao5', scrambles: [{ id: 'wca', name: 'WCA (random state)' }], wca: true, inspection: true },
  { id: '555', name: '5x5x5 Cube', short: '5x5', puzzle: 'nxn', size: 5, format: 'ao5', scrambles: [{ id: 'wca', name: 'WCA (60 moves)' }], wca: true, inspection: true },
  { id: '666', name: '6x6x6 Cube', short: '6x6', puzzle: 'nxn', size: 6, format: 'mo3', scrambles: [{ id: 'wca', name: 'WCA (80 moves)' }], wca: true, inspection: true },
  { id: '777', name: '7x7x7 Cube', short: '7x7', puzzle: 'nxn', size: 7, format: 'mo3', scrambles: [{ id: 'wca', name: 'WCA (100 moves)' }], wca: true, inspection: true },
  { id: '333oh', name: '3x3x3 One-Handed', short: 'OH', puzzle: 'nxn', size: 3, format: 'ao5', scrambles: [WCA_333], wca: true, inspection: true },
  { id: '333bf', name: '3x3x3 Blindfolded', short: '3BLD', puzzle: 'nxn', size: 3, format: 'bo5', scrambles: [{ id: 'wca', name: 'WCA (random orientation)' }], wca: true, inspection: false },
  { id: '333fm', name: '3x3x3 Fewest Moves', short: 'FMC', puzzle: 'nxn', size: 3, format: 'mo3', scrambles: [{ id: 'wca', name: "WCA (R' U' F padded)" }], wca: true, inspection: false },
  { id: 'clock', name: 'Clock', short: 'Clock', puzzle: 'clock', format: 'ao5', scrambles: [{ id: 'wca', name: 'WCA (random state)' }], wca: true, inspection: true },
  { id: 'minx', name: 'Megaminx', short: 'Mega', puzzle: 'minx', format: 'ao5', scrambles: [{ id: 'wca', name: 'WCA (Pochmann, 70)' }], wca: true, inspection: true },
  { id: 'pyram', name: 'Pyraminx', short: 'Pyra', puzzle: 'pyram', format: 'ao5', scrambles: [{ id: 'wca', name: 'WCA (random state)' }], wca: true, inspection: true },
  { id: 'skewb', name: 'Skewb', short: 'Skewb', puzzle: 'skewb', format: 'ao5', scrambles: [{ id: 'wca', name: 'WCA (random state)' }], wca: true, inspection: true },
  { id: 'sq1', name: 'Square-1', short: 'Sq-1', puzzle: 'sq1', format: 'ao5', scrambles: [{ id: 'wca', name: 'WCA (random state)' }, { id: 'rm', name: 'Random move (20 slices)' }], wca: true, inspection: true },
  { id: '444bf', name: '4x4x4 Blindfolded', short: '4BLD', puzzle: 'nxn', size: 4, format: 'bo3', scrambles: [{ id: 'wca', name: 'WCA (random state + orientation)' }], wca: true, inspection: false },
  { id: '555bf', name: '5x5x5 Blindfolded', short: '5BLD', puzzle: 'nxn', size: 5, format: 'bo3', scrambles: [{ id: 'wca', name: 'WCA + orientation' }], wca: true, inspection: false },
  { id: '333mbf', name: '3x3x3 Multi-Blind', short: 'MBLD', puzzle: 'nxn', size: 3, format: 'bo3', scrambles: [{ id: 'wca', name: 'WCA (random orientation)' }], wca: true, inspection: false },
];

/** Virtual-cube sessions use these pseudo events. */
export const VIRTUAL_EVENTS: EventDef[] = [2, 3, 4, 5].map((n) => ({
  id: `v${n}${n}${n}`,
  name: `Virtual ${n}x${n}`,
  short: `V${n}`,
  puzzle: 'nxn' as const,
  size: n,
  format: 'ao5' as const,
  scrambles: [n <= 4 ? { id: 'wca', name: 'Random state' } : { id: 'rm', name: 'Random move (60)' }],
  wca: false,
  inspection: false,
}));

const ALL = [...EVENTS, ...VIRTUAL_EVENTS];

export function eventById(id: string): EventDef {
  return ALL.find((e) => e.id === id) ?? EVENTS[0];
}

/** Is the scramble for this event drawn on an NxN cube? */
export function cubeSize(ev: EventDef): number {
  return ev.puzzle === 'nxn' ? (ev.size ?? 3) : 0;
}
