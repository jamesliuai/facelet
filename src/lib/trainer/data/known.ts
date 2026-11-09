/**
 * Hand-curated algorithm sets (standard community algorithms). Every entry
 * is machine-checked by tests/algs.test.ts: F2L preserved, correct shape
 * category, and all cases distinct.
 */
export interface RawCase {
  name: string;
  group: string;
  algs: string[];
}

export const PLL: RawCase[] = [
  { name: 'Aa', group: 'Corners only', algs: ["x R' U R' D2 R U' R' D2 R2 x'", "x L2 D2 L' U' L D2 L' U L' x'"] },
  { name: 'Ab', group: 'Corners only', algs: ["x R2 D2 R U R' D2 R U' R x'", "x L U' L D2 L' U L D2 L2 x'"] },
  { name: 'E', group: 'Corners only', algs: ["x' R U' R' D R U R' D' R U R' D R U' R' D' x"] },
  { name: 'H', group: 'Edges only', algs: ['M2 U M2 U2 M2 U M2', "R2 U2 R U2 R2 U2 R2 U2 R U2 R2"] },
  { name: 'Ua', group: 'Edges only', algs: ["R U' R U R U R U' R' U' R2", "M2 U M U2 M' U M2"] },
  { name: 'Ub', group: 'Edges only', algs: ["R2 U R U R' U' R' U' R' U R'", "M2 U' M U2 M' U' M2"] },
  { name: 'Z', group: 'Edges only', algs: ["M' U M2 U M2 U M' U2 M2", "M2 U M2 U M' U2 M2 U2 M'"] },
  { name: 'F', group: 'Adjacent swap', algs: ["R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"] },
  { name: 'Ga', group: 'Adjacent swap', algs: ["R2 U R' U R' U' R U' R2 U' D R' U R D'"] },
  { name: 'Gb', group: 'Adjacent swap', algs: ["R' U' R U D' R2 U R' U R U' R U' R2 D"] },
  { name: 'Gc', group: 'Adjacent swap', algs: ["R2 U' R U' R U R' U R2 U D' R U' R' D"] },
  { name: 'Gd', group: 'Adjacent swap', algs: ["R U R' U' D R2 U' R U' R' U R' U R2 D'"] },
  { name: 'Ja', group: 'Adjacent swap', algs: ["x R2 F R F' R U2 r' U r U2 x'", "L' U' L F L' U' L U L F' L2 U L"] },
  { name: 'Jb', group: 'Adjacent swap', algs: ["R U R' F' R U R' U' R' F R2 U' R'"] },
  { name: 'Ra', group: 'Adjacent swap', algs: ["R U' R' U' R U R D R' U' R D' R' U2 R'"] },
  { name: 'Rb', group: 'Adjacent swap', algs: ["R2 F R U R U' R' F' R U2 R' U2 R"] },
  { name: 'T', group: 'Adjacent swap', algs: ["R U R' U' R' F R2 U' R' U' R U R' F'"] },
  { name: 'Na', group: 'Diagonal swap', algs: ["R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"] },
  { name: 'Nb', group: 'Diagonal swap', algs: ["R' U R U' R' F' U' F R U R' F R' F' R U' R"] },
  { name: 'V', group: 'Diagonal swap', algs: ["R' U R' U' y R' F' R2 U' R' U R' F R F"] },
  { name: 'Y', group: 'Diagonal swap', algs: ["F R U' R' U' R U R' F' R U R' U' R' F R F'"] },
];

const O = (n: number, group: string, ...algs: string[]): RawCase => ({ name: `OLL ${n}`, group, algs });

