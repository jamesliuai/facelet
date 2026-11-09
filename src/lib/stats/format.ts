import type { Precision, TimedSolve } from './stats';

/** 12.34 / 1:02.34 / 1:02:03.45. NaN → "–", Infinity → "DNF". */
export function formatTime(ms: number, precision: Precision = 2): string {
  if (Number.isNaN(ms)) return '–';
  if (!isFinite(ms)) return 'DNF';
  const neg = ms < 0;
  ms = Math.abs(ms);
  const unit = precision === 2 ? 10 : 1;
  const t = Math.floor(ms / unit);
  const frac = t % (precision === 2 ? 100 : 1000);
  const totalSec = Math.floor(t / (precision === 2 ? 100 : 1000));
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const fs = String(frac).padStart(precision, '0');
  let out: string;
  if (h > 0) out = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${fs}`;
  else if (m > 0) out = `${m}:${String(s).padStart(2, '0')}.${fs}`;
  else out = `${s}.${fs}`;
  return neg ? '-' + out : out;
}

/** Display a single solve with its penalty. */
export function formatSolve(s: TimedSolve, precision: Precision = 2, showDnfTime = false): string {
  if (s.penalty < 0) return showDnfTime ? `DNF(${formatTime(s.time, precision)})` : 'DNF';
  const base = precision === 2 ? Math.floor(s.time / 10) * 10 : s.time;
  return formatTime(base + s.penalty, precision) + (s.penalty > 0 ? '+' : '');
}

/** Coarse display while timing. */
export function formatRunning(ms: number, mode: 'full' | 'tenths' | 'seconds', precision: Precision): string {
  if (mode === 'seconds') {
    const s = Math.floor(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
  }
  if (mode === 'tenths') {
    const t = Math.floor(ms / 100);
    const s = Math.floor(t / 10);
    const str = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
    return `${str}.${t % 10}`;
  }
  return formatTime(ms, precision);
}

export interface ParsedEntry {
  time: number;
  penalty: number;
}

/**
 * Parse a typed time, csTimer style:
 *   "1234" → 12.34, "12345" → 1:23.45, "12.34", "1:23.45", "DNF", "12.34+" or "12.34 +2".
 * With precision 3, bare digits use the last three as milliseconds.
 */
export function parseTimeEntry(input: string, precision: Precision = 2): ParsedEntry | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  let penalty = 0;
  if (/^dnf/.test(s)) {
    const rest = s.replace(/^dnf\s*\(?/, '').replace(/\)$/, '').trim();
    const inner = rest ? parseTimeEntry(rest, precision) : null;
    return { time: inner?.time ?? 0, penalty: -1 };
  }
  if (/\+2?$/.test(s)) {
    penalty = 2000;
    s = s.replace(/\s*\+2?$/, '').trim();
  }
  let ms: number;
  if (/^\d+$/.test(s)) {
    const digits = s;
    const fracLen = precision;
    const frac = digits.slice(-fracLen).padStart(fracLen, '0');
    let rest = digits.slice(0, -fracLen) || '0';
    // rest is seconds, possibly with minutes and hours folded in: 12345 → 1:23.45
    let secs = 0;
    const parts: number[] = [];
    while (rest.length > 0) {
      parts.unshift(parseInt(rest.slice(-2), 10));
      rest = rest.slice(0, -2);
    }
    for (const p of parts) secs = secs * 60 + p;
    ms = secs * 1000 + parseInt(frac, 10) * (precision === 2 ? 10 : 1);
  } else if (/^(\d+:){0,2}\d+(\.\d+)?$/.test(s)) {
    const segs = s.split(':');
    let total = 0;
    for (let i = 0; i < segs.length - 1; i++) total = total * 60 + parseInt(segs[i], 10);
    total = total * 60 + parseFloat(segs[segs.length - 1]);
    if (segs.length === 1) total = parseFloat(segs[0]);
    ms = Math.round(total * 1000);
  } else {
    return null;
  }
  if (!isFinite(ms) || ms <= 0) return null;
  return { time: ms, penalty };
}

export function formatDate(ts: number, withTime = true): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
