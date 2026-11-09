<script lang="ts">
  import { sessions } from '../../lib/store/sessions.svelte';
  import { settings } from '../../lib/store/settings.svelte';
  import { formatSolve, formatTime } from '../../lib/stats/format';
  import SolveModal from './SolveModal.svelte';
  import AverageModal from './AverageModal.svelte';

  const ROW = 30;
  let el: HTMLDivElement | undefined = $state();
  let top = $state(0);
  let height = $state(400);

  const n = $derived(sessions.solves.length);
  const cols = $derived.by(() => {
    void sessions.version;
    // De-duplicated: choosing the same average for both columns must not break the keyed list.
    return [...new Set(settings.listColumns)].map((l) => sessions.engine.seriesFor(l)).filter((s) => !!s);
  });
  const bestIdx = $derived.by(() => {
    void sessions.version;
    return sessions.engine.bestIndex;
  });

  const range = $derived.by(() => {
    const first = Math.max(0, Math.floor(top / ROW) - 6);
    const last = Math.min(n, Math.ceil((top + height) / ROW) + 6);
    const out: number[] = [];
    for (let p = first; p < last; p++) out.push(n - 1 - p);
    return out;
  });

  // The newest solve slides in at the top; the rest of the list makes room.
  let freshId = $state('');
  let prevN = -1;
  $effect(() => {
    const len = sessions.solves.length;
    const id = len ? sessions.solves[len - 1].id : '';
    if (prevN >= 0 && len === prevN + 1) freshId = id;
    prevN = len;
  });

  let openId = $state('');
  let openSolve = $state(false);
  let avgOpen = $state(false);
  let avgLabel = $state('ao5');
  let avgEnd = $state(0);

  function showSolve(i: number) {
    openId = sessions.solves[i].id;
    openSolve = true;
  }
  function showAvg(label: string, i: number) {
    avgLabel = label;
    avgEnd = i;
    avgOpen = true;
  }
</script>

<div class="wrap" style="--cols:{cols.length}">
  {#if n > 0}
    <div class="thead num">
      <span>#</span>
      <span>time</span>
      {#each cols as c (c!.label)}<span>{c!.label}</span>{/each}
    </div>
  {/if}
  {#if n === 0}
    <div class="empty">
      <div class="glyph" aria-hidden="true">{#each Array(9) as _, i}<i class:on={i === 4}></i>{/each}</div>
      <p>Your times will appear here</p>
      <p class="muted">Averages, bests and trends fill in as you solve.</p>
    </div>
  {:else}
    <div class="list" bind:this={el} onscroll={() => (top = el!.scrollTop)} bind:clientHeight={height}>
      <div class="spacer" style="height:{n * ROW}px">
        {#each range as i (sessions.solves[i]?.id ?? i)}
          {@const s = sessions.solves[i]}
          {#if s}
            <div class="row num" class:fresh={s.id === freshId} style="transform:translateY({(n - 1 - i) * ROW}px)">
              <span class="idx">{i + 1}</span>
              <button class="t" class:best={i === bestIdx} class:dnf={s.penalty < 0} onclick={() => showSolve(i)}>
                {formatSolve(s, settings.precision)}{#if s.comment}<span class="dot" title="Has comment"></span>{/if}
              </button>
              {#each cols as c (c!.label)}
                {@const v = c!.values[i]}
                <button class="a" class:best={i === c!.bestIndex} disabled={Number.isNaN(v)} onclick={() => showAvg(c!.label, i)}>
                  {Number.isNaN(v) ? '' : formatTime(v, settings.precision)}
                </button>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>

{#if openId}<SolveModal bind:open={openSolve} solveId={openId} />{/if}
<AverageModal bind:open={avgOpen} label={avgLabel} end={avgEnd} />

<style>
  .wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .thead,
  .row {
    display: grid;
    grid-template-columns: 46px 1fr repeat(var(--cols), 1fr);
    align-items: center;
    padding: 0 8px;
  }
  .thead {
    height: 30px;
    font-family: var(--mono);
    font-size: 9.5px;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    background: var(--bg-2);
  }
  .thead span:not(:first-child) {
    text-align: right;
    padding-right: 8px;
  }
  .thead span:first-child {
    padding-left: 6px;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
  }
  .spacer {
    position: relative;
  }
  .row {
    position: absolute;
    left: 0;
    right: 0;
    height: 30px;
    transition: transform 0.4s var(--glide);
  }
  .row.fresh {
    animation: row-in 0.5s var(--ease-out) both;
  }
  @keyframes row-in {
    from {
      opacity: 0;
      filter: blur(2px);
    }
  }
  .row:hover {
    background: var(--bg-2);
  }
  .row:hover .idx {
    color: var(--fg-3);
  }
  .idx {
    font-size: 11.5px;
    color: var(--fg-4);
    padding-left: 6px;
  }
  .t,
  .a {
    text-align: right;
    height: 26px;
    padding: 0 8px;
    border-radius: 6px;
    font-size: 13.5px;
    position: relative;
  }
  .t:hover,
  .a:hover:not(:disabled) {
    background: var(--bg-hover);
  }
  .a {
    color: var(--fg-3);
    font-size: 13px;
  }
  .a:disabled {
    cursor: default;
  }
  .best {
    font-weight: 650;
    color: var(--accent);
  }
  /* The session best wears a single facelet. */
  .t.best::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 50%;
    width: 5px;
    height: 5px;
    margin-top: -2.5px;
    border-radius: 1.5px;
    background: var(--accent);
  }
  .dnf {
    color: var(--fg-3);
  }
  .dot {
    position: absolute;
    top: 6px;
    right: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--fg-3);
  }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--fg-3);
    padding: 24px;
    text-align: center;
  }
  .empty p {
    margin: 4px 0 0;
    font-size: 13px;
  }
  .empty p:first-of-type {
    color: var(--fg-2);
    margin-top: 14px;
    font-weight: 500;
  }
  .glyph {
    display: grid;
    grid-template-columns: repeat(3, 9px);
    gap: 3px;
  }
  .glyph i {
    width: 9px;
    height: 9px;
    border-radius: 2.5px;
    background: var(--line-2);
  }
  .glyph i.on {
    background: var(--fg-3);
    animation: pulse 1.6s var(--ease-in-out) infinite alternate;
  }
  @keyframes pulse {
    from {
      opacity: 0.4;
    }
  }
</style>
