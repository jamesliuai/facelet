<script lang="ts">
  import Modal from '../../components/Modal.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import Icon from '../../components/Icon.svelte';
  import Dropdown from '../../components/Dropdown.svelte';
  import { sessions } from '../../lib/store/sessions.svelte';
  import { settings } from '../../lib/store/settings.svelte';
  import { ui } from '../../lib/store/ui.svelte';
  import { formatSolve, formatTime, formatDate } from '../../lib/stats/format';
  import { scrambleSvg } from '../../lib/render/scramble-svg';
  import { eventById } from '../../lib/scramble/events';
  import { copyText } from '../../lib/commands';

  let {
    open = $bindable(false),
    solveId,
    focusComment = false,
    onclose,
  }: { open?: boolean; solveId: string; focusComment?: boolean; onclose?: () => void } = $props();

  let id = $state('');
  $effect(() => {
    if (open) id = solveId;
  });

  const idx = $derived(sessions.solves.findIndex((s) => s.id === id));
  const s = $derived(idx >= 0 ? sessions.solves[idx] : null);
  const ev = $derived(eventById(sessions.current?.event ?? '333'));
  let comment = $state('');
  let penalty = $state(0);
  $effect(() => {
    if (s) {
      comment = s.comment ?? '';
      penalty = s.penalty;
    }
  });

  let commentEl: HTMLTextAreaElement | undefined = $state();
  $effect(() => {
    if (open && focusComment) setTimeout(() => commentEl?.focus(), 60);
  });

  async function saveComment() {
    if (s && (s.comment ?? '') !== comment) await sessions.update(s.id, { comment: comment.trim() || undefined });
  }
  async function setPenalty(p: number) {
    if (s) await sessions.update(s.id, { penalty: p });
  }
  async function remove() {
    if (!s) return;
    const next = sessions.solves[idx + 1] ?? sessions.solves[idx - 1];
    await sessions.removeSolves([s.id]);
    ui.toast('Solve deleted', { label: 'Undo', run: () => void sessions.undoDelete() });
    if (next) id = next.id;
    else open = false;
  }
  async function moveTo(sessionId: string) {
    if (!s) return;
    await sessions.moveSolves([s.id], sessionId);
    ui.toast('Solve moved');
    open = false;
  }
  function go(d: number) {
    void saveComment();
    const t = sessions.solves[idx + d];
    if (t) id = t.id;
  }
  function summary(): string {
    if (!s) return '';
    return `${formatSolve(s, settings.precision, true)}   ${s.scramble}${s.comment ? `   // ${s.comment}` : ''}`;
  }

  const moveOptions = $derived(
    sessions
      .sorted()
      .filter((x) => x.id !== sessions.currentId && !x.event.startsWith('v'))
      .map((x) => ({ value: x.id, label: x.name, hint: eventById(x.event).short })),
  );
  const tps = $derived(s?.moves && s.time ? (s.moves / (s.time / 1000)).toFixed(2) : '');
</script>

<svelte:window
  onkeydown={(e) => {
    if (!open || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  }}
/>

<Modal bind:open title={s ? `Solve ${idx + 1}` : 'Solve'} subtitle={s ? formatDate(s.date) : ''} width={600} onclose={() => { void saveComment(); onclose?.(); }}>
  {#if s}
    <div class="top">
      <div class="time num">{formatSolve(s, settings.precision, true)}</div>
      <Segmented
        bind:value={penalty}
        options={[{ value: 0, label: 'OK' }, { value: 2000, label: '+2' }, { value: -1, label: 'DNF' }]}
        onchange={(p) => setPenalty(p)}
      />
    </div>

    <div class="meta num">
      {#if s.inspection != null}<div><span>Inspection</span>{formatTime(s.inspection, 2)}</div>{/if}
      {#if s.splits?.length}
        <div>
          <span>Splits</span>
          {#each [...s.splits, s.time] as sp, i}{i ? ' · ' : ''}{formatTime(i ? sp - s.splits[i - 1] : sp, settings.precision)}{/each}
        </div>
      {/if}
      {#if s.moves}<div><span>Moves</span>{s.moves} ETM · {tps} TPS</div>{/if}
      <div><span>Raw</span>{formatTime(s.time, 3)}</div>
    </div>

    <div class="scr">
      <div class="scr-head">
        <span class="label">Scramble</span>
        <button class="icon-btn sm" onclick={() => copyText(s!.scramble, 'Scramble copied')} aria-label="Copy scramble"><Icon name="copy" size={14} /></button>
      </div>
      <div class="scr-body">
        <p class="mono">{s.scramble || '—'}</p>
        {#if s.scramble}
          <div class="img">{@html scrambleSvg(ev.id, s.scramble, settings.cubeColors)}</div>
        {/if}
      </div>
    </div>

    <label class="label" for="cmt">Comment</label>
    <textarea id="cmt" class="input" rows="2" bind:this={commentEl} bind:value={comment} onblur={saveComment} placeholder="Notes about this solve…"></textarea>
  {/if}
  {#snippet footer()}
    <button class="btn ghost sm" onclick={remove}><Icon name="trash" size={14} />Delete</button>
    {#if moveOptions.length}
      <Dropdown up width={240}>
        {#snippet trigger({ toggle })}
          <button class="btn ghost sm" onclick={toggle}><Icon name="merge" size={14} />Move to…</button>
        {/snippet}
        {#snippet children({ close })}
          <div class="menu-head">Move this solve to</div>
          {#each moveOptions as o (o.value)}
            <button class="menu-item" onclick={() => { close(); void moveTo(o.value); }}><span>{o.label}</span><span class="hint">{o.hint}</span></button>
          {/each}
        {/snippet}
      </Dropdown>
    {/if}
    <button class="btn ghost sm" onclick={() => copyText(summary(), 'Copied')}><Icon name="copy" size={14} />Copy</button>
    <span class="grow"></span>
    <button class="icon-btn" onclick={() => go(-1)} disabled={idx <= 0} aria-label="Previous solve"><Icon name="left" /></button>
    <button class="icon-btn" onclick={() => go(1)} disabled={idx >= sessions.solves.length - 1} aria-label="Next solve"><Icon name="right" /></button>
  {/snippet}
</Modal>

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }
  .time {
    font-size: 44px;
    font-weight: 300;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 22px;
    font-size: 13px;
    color: var(--fg-2);
    margin-bottom: 16px;
  }
  .meta span {
    color: var(--fg-3);
    margin-right: 6px;
  }
  .scr {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 12px 12px;
    margin-bottom: 16px;
    background: var(--bg-2);
  }
  .scr-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .scr-body {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .scr-body p {
    flex: 1;
    margin: 4px 0 0;
    font-size: 13.5px;
    line-height: 1.6;
    white-space: pre-line;
    user-select: text;
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
  label {
    display: block;
    margin-bottom: 6px;
  }
  .grow {
    flex: 1;
  }
  :global(footer .icon-btn:disabled) {
    opacity: 0.3;
  }
  @media (max-width: 560px) {
    .scr-body {
      flex-direction: column;
    }
  }
</style>
