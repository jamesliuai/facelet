<script lang="ts">
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import Select from './Select.svelte';
  import { ui } from '../lib/store/ui.svelte';
  import { sessions, type Session } from '../lib/store/sessions.svelte';
  import { EVENTS, eventById } from '../lib/scramble/events';
  import { router } from '../lib/router.svelte';
  import { isTouchDevice } from '../lib/device';

  let counts: Record<string, number> = $state({});
  let editing = $state('');
  let draft = $state('');
  let confirmDelete: Session | null = $state(null);
  let newEvent = $state('333');
  let query = $state('');

  $effect(() => {
    if (!ui.sessionsOpen) return;
    newEvent = sessions.current?.event ?? '333';
    query = '';
    void sessions.counts().then((c) => (counts = c));
  });

  // Grouped by event, in WCA event order; virtual-cube sessions live on the Cube page.
  const groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = sessions.sorted().filter((s) => !s.event.startsWith('v') && (!q || s.name.toLowerCase().includes(q) || eventById(s.event).name.toLowerCase().includes(q)));
    return EVENTS.map((ev) => ({ ev, items: list.filter((s) => s.event === ev.id) })).filter((g) => g.items.length);
  });
  const total = $derived(Object.values(counts).reduce((a, b) => a + b, 0));

  function startEdit(s: Session) {
    editing = s.id;
    draft = s.name;
  }
  async function commitEdit() {
    const id = editing;
    editing = '';
    if (id && draft.trim()) await sessions.patchSession(id, { name: draft.trim() });
  }
  async function open(s: Session) {
    await sessions.select(s.id);
    ui.sessionsOpen = false;
    router.go('timer');
  }
  async function create() {
    const s = await sessions.create(newEvent);
    counts = { ...counts, [s.id]: 0 };
    ui.toast(`Created “${s.name}”`);
  }
  async function doDelete() {
    const s = confirmDelete;
    confirmDelete = null;
    if (!s) return;
    await sessions.deleteSession(s.id);
    counts = await sessions.counts();
    ui.toast(`Deleted “${s.name}”`);
  }
  const eventOptions = EVENTS.map((e) => ({ value: e.id, label: e.name, hint: e.short }));
</script>

<Modal bind:open={ui.sessionsOpen} title="Sessions" subtitle="{sessions.list.filter((s) => !s.event.startsWith('v')).length} sessions · {total.toLocaleString()} solves" width={620}>
  <div class="tools">
    <div class="search">
      <Icon name="search" size={15} />
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" placeholder="Filter sessions" bind:value={query} aria-label="Filter sessions" autofocus={!isTouchDevice} />
    </div>
    <div class="new">
      <Select options={eventOptions} bind:value={newEvent} size="sm" align="end" width={240} label="Event for the new session" />
      <button class="btn sm primary" onclick={create}><Icon name="plus" size={14} />New</button>
    </div>
  </div>

  {#each groups as g (g.ev.id)}
    <div class="group">
      <div class="gh"><span>{g.ev.name}</span><span class="muted num">{g.items.reduce((a, s) => a + (counts[s.id] ?? 0), 0).toLocaleString()}</span></div>
      {#each g.items as s, i (s.id)}
        <div class="row" class:current={s.id === sessions.currentId}>
          {#if editing === s.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="input rename"
              bind:value={draft}
              autofocus
              onkeydown={(e) => {
                if (e.key === 'Enter') void commitEdit();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  editing = '';
                }
              }}
              onblur={commitEdit}
              aria-label="Session name"
            />
          {:else}
            <button class="name" onclick={() => open(s)} title="Open">
              {#if s.id === sessions.currentId}<span class="cur" aria-label="Current"></span>{/if}
              <span class="t">{s.name}</span>
            </button>
          {/if}
          <span class="count num">{counts[s.id] == null ? '' : counts[s.id].toLocaleString()}</span>
          <div class="acts">
            <button class="icon-btn sm" onclick={() => sessions.move(s.id, -1)} disabled={i === 0} aria-label="Move up"><Icon name="up" size={14} /></button>
            <button class="icon-btn sm" onclick={() => sessions.move(s.id, 1)} disabled={i === g.items.length - 1} aria-label="Move down"><Icon name="down" size={14} /></button>
            <button class="icon-btn sm" onclick={() => startEdit(s)} aria-label="Rename"><Icon name="edit" size={14} /></button>
            <button class="icon-btn sm" onclick={() => (confirmDelete = s)} aria-label="Delete"><Icon name="trash" size={14} /></button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="muted empty">No sessions match “{query}”.</p>
  {/each}
</Modal>

<Modal open={confirmDelete !== null} onclose={() => (confirmDelete = null)} title="Delete session?" width={420}>
  <p class="confirm">“{confirmDelete?.name}” and its {(counts[confirmDelete?.id ?? ''] ?? 0).toLocaleString()} solves will be removed from this device.</p>
  {#snippet footer()}
    <button class="btn ghost" onclick={() => (confirmDelete = null)}>Cancel</button>
    <button class="btn primary" onclick={doDelete}>Delete</button>
  {/snippet}
</Modal>

<style>
  .tools {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .search {
    position: relative;
    flex: 1 1 200px;
    display: flex;
    align-items: center;
  }
  .search :global(.icon) {
    position: absolute;
    left: 10px;
    color: var(--fg-3);
  }
  .search .input {
    padding-left: 32px;
    height: 32px;
  }
  .new {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .group {
    margin-bottom: 12px;
  }
  .gh {
    display: flex;
    justify-content: space-between;
    padding: 6px 8px 4px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-3);
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 0 4px 0 0;
    border-radius: 9px;
  }
  .row:hover {
    background: var(--bg-2);
  }
  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    height: 34px;
    padding: 0 8px;
    min-width: 0;
    font-size: 13.5px;
  }
  .name .t {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .current .name {
    font-weight: 600;
  }
  .cur {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    flex: none;
  }
  .rename {
    height: 30px;
    margin-left: 4px;
  }
  .count {
    font-size: 12.5px;
    color: var(--fg-3);
    min-width: 48px;
    text-align: right;
  }
  .acts {
    display: flex;
    gap: 0;
    opacity: 0.35;
    transition: opacity 0.15s;
  }
  .row:hover .acts,
  .row:focus-within .acts {
    opacity: 1;
  }
  .acts :global(button:disabled) {
    opacity: 0.25;
    pointer-events: none;
  }
  .confirm {
    margin: 0;
    color: var(--fg-2);
  }
  .empty {
    text-align: center;
    padding: 20px;
  }
  @media (hover: none) {
    .acts {
      opacity: 1;
    }
  }
</style>
