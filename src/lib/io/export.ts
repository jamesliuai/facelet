/** Backup, CSV export, and import from Facelet backups or csTimer exports. */
import * as db from '../store/db';
import type { Session, Solve } from '../store/sessions.svelte';
import { settings, type Settings } from '../store/settings.svelte';
import { formatSolve } from '../stats/format';
import { eventById } from '../scramble/events';

export function download(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportSessionCsv(session: Session, solves: Solve[]) {
  const rows = [['No.', 'Time', 'Raw ms', 'Penalty', 'Scramble', 'Date', 'Comment']];
  solves.forEach((s, i) => {
    rows.push([
      String(i + 1),
      formatSolve(s, settings.precision),
      String(s.time),
      s.penalty < 0 ? 'DNF' : s.penalty > 0 ? '+2' : '',
      s.scramble.replace(/\n/g, ' '),
      new Date(s.date).toISOString(),
      s.comment ?? '',
    ]);
  });
  const name = `${session.name.replace(/[^\w-]+/g, '_')}-${stamp()}.csv`;
  download(name, rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
}

export interface Backup {
  app: 'facelet';
  version: 1;
  exported: string;
  settings: Partial<Settings>;
  sessions: Session[];
  solves: Solve[];
  kv: Record<string, unknown>;
}

const KV_KEYS = ['trainer', 'trainer-algs', 'vcube'];

export async function exportBackup(): Promise<number> {
  const [sessions, solves] = await Promise.all([db.getAll<Session>('sessions'), db.getAll<Solve>('solves')]);
  const kv: Record<string, unknown> = {};
  for (const k of KV_KEYS) {
    const v = await db.kvGet(k);
    if (v !== undefined) kv[k] = v;
  }
  const backup: Backup = {
    app: 'facelet',
    version: 1,
    exported: new Date().toISOString(),
    settings: JSON.parse(JSON.stringify(settings)),
    sessions,
    solves,
    kv,
  };
  download(`facelet-backup-${stamp()}.json`, JSON.stringify(backup));
  return solves.length;
}

// ------------------------------------------------------------------ import

const CS_EVENTS: Record<string, string> = {
  '333': '333', '333o': '333', '333wca': '333', '333ft': '333', '222so': '222', '222o': '222', '2223': '222', '222': '222',
  '444wca': '444', '444m': '444', '444': '444', '444o': '444', '555wca': '555', '555': '555', '666wca': '666', '666si': '666', '666p': '666',
  '777wca': '777', '777si': '777', '777p': '777', clkwca: 'clock', clko: 'clock', clk: 'clock', mgmp: 'minx', mgmo: 'minx', mgmc: 'minx',
  pyrso: 'pyram', pyro: 'pyram', pyrm: 'pyram', skbso: 'skewb', skbo: 'skewb', sqrs: 'sq1', sq1h: 'sq1', sq1t: 'sq1',
  '333ni': '333bf', '333fm': '333fm', '333oh': '333oh', '444bld': '444bf', '555bld': '555bf', r3ni: '333mbf',
};

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface ImportResult {
  sessions: Session[];
  solves: Solve[];
  settings?: Partial<Settings>;
  kv?: Record<string, unknown>;
  source: 'facelet' | 'cstimer';
}

export function parseImport(text: string): ImportResult {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (data && data.app === 'facelet') {
    return {
      source: 'facelet',
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      solves: Array.isArray(data.solves) ? data.solves : [],
      settings: data.settings,
      kv: data.kv,
    };
  }
  const keys = Object.keys(data ?? {}).filter((k) => /^session\d+$/.test(k));
  if (!keys.length) throw new Error('Unrecognised file. Expected a Facelet backup or a csTimer export.');
  let meta: Record<string, any> = {};
  try {
    const props = typeof data.properties === 'string' ? JSON.parse(data.properties) : data.properties ?? {};
    meta = typeof props.sessionData === 'string' ? JSON.parse(props.sessionData) : props.sessionData ?? {};
  } catch {
    meta = {};
  }
  const sessions: Session[] = [];
  const solves: Solve[] = [];
  for (const key of keys.sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7)))) {
    const idx = key.slice(7);
    let times = data[key];
    if (typeof times === 'string') {
      try {
        times = JSON.parse(times);
      } catch {
        times = [];
      }
    }
    if (!Array.isArray(times) || !times.length) continue;
    const m = meta[idx] ?? {};
    const scrType: string = m.opt?.scrType ?? m.scr ?? '333';
    const event = CS_EVENTS[scrType] ?? (scrType.startsWith('333') ? '333' : '333');
    const name = String(m.name ?? `csTimer ${idx}`);
    const sid = `cs-${idx}-${hash(name)}`;
    const ev = eventById(event);
    sessions.push({
      id: sid,
      name: /^\d+$/.test(name) ? `csTimer ${name}` : name,
      event,
      scrambleType: ev.scrambles[0].id,
      created: Date.now(),
      order: 1000 + (Number(m.rank) || parseInt(idx)),
    });
    for (const t of times) {
      if (!Array.isArray(t) || !Array.isArray(t[0])) continue;
      const [pen, total, ...rest] = t[0] as number[];
      if (typeof total !== 'number') continue;
      const ts = typeof t[3] === 'number' ? t[3] : 0;
      const splits = rest.length ? rest.slice().reverse() : undefined;
      solves.push({
        id: `cs-${idx}-${ts}-${total}-${hash(String(t[1] ?? ''))}`,
        sessionId: sid,
        time: Math.max(0, Math.round(total)),
        penalty: pen === -1 ? -1 : pen > 0 ? 2000 : 0,
        scramble: String(t[1] ?? ''),
        comment: t[2] ? String(t[2]) : undefined,
        date: ts ? ts * 1000 + Math.round(total) : Date.now(),
        ...(splits && splits.length ? { splits } : {}),
      });
    }
  }
  return { source: 'cstimer', sessions, solves };
}

export async function applyImport(r: ImportResult, restoreSettings = false) {
  if (r.kv) for (const [k, v] of Object.entries(r.kv)) await db.kvSet(k, v);
  if (restoreSettings && r.settings) {
    for (const [k, v] of Object.entries(r.settings)) {
      if (k in settings && k !== 'lastSessionId') (settings as any)[k] = v;
    }
  }
}
