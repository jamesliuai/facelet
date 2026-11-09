/**
 * Main-thread API for the scramble worker, with a small prefetch queue per
 * (event, type) so a fresh scramble is always ready the instant a solve ends.
 */
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'worker error'));
      pending.clear();
    };
  }
  return worker;
}

export function call<T>(kind: string, payload: unknown): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, kind, payload });
  });
}

const queues = new Map<string, Promise<string>[]>();
const key = (event: string, type: string) => `${event}|${type}`;

function request(event: string, type: string): Promise<string> {
  return call<string[]>('scramble', { event, type, count: 1 }).then((r) => r[0]);
}

/** Next scramble for an event/type; keeps `ahead` more in flight. */
export function nextScramble(event: string, type = 'wca', ahead = 1): Promise<string> {
  const k = key(event, type);
  let q = queues.get(k);
  if (!q) {
    q = [];
    queues.set(k, q);
  }
  const p = q.shift() ?? request(event, type);
  while (q.length < ahead) q.push(request(event, type));
  return p;
}

export function scrambles(event: string, type: string, count: number): Promise<string[]> {
  return call<string[]>('scramble', { event, type, count });
}

/** Build solver tables in the background before they are needed. */
export function warm(event: string, type = 'wca'): void {
  void call('warm', { event, type }).catch(() => {});
}