export const OLL: RawCase[] = [
  O(1, 'Dot', "R U2 R2 F R F' U2 R' F R F'"),
  O(2, 'Dot', "r U r' U2 r U2 R' U2 R U' r'", "F R U R' U' F' f R U R' U' f'"),
  O(3, 'Dot', "r' R2 U R' U r U2 r' U M'", "f R U R' U' f' U' F R U R' U' F'"),
  O(4, 'Dot', "M U' r U2 r' U' R U' R' M'", "f R U R' U' f' U F R U R' U' F'"),
  O(17, 'Dot', "F R' F' R2 r' U R U' R' U' M'", "R U R' U R' F R F' U2 R' F R F'"),
  O(18, 'Dot', "r U R' U R U2 r2 U' R U' R' U2 r"),
  O(19, 'Dot', "r' R U R U R' U' M' R' F R F'"),
  O(20, 'Dot', "r U R' U' M2 U R U' R' U' M'"),
  O(21, 'Cross', "R U2 R' U' R U R' U' R U' R'"),
  O(22, 'Cross', "R U2 R2 U' R2 U' R2 U2 R"),
  O(23, 'Cross', "R2 D' R U2 R' D R U2 R"),
  O(24, 'Cross', "r U R' U' r' F R F'"),
  O(25, 'Cross', "F' r U R' U' r' F R"),
  O(26, 'Cross', "R U2 R' U' R U' R'"),
  O(27, 'Cross', "R U R' U R U2 R'"),
  O(28, 'Corners oriented', "r U R' U' r' R U R U' R'"),
  O(57, 'Corners oriented', "R U R' U' M' U R U' r'"),
  O(33, 'T', "R U R' U' R' F R F'"),
  O(45, 'T', "F R U R' U' F'"),
  O(5, 'Square', "l' U2 L U L' U l"),
  O(6, 'Square', "r U2 R' U' R U' r'"),
  O(34, 'C', "R U R2 U' R' F R U R U' F'"),
  O(46, 'C', "R' U' R' F R F' U R"),
  O(36, 'W', "L' U' L U' L' U L U L F' L' F"),
  O(38, 'W', "R U R' U R U' R' U' R' F R F'"),
  O(31, 'P', "R' U' F U R U' R' F' R"),
  O(32, 'P', "L U F' U' L' U L F L'"),
  O(43, 'P', "F' U' L' U L F"),
  O(44, 'P', "F U R U' R' F'"),
  O(51, 'I', "F U R U' R' U R U' R' F'"),
  O(52, 'I', "R U R' U R U' B U' B' R'"),
  O(55, 'I', "R' F R U R U' R2 F' R2 U' R' U R U R'"),
  O(56, 'I', "r' U' r U' R' U R U' R' U R r' U r"),
  O(9, 'Fish', "R U R' U' R' F R2 U R' U' F'"),
  O(10, 'Fish', "R U R' U R' F R F' R U2 R'"),
  O(35, 'Fish', "R U2 R2 F R F' R U2 R'"),
  O(37, 'Fish', "F R' F' R U R U' R'"),
  O(13, 'Knight', "F U R U' R2 F' R U R U' R'"),
  O(14, 'Knight', "R' F R U R' F' R F U' F'"),
  O(15, 'Knight', "l' U' l L' U' L U l' U l"),
  O(16, 'Knight', "r U r' R U R' U' r U' r'"),
  O(29, 'Awkward', "R U R' U' R U' R' F' U' F R U R'"),
  O(30, 'Awkward', "F R' F R2 U' R' U' R U R' F2"),
  O(41, 'Awkward', "R U R' U R U2 R' F R U R' U' F'"),
  O(42, 'Awkward', "R' U' R U' R' U2 R F R U R' U' F'"),
  O(7, 'Lightning', "r U R' U R U2 r'"),
  O(8, 'Lightning', "l' U' L U' L' U2 l"),
  O(11, 'Lightning', "r U R' U R' F R F' R U2 r'"),
  O(12, 'Lightning', "M' R' U' R U' R' U2 R U' R r'"),
  O(39, 'Lightning', "L F' L' U' L U F U' L'"),
  O(40, 'Lightning', "R' F R U R' U' F' U R"),
  O(47, 'L', "R' U' R' F R F' R' F R F' U R"),
  O(48, 'L', "F R U R' U' R U R' U' F'"),
  O(49, 'L', "r U' r2 U r2 U r2 U' r"),
  O(50, 'L', "r' U r2 U' r2 U' r2 U r'"),
  O(53, 'L', "l' U2 L U L' U' L U L' U l"),
  O(54, 'L', "r U2 R' U' R U R' U' R U' r'"),
];

export const OLL2: RawCase[] = [
  { name: 'Line', group: 'Edges', algs: ["F R U R' U' F'"] },
  { name: 'Angle', group: 'Edges', algs: ["f R U R' U' f'", "F U R U' R' F'"] },
  { name: 'Dot', group: 'Edges', algs: ["F R U R' U' F' f R U R' U' f'"] },
  { name: 'Sune', group: 'Corners', algs: ["R U R' U R U2 R'"] },
  { name: 'Antisune', group: 'Corners', algs: ["R U2 R' U' R U' R'"] },
  { name: 'H', group: 'Corners', algs: ["R U2 R' U' R U R' U' R U' R'"] },
  { name: 'Pi', group: 'Corners', algs: ["R U2 R2 U' R2 U' R2 U2 R"] },
  { name: 'Headlights', group: 'Corners', algs: ["R2 D' R U2 R' D R U2 R"] },
  { name: 'Chameleon', group: 'Corners', algs: ["r U R' U' r' F R F'"] },
  { name: 'Bowtie', group: 'Corners', algs: ["F' r U R' U' r' F R"] },
];

export const PLL2: RawCase[] = [
  { name: 'Adjacent corners', group: 'Corners', algs: ["R U R' U' R' F R2 U' R' U' R U R' F'"] },
  { name: 'Diagonal corners', group: 'Corners', algs: ["F R U' R' U' R U R' F' R U R' U' R' F R F'"] },
  { name: 'Ua', group: 'Edges', algs: ["R U' R U R U R U' R' U' R2"] },
  { name: 'Ub', group: 'Edges', algs: ["R2 U R U R' U' R' U' R' U R'"] },
  { name: 'H', group: 'Edges', algs: ['M2 U M2 U2 M2 U M2'] },
  { name: 'Z', group: 'Edges', algs: ["M' U M2 U M2 U M' U2 M2"] },
];

export const OLL_EDGES: Record<string, 'dot' | 'line' | 'angle' | 'cross'> = {};
for (const c of OLL) {
  const n = parseInt(c.name.slice(4));
  OLL_EDGES[c.name] = [1, 2, 3, 4, 17, 18, 19, 20].includes(n)
    ? 'dot'
    : n >= 21 && n <= 27
      ? 'cross'
      : [13, 14, 15, 16, 33, 34, 39, 40, 45, 46, 51, 52, 55, 56, 57].includes(n)
        ? 'line'
        : 'angle';
}
