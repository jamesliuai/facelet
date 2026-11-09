<script lang="ts">
  import Modal from '../../components/Modal.svelte';
  import Icon from '../../components/Icon.svelte';
  import { sessions } from '../../lib/store/sessions.svelte';
  import { settings } from '../../lib/store/settings.svelte';
  import { formatSolve, formatTime, formatDate } from '../../lib/stats/format';
  import { parseAvgSpec, solveValue, trimCount, trimmedIndices, averageOf, sigmaOf } from '../../lib/stats/stats';
  import { eventById } from '../../lib/scramble/events';
  import { copyText } from '../../lib/commands';

  let { open = $bindable(false), label, end }: { open?: boolean; label: string; end: number } = $props();

  const data = $derived.by(() => {
    const spec = parseAvgSpec(label);
    if (!spec || !open) return null;
    const start = Math.max(0, end - spec.n + 1);
    const list = sessions.solves.slice(start, end + 1);
    const vals = list.map((s) => solveValue(s, settings.precision));
    const trim = spec.mean ? 0 : trimCount(spec.n, settings.trimPct);
    const trimmed = trimmedIndices(vals, trim);
    return { spec, start, list, trimmed, avg: averageOf(vals, trim, settings.precision), sigma: sigmaOf(vals, trim) };
  });

  function text(): string {
    if (!data) return '';
    const ev = eventById(sessions.current.event);
    const lines = [
      `Facelet · ${ev.name} · ${formatDate(data.list[data.list.length - 1]?.date ?? Date.now(), false)}`,
      `${label}: ${formatTime(data.avg, settings.precision)}${Number.isNaN(data.sigma) ? '' : ` (σ = ${(data.sigma / 1000).toFixed(2)})`}`,
      '',
      ...data.list.map((s, i) => {
        const t = formatSolve(s, settings.precision);
        return `${i + 1}. ${data.trimmed.has(i) ? `(${t})` : t}   ${s.scramble.replace(/\n/g, ' ')}${s.comment ? `   // ${s.comment}` : ''}`;
      }),
    ];
    return lines.join('\n');
  }
</script>

<Modal bind:open title={data ? `${label} · ${formatTime(data.avg, settings.precision)}` : label} subtitle={data ? `Solves ${data.start + 1}–${data.start + data.list.length}${Number.isNaN(data.sigma) ? '' : ` · σ ${(data.sigma / 1000).toFixed(2)}`}` : ''} width={640}>
  {#if data}
    <div class="list">
      {#each data.list as s, i (s.id)}
        <div class="row num">
          <span class="i">{i + 1}</span>
          <span class="t" class:trim={data.trimmed.has(i)}>{data.trimmed.has(i) ? `(${formatSolve(s, settings.precision)})` : formatSolve(s, settings.precision)}</span>
          <span class="s mono" title={s.scramble}>{s.scramble.replace(/\n/g, ' ')}</span>
        </div>
      {/each}
    </div>
  {/if}
  {#snippet footer()}
    <button class="btn sm" onclick={() => copyText(text(), 'Average copied')}><Icon name="copy" size={14} />Copy as text</button>
  {/snippet}
</Modal>

<style>
  .list {
    max-height: 56vh;
    overflow: auto;
    margin: 0 -8px;
  }
  .row {
    display: grid;
    grid-template-columns: 34px 92px 1fr;
    gap: 10px;
    align-items: baseline;
    padding: 6px 8px;
    border-radius: 8px;
    font-size: 13.5px;
  }
  .row:hover {
    background: var(--bg-2);
  }
  .i {
    color: var(--fg-4);
    font-size: 12px;
  }
  .t {
    font-weight: 500;
  }
  .t.trim {
    color: var(--fg-3);
    font-weight: 400;
  }
  .s {
    color: var(--fg-3);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
