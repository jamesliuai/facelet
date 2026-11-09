/** Sessions and solves: reactive store backed by IndexedDB. */
import * as db from './db';
import { uid } from '../rand';
import { settings } from './settings.svelte';
import { solveValue } from '../stats/stats';
import { StatsEngine, type PbEvent } from '../stats/engine';
import { eventById, EVENTS } from '../scramble/events';

export interface Solve {
  id: string;
  sessionId: string;
  time: number; // raw ms
  penalty: number; // 0, 2000, -1
  scramble: string;
  date: number; // ms epoch, when the solve finished
  comment?: string;
  splits?: number[]; // cumulative ms at the end of each phase except the last
  moves?: number; // virtual cube move count (ETM)
  inspection?: number; // ms of inspection used
  recon?: string; // virtual cube reconstruction: "move@ms move@ms …"
}

export interface Session {
  id: string;
  name: string;
  event: string;
  scrambleType: string;
  created: number;
  order: number;
}

class SessionStore {
  list: Session[] = $state([]);
  currentId = $state('');
  solves: Solve[] = $state.raw([]);
  version = $state(0);
  ready = $state(false);
  readonly engine = new StatsEngine();
  private undoStack: { solves: Solve[]; sessionId: string }[] = [];

  get current(): Session {
    return this.list.find((s) => s.id === this.currentId) ?? this.list[0];
  }

  get event() {
    return eventById(this.current?.event ?? '333');
  }

  sorted(): Session[] {
    return this.list.slice().sort((a, b) => a.order - b.order);
  }

  async init() {
    let list = await db.getAll<Session>('sessions');
    if (!list.length) {
      const s = this.newSession('333', '3x3', 0);
      await db.put('sessions', s);
      list = [s];
    }
    this.list = list;
    const want = settings.lastSessionId;
    const first = list.find((s) => s.id === want) ?? list.slice().sort((a, b) => a.order - b.order).find((s) => !s.event.startsWith('v')) ?? list[0];
    await this.select(first.id);
    this.ready = true;
  }

  private newSession(event: string, name: string, order: number): Session {
    const ev = eventById(event);
    return { id: uid(), name, event, scrambleType: ev.scrambles[0].id, created: Date.now(), order };
  }

  configureEngine() {
    this.engine.configure(trackedAverages(), settings.trimPct, settings.precision);
    this.rebuild();
  }

  rebuild() {
    this.engine.reset(this.solves.map((s) => solveValue(s, settings.precision)));
    this.version++;
  }

  async select(id: string) {
    const s = this.list.find((x) => x.id === id);
    if (!s) return;
    const solves = await db.getByIndex<Solve>('solves', 'session', id);
    solves.sort((a, b) => a.date - b.date);
    this.currentId = id;
    this.solves = solves;
    settings.lastSessionId = id;
    this.engine.configure(trackedAverages(), settings.trimPct, settings.precision);
    this.rebuild();
  }

  /** Switch to an event: most recently used session of that event, or a new one. */
  async selectEvent(event: string) {
    const existing = this.sorted().filter((s) => s.event === event);
    if (existing.length) {
      await this.select(existing[0].id);
      return;
    }
    await this.create(event);
  }

  /** Find (or create, without selecting) the most recent session of an event. */
  async ensureSession(event: string, name?: string): Promise<Session> {
    const existing = this.sorted().find((s) => s.event === event);
    if (existing) return existing;
    const ev = eventById(event);
    const s = this.newSession(event, name ?? ev.name, Math.max(0, ...this.list.map((x) => x.order)) + 1);
    await db.put('sessions', s);
    this.list = [...this.list, s];
    return s;
  }

  async create(event: string, name?: string): Promise<Session> {
    const ev = eventById(event);
    const sameEvent = this.list.filter((s) => s.event === event).length;
    const s = this.newSession(event, name ?? (sameEvent ? `${ev.short} ${sameEvent + 1}` : ev.short), Math.max(0, ...this.list.map((x) => x.order)) + 1);
    await db.put('sessions', s);
    this.list = [...this.list, s];
    await this.select(s.id);
    return s;
  }

  async patchSession(id: string, patch: Partial<Session>) {
    const s = this.list.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    await db.put('sessions', $state.snapshot(s));
  }

  async reorder(ids: string[]) {
    ids.forEach((id, i) => {
      const s = this.list.find((x) => x.id === id);
      if (s) s.order = i;
    });
    await db.putMany('sessions', this.list.map((s) => $state.snapshot(s)));
  }

  async deleteSession(id: string) {
    const solves = await db.getByIndex<Solve>('solves', 'session', id);
    await db.removeMany('solves', solves.map((s) => s.id));
    await db.remove('sessions', id);
    this.list = this.list.filter((s) => s.id !== id);
    if (!this.list.length) {
      const s = this.newSession('333', '3x3', 0);
      await db.put('sessions', s);
      this.list = [s];
    }
    if (this.currentId === id) await this.select(this.sorted()[0].id);
  }

  async merge(fromId: string, intoId: string) {
    const solves = await db.getByIndex<Solve>('solves', 'session', fromId);
    for (const s of solves) s.sessionId = intoId;
    await db.putMany('solves', solves);
    await db.remove('sessions', fromId);
    this.list = this.list.filter((s) => s.id !== fromId);
    await this.select(intoId);
  }

