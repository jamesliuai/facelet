<script lang="ts">
  import Select from '../../components/Select.svelte';
  import Dropdown from '../../components/Dropdown.svelte';
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import StatsGrid from './StatsGrid.svelte';
  import SolveList from './SolveList.svelte';
  import { sessions } from '../../lib/store/sessions.svelte';
  import { settings } from '../../lib/store/settings.svelte';
  import { ui } from '../../lib/store/ui.svelte';
  import { eventById } from '../../lib/scramble/events';
  import { formatTime, formatDuration } from '../../lib/stats/format';

  // Sessions of the current event first, then the rest grouped by event.
  const options = $derived.by(() => {
    const cur = sessions.current?.event;
    const list = sessions.sorted().filter((s) => !s.event.startsWith('v'));
    const mine = list.filter((s) => s.event === cur);
    const rest = list.filter((s) => s.event !== cur).sort((a, b) => eventById(a.event).name.localeCompare(eventById(b.event).name) || a.order - b.order);
    return [...mine, ...rest].map((s) => ({ value: s.id, label: s.name, group: eventById(s.event).name }));
  });

  let renameOpen = $state(false);
  let renameText = $state('');
  let confirmKind: 'clear' | 'delete' | null = $state(null);
  let mergeOpen = $state(false);
  let mergeTarget = $state('');

  const mergeOptions = $derived(options.filter((o) => o.value !== sessions.currentId));

  function startRename() {
    renameText = sessions.current.name;
    renameOpen = true;
  }
  async function doRename() {
    if (renameText.trim()) await sessions.patchSession(sessions.current.id, { name: renameText.trim() });
    renameOpen = false;
  }
  async function doConfirm() {
    if (confirmKind === 'clear') {
      const n = sessions.solves.length;
      await sessions.clearCurrent();
      ui.toast(`Cleared ${n} solves`, { label: 'Undo', run: () => void sessions.undoDelete() });
    } else if (confirmKind === 'delete') {
      const name = sessions.current.name;
      await sessions.deleteSession(sessions.current.id);
      ui.toast(`Deleted “${name}”`);
    }
    confirmKind = null;
  }
  async function doMerge() {
    if (!mergeTarget) return;
    await sessions.merge(sessions.currentId, mergeTarget);
    mergeOpen = false;
    ui.toast('Sessions merged');
  }

  const e = sessions.engine;
  const summary = $derived.by(() => {
    void sessions.version;
    return { count: e.count, dnf: e.dnf, mean: e.mean, sd: e.sd };
  });

  // Today's practice in this session (scans back from the newest solve only).
  const today = $derived.by(() => {
    void sessions.version;
    if (!settings.showToday) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t0 = start.getTime();
    const list = sessions.solves;
    let n = 0;
    let first = 0;
    for (let i = list.length - 1; i >= 0 && list[i].date >= t0; i--) {
      n++;
      first = list[i].date;
    }
    if (!n) return null;
    return { n, span: list[list.length - 1].date - first };
  });
</script>

