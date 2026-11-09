<script lang="ts">
  import Select from '../../components/Select.svelte';
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import SessionSheet from './SessionSheet.svelte';
  import { EVENTS } from '../../lib/scramble/events';
  import { sessions } from '../../lib/store/sessions.svelte';
  import { settings } from '../../lib/store/settings.svelte';
  import { ui } from '../../lib/store/ui.svelte';
  import { timer } from '../../lib/timer/timer.svelte';
  import { copyText } from '../../lib/commands';
  import { isValidAlg } from '../../lib/cube/alg';
  import { scrambleSvg } from '../../lib/render/scramble-svg';

  let editing = $state(false);
  let draft = $state('');
  let preview = $state(false);

  export function edit() {
    draft = timer.scramble;
    editing = true;
  }

  const ev = $derived(sessions.event);
  let narrow = $state(typeof matchMedia !== 'undefined' && matchMedia('(max-width: 720px)').matches);
  $effect(() => {
    const mq = matchMedia('(max-width: 720px)');
    const on = () => (narrow = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });
  const eventOptions = $derived(EVENTS.map((e) => ({ value: e.id, label: narrow ? e.short : e.name, hint: narrow ? '' : e.short })));
  const typeOptions = $derived(ev.scrambles.map((s) => ({ value: s.id, label: narrow ? s.name.replace(/\s*\(.*\)$/, '') : s.name })));
  const isNxn = $derived(ev.puzzle === 'nxn' && ev.id !== '333mbf');
  const draftValid = $derived(!isNxn || !draft.trim() || isValidAlg(draft));

  const len = $derived(timer.scramble.length);
  const multiline = $derived(timer.scramble.includes('\n'));
  const fs = $derived(
    (narrow ? 19 : 22) * settings.scrambleSize * (len > 420 ? 0.6 : len > 300 ? 0.68 : len > 200 ? 0.78 : len > 120 ? 0.9 : 1),
  );
  const svg = $derived(preview && timer.scramble && ev.id !== '333mbf' ? scrambleSvg(ev.id, timer.scramble, settings.cubeColors) : '');

  async function onEvent(id: string) {
    await sessions.selectEvent(id);
  }
  async function onType(id: string) {
    await sessions.patchSession(sessions.current.id, { scrambleType: id });
  }
  function save() {
    if (!draftValid) return;
    if (draft.trim()) timer.setCustom(draft);
    editing = false;
  }
</script>

<div class="bar">
  <div class="row">
    <div class="pickers">
      <Select options={eventOptions} value={ev.id} onchange={onEvent} label="Event" width={260} />
      {#if typeOptions.length > 1}
        <Select options={typeOptions} value={sessions.current.scrambleType} onchange={onType} label="Scramble type" width={260} />
      {/if}
      {#if ev.id === '333mbf'}
        <div class="mbld">
          <button class="icon-btn sm" onclick={() => { timer.mbldCount = Math.max(2, timer.mbldCount - 1); void timer.newScramble(); }} aria-label="Fewer cubes"><Icon name="left" size={14} /></button>
          <span class="num">{timer.mbldCount} cubes</span>
          <button class="icon-btn sm" onclick={() => { timer.mbldCount = Math.min(60, timer.mbldCount + 1); void timer.newScramble(); }} aria-label="More cubes"><Icon name="right" size={14} /></button>
        </div>
      {/if}
      {#if timer.custom}<span class="chip">Custom</span>{/if}
    </div>
    <div class="actions">
      <button class="icon-btn session-btn" onclick={() => (ui.sheetOpen = true)} aria-label="Session and times" title="Session"><Icon name="list" size={17} /></button>
      <button class="icon-btn" onclick={() => timer.prevScramble()} disabled={timer.histPos <= 0} aria-label="Previous scramble" title="Previous scramble (Alt ←)"><Icon name="left" size={17} /></button>
      <button class="icon-btn" onclick={() => timer.nextScrambleOrNew()} aria-label="Next scramble" title="Next scramble (Alt →)"><Icon name="right" size={17} /></button>
      <button class="icon-btn preview-btn" onclick={() => (preview = true)} disabled={!timer.scramble || ev.id === '333mbf'} aria-label="Scramble preview" title="Preview"><Icon name="image" size={16} /></button>
      <button class="icon-btn" onclick={() => copyText(timer.scramble, 'Scramble copied')} disabled={!timer.scramble} aria-label="Copy scramble" title="Copy (Alt C)"><Icon name="copy" size={16} /></button>
      <button class="icon-btn" onclick={edit} aria-label="Edit scramble" title="Edit (Alt E)"><Icon name="edit" size={16} /></button>
    </div>
  </div>
  <div
    class="scramble"
    class:mono={settings.scrambleFont === 'mono'}
    class:multiline
    class:loading={timer.loading}
    style="font-size:{fs}px"
    aria-live="polite"
  >
    {#if timer.scramble}{#key timer.scramble}<span class="txt">{timer.scramble}</span>{/key}{:else}<span class="ph" aria-label="Generating scramble"><i></i><i></i><i></i></span>{/if}
  </div>
</div>

<Modal bind:open={editing} title="Edit scramble" subtitle="Paste or type any scramble. It's used for the next solve." width={560}>
  <!-- svelte-ignore a11y_autofocus -->
  <textarea class="input mono" rows="5" bind:value={draft} spellcheck="false" autofocus onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}></textarea>
  {#if !draftValid}<p class="err">That doesn't parse as cube notation.</p>{/if}
  {#snippet footer()}
    <button class="btn ghost" onclick={() => (editing = false)}>Cancel</button>
    <button class="btn primary" onclick={save} disabled={!draftValid}>Use scramble</button>
  {/snippet}
</Modal>

<Modal bind:open={preview} title="Scramble preview" width={560}>
  <div class="bigimg">{@html svg}</div>
  <p class="mono bigscr">{timer.scramble}</p>
</Modal>

<SessionSheet />

<style>
  .bar {
    padding: 4px 20px 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    flex-wrap: wrap;
  }
  .pickers,
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .pickers {
    flex: 1 1 auto;
    flex-wrap: wrap;
  }
  .pickers :global(.dd) {
    max-width: 100%;
    min-width: 0;
  }
  .actions {
    flex-wrap: nowrap;
    margin-left: auto;
    gap: 2px;
    padding: 3px;
    border-radius: 12px;
    background: var(--bg);
    border: 1px solid var(--line);
    box-shadow: var(--hi), var(--shadow-sm);
  }
  .actions :global(.icon-btn) {
    width: 30px;
    height: 30px;
    border-radius: 8px;
  }
  .actions :global(button:disabled) {
    opacity: 0.3;
    pointer-events: none;
  }
  .session-btn,
  .preview-btn {
    display: none;
  }
  .mbld {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 12.5px;
    color: var(--fg-2);
  }
  .scramble {
    margin: 30px auto 0;
    max-width: 1000px;
    text-align: center;
    line-height: 1.6;
    letter-spacing: 0.01em;
    word-spacing: 0.32em;
    color: var(--fg);
    font-weight: 450;
    min-height: 1.6em;
    user-select: text;
    -webkit-user-select: text;
    transition: opacity 0.2s;
    padding: 0 12px;
    text-wrap: balance;
  }
  .scramble.mono {
    font-family: var(--mono);
    word-spacing: 0.16em;
    font-weight: 420;
    letter-spacing: -0.01em;
  }
  /* Each new scramble develops in, like a print. */
  .txt {
    display: inline;
    animation: develop 0.45s var(--ease-out) both;
  }
  @keyframes develop {
    from {
      opacity: 0;
      filter: blur(3px);
    }
  }
  .scramble.multiline {
    white-space: pre-line;
    text-align: left;
    width: fit-content;
    text-wrap: initial;
  }
  .scramble.loading {
    opacity: 0.35;
  }
  .ph {
    display: inline-flex;
    gap: 6px;
    height: 1.55em;
    align-items: center;
  }
  .ph i {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--fg-4);
    animation: blink 1s var(--ease-in-out) infinite alternate;
  }
  .ph i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .ph i:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes blink {
    from {
      opacity: 0.25;
    }
    to {
      opacity: 1;
    }
  }
  textarea {
    font-size: 15px;
  }
  .err {
    color: var(--fg);
    font-size: 12.5px;
    margin: 8px 0 0;
  }
  .bigimg :global(svg) {
    width: 100%;
    height: auto;
    max-height: 60vh;
    display: block;
  }
  .bigscr {
    font-size: 14px;
    color: var(--fg-2);
    white-space: pre-line;
    margin: 14px 0 0;
    user-select: text;
  }
  @media (max-width: 960px) {
    .session-btn {
      display: inline-grid;
    }
  }
  @media (max-width: 720px) {
    .bar {
      padding: 10px 12px 0;
    }
    .scramble {
      margin-top: 18px;
      padding: 0 4px;
    }
    .preview-btn {
      display: inline-grid;
    }
    .session-btn {
      display: none;
    }
  }
</style>
