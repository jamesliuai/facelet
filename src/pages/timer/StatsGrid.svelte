<script lang="ts">
  import { sessions } from '../../lib/store/sessions.svelte';
  import { settings } from '../../lib/store/settings.svelte';
  import { formatTime } from '../../lib/stats/format';
  import AverageModal from './AverageModal.svelte';
  import SolveModal from './SolveModal.svelte';
  import { timer } from '../../lib/timer/timer.svelte';

  const e = sessions.engine;
  const rows = $derived.by(() => {
    void sessions.version;
    const n = e.count;
    const out: { label: string; cur: number; best: number; curEnd: number; bestEnd: number; n: number }[] = [
      { label: 'single', cur: n ? e.values[n - 1] : NaN, best: e.best, curEnd: n - 1, bestEnd: e.bestIndex, n: 1 },
    ];
    for (const l of settings.avgList) {
      const s = e.seriesFor(l);
      if (!s) continue;
      if (n < s.spec.n && out.length > 3) continue;
      out.push({ label: l, cur: e.current(l), best: s.best, curEnd: n - 1, bestEnd: s.bestIndex, n: s.spec.n });
    }
    return out;
  });

  let avgOpen = $state(false);
  let avgLabel = $state('ao5');
  let avgEnd = $state(0);
  let solveOpen = $state(false);
  let solveId = $state('');

  function open(r: (typeof rows)[number], which: 'cur' | 'best') {
    const end = which === 'cur' ? r.curEnd : r.bestEnd;
    if (end < 0 || Number.isNaN(which === 'cur' ? r.cur : r.best)) return;
    if (r.n === 1) {
      solveId = sessions.solves[end]?.id ?? '';
      solveOpen = !!solveId;
    } else {
      avgLabel = r.label;
      avgEnd = end;
      avgOpen = true;
    }
  }
</script>

<div class="grid num" role="table" aria-label="Statistics">
  <div class="head" role="row">
    <span></span><span>current</span><span>best</span>
  </div>
  {#each rows as r (r.label)}
    <div class="row" role="row" class:pb={timer.lastPbs.includes(r.label) && r.bestEnd === r.curEnd}>
      <span class="lbl">{r.label}</span>
      <button class="cell" onclick={() => open(r, 'cur')} disabled={Number.isNaN(r.cur)}>{formatTime(r.cur, settings.precision)}</button>
      <button class="cell best" onclick={() => open(r, 'best')} disabled={Number.isNaN(r.best)}>{formatTime(r.best, settings.precision)}</button>
    </div>
  {/each}
</div>

<AverageModal bind:open={avgOpen} label={avgLabel} end={avgEnd} />
{#if solveId}<SolveModal bind:open={solveOpen} {solveId} />{/if}

<style>
  .grid {
    padding: 2px 8px 8px;
  }
  .head,
  .row {
    display: grid;
    grid-template-columns: 76px 1fr 1fr;
    align-items: center;
  }
  .head {
    font-family: var(--mono);
    font-size: 9.5px;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    padding: 0 8px 4px;
  }
  .head span:not(:first-child) {
    text-align: right;
    padding-right: 8px;
  }
  .lbl {
    font-size: 12.5px;
    color: var(--fg-3);
    padding-left: 8px;
    white-space: nowrap;
  }
  .cell {
    text-align: right;
    height: 28px;
    padding: 0 8px;
    border-radius: 7px;
    font-size: 14px;
    color: var(--fg-2);
    transition: background 0.12s, color 0.12s;
  }
  .cell:hover:not(:disabled) {
    background: var(--bg-hover);
  }
  .cell:disabled {
    color: var(--fg-4);
    cursor: default;
  }
  .cell.best {
    font-weight: 600;
    color: var(--fg);
  }
  .row.pb .cell.best {
    color: var(--accent);
  }
  .row.pb .lbl::after {
    content: 'PB';
    margin-left: 6px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    padding: 1px 4px;
    border-radius: 4px;
    color: var(--accent-fg);
    background: var(--accent);
    vertical-align: 1px;
  }
</style>