<div class="panel">
  <header>
    <div class="sel">
      <Select options={options} value={sessions.currentId} onchange={(id) => sessions.select(id)} label="Session" width={280} plain />
    </div>
    <button class="icon-btn" title="New session" aria-label="New session" onclick={() => sessions.create(sessions.current.event).then(() => ui.toast('New session'))}><Icon name="plus" size={17} /></button>
    <Dropdown align="end" width={224}>
      {#snippet trigger({ toggle })}
        <button class="icon-btn" onclick={toggle} aria-label="Session options"><Icon name="more" size={18} /></button>
      {/snippet}
      {#snippet children({ close })}
        <button class="menu-item" onclick={() => { close(); ui.sessionsOpen = true; }}><Icon name="list" size={15} />Manage sessions…</button>
        <button class="menu-item" onclick={() => { close(); startRename(); }}><Icon name="edit" size={15} />Rename</button>
        <button class="menu-item" onclick={() => { close(); mergeTarget = mergeOptions[0]?.value ?? ''; mergeOpen = true; }} disabled={!mergeOptions.length}><Icon name="merge" size={15} />Merge into…</button>
        <button class="menu-item" onclick={async () => { close(); (await import('../../lib/io/export')).exportSessionCsv(sessions.current, sessions.solves); }} disabled={!sessions.solves.length}><Icon name="download" size={15} />Export CSV</button>
        <div class="menu-sep"></div>
        <button class="menu-item" onclick={() => { close(); confirmKind = 'clear'; }} disabled={!sessions.solves.length}><Icon name="refresh" size={15} />Clear solves</button>
        <button class="menu-item" onclick={() => { close(); confirmKind = 'delete'; }}><Icon name="trash" size={15} />Delete session</button>
      {/snippet}
    </Dropdown>
  </header>

  {#if summary.count}
    <StatsGrid />
    <div class="summary num">
      <span><b>{summary.count - summary.dnf}</b>/{summary.count} solves</span>
      <span>mean <b>{formatTime(summary.mean, settings.precision)}</b></span>
      <span>σ <b>{Number.isNaN(summary.sd) ? '–' : (summary.sd / 1000).toFixed(2)}</b></span>
    </div>
  {/if}

  <SolveList />

  {#if today}
    <footer class="today num">
      <span class="dot"></span>Today <b>{today.n}</b> {today.n === 1 ? 'solve' : 'solves'}{#if today.span > 60_000}<span class="muted">{` · ${formatDuration(today.span)}`}</span>{/if}
    </footer>
  {/if}
</div>

<Modal bind:open={renameOpen} title="Rename session" width={420}>
  <!-- svelte-ignore a11y_autofocus -->
  <input class="input" bind:value={renameText} autofocus onkeydown={(e) => e.key === 'Enter' && doRename()} />
  {#snippet footer()}
    <button class="btn ghost" onclick={() => (renameOpen = false)}>Cancel</button>
    <button class="btn primary" onclick={doRename}>Save</button>
  {/snippet}
</Modal>

<Modal bind:open={mergeOpen} title="Merge session" subtitle="Moves every solve from this session into another, then removes this one." width={440}>
  <Select options={mergeOptions} bind:value={mergeTarget} width={300} />
  {#snippet footer()}
    <button class="btn ghost" onclick={() => (mergeOpen = false)}>Cancel</button>
    <button class="btn primary" onclick={doMerge}>Merge</button>
  {/snippet}
</Modal>

<Modal open={confirmKind !== null} onclose={() => (confirmKind = null)} title={confirmKind === 'delete' ? 'Delete session?' : 'Clear all solves?'} width={420}>
  <p class="confirm">
    {#if confirmKind === 'delete'}
      “{sessions.current?.name}” and its {sessions.solves.length} solves will be removed from this device.
    {:else}
      All {sessions.solves.length} solves in “{sessions.current?.name}” will be removed. You can undo right after.
    {/if}
  </p>
  {#snippet footer()}
    <button class="btn ghost" onclick={() => (confirmKind = null)}>Cancel</button>
    <button class="btn primary" onclick={doConfirm}>{confirmKind === 'delete' ? 'Delete' : 'Clear'}</button>
  {/snippet}
</Modal>

<style>
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 12px 10px 8px 8px;
  }
  .sel {
    flex: 1;
    min-width: 0;
  }
  .sel :global(.dd),
  .sel :global(.sel) {
    max-width: 100%;
  }
  /* The session name is set in the display face. */
  .sel :global(.sel) {
    font-family: var(--display);
    font-size: 22px;
    font-weight: 400;
    letter-spacing: -0.01em;
    height: 38px;
    padding-left: 10px;
    border-radius: 11px;
  }
  :global(:root[data-heading='sans']) .sel :global(.sel) {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .summary {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 0 10px;
    padding: 10px 6px;
    font-size: 12px;
    color: var(--fg-3);
    border-top: 1px dashed var(--line-2);
  }
  .summary b {
    font-weight: 500;
    color: var(--fg);
  }
  .today {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 11px 16px 12px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--fg-3);
    background: var(--bg-2);
  }
  .today b {
    font-weight: 600;
    color: var(--fg-2);
  }
  .today .dot {
    width: 6px;
    height: 6px;
    border-radius: 2px;
    background: var(--accent);
    margin-right: 3px;
    animation: live 2.4s var(--ease-in-out) infinite;
  }
  @keyframes live {
    50% {
      opacity: 0.35;
    }
  }
  .confirm {
    margin: 0;
    color: var(--fg-2);
  }
  :global(.menu-item:disabled) {
    opacity: 0.4;
    pointer-events: none;
  }
</style>
