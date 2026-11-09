/**
 * Unbiased random integers from the platform CSPRNG. Scrambles depend on this:
 * Math.random() is not good enough for uniform random-state generation.
 */
const buf = new Uint32Array(64);
let pos = buf.length;

function next32(): number {
  if (pos >= buf.length) {
    crypto.getRandomValues(buf);
    pos = 0;
  }
  return buf[pos++];
}

/** Uniform integer in [0, n). Rejection sampling avoids modulo bias. */
export function randInt(n: number): number {
  if (n <= 1) return 0;
  const limit = 0x100000000 - (0x100000000 % n);
  let x: number;
  do x = next32();
  while (x >= limit);
  return x % n;
}

export function randChoice<T>(arr: readonly T[]): T {
  return arr[randInt(arr.length)];
}

/** Fisher–Yates shuffle in place. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** Random permutation of 0..n-1. */
export function randPerm(n: number): number[] {
  return shuffle(Array.from({ length: n }, (_, i) => i));
}

export function permParity(p: ArrayLike<number>): number {
  let parity = 0;
  const n = p.length;
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = p[j]) {
      seen[j] = 1;
      len++;
    }
    parity ^= (len - 1) & 1;
  }
  return parity;
}

export function uid(): string {
  const a = new Uint32Array(3);
  crypto.getRandomValues(a);
  return Date.now().toString(36) + a[0].toString(36) + a[1].toString(36).slice(0, 4);
}
