<script lang="ts">
  import Modal from '../../components/Modal.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import Icon from '../../components/Icon.svelte';
  import { trainer, type Status } from '../../lib/trainer/trainer.svelte';
  import { untrack } from 'svelte';
  import { caseState, algSolves, withPreAuf, type TCase, type TSet } from '../../lib/trainer/sets';
  import { caseSvg, faceColors } from '../../lib/render/case-svg';
  import { settings } from '../../lib/store/settings.svelte';
  import { formatTime } from '../../lib/stats/format';
  import { copyText } from '../../lib/commands';
  import { countMoves, isValidAlg } from '../../lib/cube/alg';

  let { open = $bindable(false), set, c }: { open?: boolean; set: TSet; c: TCase | null } = $props();

  let custom = $state('');
  let error = $state('');
  let status = $state<Status>('new');
  let note = $state('');
  // Reset only when a case opens; changing its status must not wipe what you're typing.
  $effect(() => {
    if (open && c) {
      const id = c.id;
      untrack(() => {
        custom = '';
        error = '';
        note = '';
        status = trainer.status(id);
      });
    }
  });

  const colors = $derived(faceColors(settings.cubeColors, settings.trainerYellowTop));
  const cstate = $derived(c ? caseState(c.algs[0]) : null);
  const svg = $derived(cstate ? caseSvg(cstate, set.view, colors, set.view === 'll-pll') : '');
  const main = $derived(c ? trainer.mainAlg(c) : '');
  const times = $derived(c ? trainer.timesOf(c.id).slice().reverse() : []);

  // Alternatives as they must be executed from the drawn angle (with any U turn they need up front).
  const alts = $derived.by(() => {
    if (!c || !cstate) return [];
    const out: { full: string; auf: string; alg: string }[] = [];
    for (const a of new Set([main, ...c.algs])) {
      if (a === main) {
        out.push({ full: a, auf: '', alg: a });
        continue;
      }
      const fit = withPreAuf(set, cstate, a);
      if (!fit) continue;
      const full = fit.auf ? `${fit.auf} ${fit.alg}` : fit.alg;
      if (!out.some((o) => o.full === full)) out.push({ full, ...fit });
    }
    return out;
  });

  function useAlg(full: string) {
    if (!c || !cstate) return;
    if (full !== c.algs[0] && !algSolves(set, cstate, full)) return;
    trainer.setCustom(c.id, full === c.algs[0] ? null : full);
  }
  function saveCustom() {
    if (!c || !cstate) return;
    const a = custom.trim();
    if (!a) return;
    note = '';
    if (!isValidAlg(a)) {
      error = "That isn't valid cube notation.";
      return;
    }
    const fit = withPreAuf(set, cstate, a);
    if (!fit) {
      error = "That algorithm doesn't solve this case, even with a U turn first.";
      return;
    }
    const full = fit.auf ? `${fit.auf} ${a}` : a;
    trainer.setCustom(c.id, full);
    if (fit.auf) note = `Saved with ${fit.auf} at the start, so it solves the case as drawn.`;
    custom = '';
    error = '';
  }
</script>

<Modal bind:open title={c?.name ?? ''} subtitle={c ? `${set.name} · ${c.group}` : ''} width={620}>
  {#if c}
    <div class="top">
      <div class="img">{@html svg}</div>
      <div class="side">
        <span class="label">Status</span>
        <Segmented bind:value={status} options={[{ value: 'new', label: 'New' }, { value: 'learning', label: 'Learning' }, { value: 'learned', label: 'Learned' }]} onchange={(v) => trainer.setStatus(c!.id, v)} size="sm" />
        <div class="kpi num">
          <div><span>attempts</span><b>{times.length}</b></div>
          <div><span>best</span><b>{formatTime(trainer.best(c.id), 2)}</b></div>
          <div><span>mean (12)</span><b>{formatTime(trainer.mean(c.id), 2)}</b></div>
        </div>
      </div>
    </div>

    <span class="label">Algorithms</span>
    <ul class="algs">
      {#each alts as a (a.full)}
        <li class:main={a.full === main}>
          <span class="mono">{#if a.auf}<span class="auf" title="Turn U first from the drawn angle">({a.auf})</span>{' '}{/if}{a.alg}</span>
          <span class="len num">{countMoves(a.alg).htm}</span>
          <button class="icon-btn sm" onclick={() => copyText(a.full, 'Algorithm copied')} aria-label="Copy"><Icon name="copy" size={13} /></button>
          {#if a.full !== main}
            <button class="btn sm ghost" onclick={() => useAlg(a.full)}>Use</button>
          {:else}
            <span class="chip">main</span>
          {/if}
        </li>
      {/each}
    </ul>

    <form class="custom" onsubmit={(e) => { e.preventDefault(); saveCustom(); }}>
      <input class="input mono" bind:value={custom} placeholder="Your own algorithm… (checked before saving)" spellcheck="false" />
      <button class="btn sm" type="submit">Save</button>
    </form>
    {#if error}<p class="err">{error}</p>{/if}
    {#if note}<p class="note">{note}</p>{/if}
    {#if trainer.data.custom[c.id]}
      <button class="link" onclick={() => trainer.setCustom(c!.id, null)}>Restore the default algorithm</button>
    {/if}

    {#if times.length}
      <span class="label">Recent times</span>
      <div class="times num">{#each times.slice(0, 24) as t}<span>{t < 0 ? 'DNF' : formatTime(t, 2)}</span>{/each}</div>
    {/if}
  {/if}
</Modal>

<style>
  .top {
    display: flex;
    gap: 22px;
    align-items: center;
    margin-bottom: 18px;
  }
  .img {
    width: 150px;
    flex: none;
  }
  .img :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }
  .kpi {
    display: flex;
    gap: 18px;
    margin-top: 6px;
  }
  .kpi div {
    display: flex;
    flex-direction: column;
  }
  .kpi span {
    font-size: 11px;
    color: var(--fg-3);
  }
  .kpi b {
    font-weight: 500;
    font-size: 16px;
  }
  .algs {
    list-style: none;
    padding: 0;
    margin: 6px 0 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .algs li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 8px 14px;
    border-bottom: 1px solid var(--line);
    font-size: 13.5px;
  }
  .algs li:last-child {
    border-bottom: 0;
  }
  .algs li .mono {
    flex: 1;
    user-select: text;
  }
  .algs li.main .mono {
    font-weight: 500;
  }
  .len {
    color: var(--fg-3);
    font-size: 12px;
  }
  .custom {
    display: flex;
    gap: 8px;
  }
  .err {
    font-size: 12.5px;
    margin: 8px 0 0;
  }
  .note {
    font-size: 12.5px;
    margin: 8px 0 0;
    color: var(--fg-3);
  }
  .auf {
    color: var(--fg-3);
  }
  @media (max-width: 520px) {
    .top {
      flex-direction: column;
      align-items: flex-start;
      gap: 14px;
    }
  }
  .link {
    margin-top: 8px;
    font-size: 12.5px;
    color: var(--fg-2);
    text-decoration: underline;
  }
  .times {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 13px;
    color: var(--fg-2);
    margin-top: 6px;
  }
  .label {
    display: block;
    margin-top: 4px;
  }
</style>