  // ---------------------------------------------------------------- solves

  async add(partial: Omit<Solve, 'id' | 'sessionId' | 'date'> & { date?: number }, sessionId = this.currentId): Promise<{ solve: Solve; pbs: PbEvent[] }> {
    const solve: Solve = { id: uid(), sessionId, date: Date.now(), ...partial };
    await db.put('solves', solve);
    let pbs: PbEvent[] = [];
    if (sessionId === this.currentId) {
      this.solves = [...this.solves, solve];
      pbs = this.engine.append(solveValue(solve, settings.precision));
      this.version++;
      if (this.solves.length <= settings.celebrateMin) pbs = [];
    }
    return { solve, pbs };
  }

  async update(id: string, patch: Partial<Solve>) {
    const i = this.solves.findIndex((s) => s.id === id);
    if (i < 0) return;
    const next = { ...this.solves[i], ...patch };
    await db.put('solves', next);
    const arr = this.solves.slice();
    arr[i] = next;
    this.solves = arr;
    if ('penalty' in patch || 'time' in patch) this.rebuild();
  }

  async removeSolves(ids: string[]) {
    const set = new Set(ids);
    const removed = this.solves.filter((s) => set.has(s.id));
    if (!removed.length) return;
    await db.removeMany('solves', ids);
    this.undoStack.push({ solves: removed, sessionId: this.currentId });
    if (this.undoStack.length > 20) this.undoStack.shift();
    this.solves = this.solves.filter((s) => !set.has(s.id));
    this.rebuild();
  }

  async undoDelete(): Promise<number> {
    const last = this.undoStack.pop();
    if (!last) return 0;
    await db.putMany('solves', last.solves);
    if (last.sessionId === this.currentId) {
      this.solves = [...this.solves, ...last.solves].sort((a, b) => a.date - b.date);
      this.rebuild();
    }
    return last.solves.length;
  }

  async moveSolves(ids: string[], toSession: string) {
    const set = new Set(ids);
    const moving = this.solves.filter((s) => set.has(s.id)).map((s) => ({ ...s, sessionId: toSession }));
    await db.putMany('solves', moving);
    this.solves = this.solves.filter((s) => !set.has(s.id));
    this.rebuild();
  }

  async clearCurrent() {
    await this.removeSolves(this.solves.map((s) => s.id));
  }

  /** Solves of any session (loads from disk). */
  async solvesOf(sessionId: string): Promise<Solve[]> {
    if (sessionId === this.currentId) return this.solves;
    const s = await db.getByIndex<Solve>('solves', 'session', sessionId);
    return s.sort((a, b) => a.date - b.date);
  }

  /** Solve count for every session (cheap index counts; the current one is in memory). */
  async counts(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    await Promise.all(
      this.list.map(async (s) => {
        out[s.id] = s.id === this.currentId ? this.solves.length : await db.countByIndex('solves', 'session', s.id);
      }),
    );
    return out;
  }

  /** Move a session one place up or down among the sessions of its event. */
  async move(id: string, dir: -1 | 1) {
    const all = this.sorted();
    const me = all.find((s) => s.id === id);
    if (!me) return;
    const group = all.filter((s) => s.event === me.event);
    const other = group[group.indexOf(me) + dir];
    if (!other) return;
    const order = all.map((s) => s.id);
    const i = order.indexOf(me.id);
    const j = order.indexOf(other.id);
    [order[i], order[j]] = [order[j], order[i]];
    await this.reorder(order);
  }

  async allSolves(): Promise<Solve[]> {
    return (await db.getAll<Solve>('solves')).sort((a, b) => a.date - b.date);
  }

  /** Bulk import (used by data import). */
  async importData(sessions: Session[], solves: Solve[]) {
    await db.putMany('sessions', sessions);
    for (let i = 0; i < solves.length; i += 2000) await db.putMany('solves', solves.slice(i, i + 2000));
    this.list = await db.getAll<Session>('sessions');
    await this.select(this.currentId && this.list.some((s) => s.id === this.currentId) ? this.currentId : sessions[0]?.id ?? this.list[0].id);
  }

  async wipe() {
    await db.clear('solves');
    await db.clear('sessions');
    await db.clear('kv');
    this.list = [];
    this.undoStack = [];
    await this.init();
  }
}

/** Every average some part of the UI shows: the panel, the list columns and the strip under the time. */
function trackedAverages(): string[] {
  return [...settings.avgList, ...settings.listColumns, ...settings.stripStats, 'mo3'];
}

export const sessions = new SessionStore();

/** Events that appear in the timer's event picker. */
export const TIMER_EVENTS = EVENTS;

// Rebuild statistics when the relevant settings change.
$effect.root(() => {
  let first = true;
  $effect(() => {
    const key = JSON.stringify([settings.avgList, settings.listColumns, settings.stripStats, settings.trimPct, settings.precision]);
    void key;
    if (first) {
      first = false;
      return;
    }
    if (sessions.ready) sessions.configureEngine();
  });
});
