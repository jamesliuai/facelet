<script lang="ts">
  import Toggle from '../components/Toggle.svelte';
  import Segmented from '../components/Segmented.svelte';
  import Slider from '../components/Slider.svelte';
  import Select from '../components/Select.svelte';
  import Modal from '../components/Modal.svelte';
  import Icon from '../components/Icon.svelte';
  import AppearanceControls from '../components/AppearanceControls.svelte';
  import { settings, resetSettings, DEFAULT_COLORS, DEFAULTS } from '../lib/store/settings.svelte';
  import { sessions } from '../lib/store/sessions.svelte';
  import { ui } from '../lib/store/ui.svelte';
  import { router } from '../lib/router.svelte';
  import { exportBackup, parseImport, applyImport, exportSessionCsv, type ImportResult } from '../lib/io/export';
  import { persistent } from '../lib/store/db';
  import { nxnSvg } from '../lib/render/scramble-svg';
  import { onMount } from 'svelte';

  const sections = [
    { id: 'timer', label: 'Timer' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'display', label: 'Display' },
    { id: 'stats', label: 'Statistics' },
    { id: 'colors', label: 'Cube colours' },
    { id: 'vcube', label: 'Virtual cube' },
    { id: 'trainer', label: 'Trainer' },
    { id: 'data', label: 'Data & privacy' },
  ];
  let active = $state('timer');
  let scroller: HTMLDivElement | undefined = $state();

  function jump(id: string) {
    active = id;
    document.getElementById('s-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Deep links like "Export backup" in the command palette, even when Settings is already open.
  $effect(() => {
    const s = router.params.get('s');
    if (!s) return;
    setTimeout(() => jump(s), 50);
    router.replace('settings');
  });
  function onscroll() {
    if (!scroller) return;
    let cur = sections[0].id;
    for (const s of sections) {
      const el = document.getElementById('s-' + s.id);
      if (el && el.getBoundingClientRect().top < 160) cur = s.id;
    }
    active = cur;
  }

  // ---- statistics
  const AVG_CHOICES = ['mo3', 'ao5', 'ao12', 'ao25', 'ao50', 'ao100', 'ao200', 'ao500', 'ao1000', 'ao2000', 'ao5000'];
  let customAvg = $state('');
  function toggleAvg(a: string) {
    const has = settings.avgList.includes(a);
    const next = has ? settings.avgList.filter((x) => x !== a) : [...settings.avgList, a];
    settings.avgList = sortAvgs(next);
  }
  function sortAvgs(list: string[]) {
    return [...new Set(list)].sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)) || (a < b ? -1 : 1));
  }
  function addCustom() {
    const m = /^(ao|mo)\s*(\d{1,5})$/i.exec(customAvg.trim());
    if (!m || parseInt(m[2]) < 3) {
      ui.toast('Use the form ao25 or mo10 (3 or more)');
      return;
    }
    settings.avgList = sortAvgs([...settings.avgList, m[1].toLowerCase() + parseInt(m[2])]);
    customAvg = '';
  }
  const colOptions = AVG_CHOICES.map((a) => ({ value: a, label: a }));

  // ---- colours
  const FACE_NAMES = ['Up', 'Right', 'Front', 'Down', 'Left', 'Back'];
  const PRESETS: { name: string; colors: string[] }[] = [
    { name: 'Standard', colors: DEFAULT_COLORS },
    { name: 'Vivid', colors: ['#ffffff', '#ff1e3c', '#00d26a', '#ffe600', '#ff8a00', '#1e6bff'] },
    { name: 'Soft', colors: ['#f7f7f2', '#e06666', '#6fbf73', '#f5d76e', '#f0a35e', '#6d9eeb'] },
    { name: 'Deep', colors: ['#ececec', '#9e1b32', '#00704a', '#e5b700', '#d35400', '#003a8c'] },
  ];
  const preview = $derived(nxnSvg(3, "R U R' U' F2 D L2", settings.cubeColors));

  // ---- data
  let fileInput: HTMLInputElement | undefined = $state();
  let pending: ImportResult | null = $state(null);
  let restoreSettings = $state(false);
  let importing = $state(false);
  let wipeOpen = $state(false);
  let wipeText = $state('');
  let totalSolves = $state<number | null>(null);

  onMount(() => {
    void sessions.allSolves().then((s) => (totalSolves = s.length));
  });

  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      pending = parseImport(await f.text());
    } catch (err) {
      ui.toast((err as Error).message);
    }
    (e.target as HTMLInputElement).value = '';
  }
  async function confirmImport() {
    if (!pending) return;
    importing = true;
    try {
      await applyImport(pending, restoreSettings);
      await sessions.importData(pending.sessions, pending.solves);
      // Trainer progress came in too: re-read it so a pending save of the old data can't overwrite it.
      if (pending.kv?.trainer) await (await import('../lib/trainer/trainer.svelte')).trainer.reload();
      ui.toast(`Imported ${pending.solves.length} solves in ${pending.sessions.length} sessions`);
      totalSolves = (await sessions.allSolves()).length;
    } catch (err) {
      ui.toast('Import failed: ' + (err as Error).message);
    }
    importing = false;
    pending = null;
  }
  async function doExport() {
    const n = await exportBackup();
    ui.toast(`Backup saved · ${n} solves`);
  }
  async function wipe() {
    await sessions.wipe();
    wipeOpen = false;
    wipeText = '';
    // start from a clean slate everywhere (trainer progress, caches)
    location.reload();
  }

  const fmtMs = (v: number) => (v === 0 ? 'instant' : `${(v / 1000).toFixed(2)} s`);
</script>

<div class="page" bind:this={scroller} {onscroll}>
  <div class="layout">
    <nav class="toc" aria-label="Settings sections">
      <span class="eyebrow">Facelet</span>
      <h1 class="page-title">Settings</h1>
      {#each sections as s}
        <button class:active={active === s.id} onclick={() => jump(s.id)}>{s.label}</button>
      {/each}
    </nav>

    <div class="content">
      <!-- TIMER -->
      <section id="s-timer">
        <h2>Timer</h2>
        <div class="row">
          <div class="txt"><b>Hold time</b><span>How long Space must be held before the timer arms.</span></div>
          <Slider bind:value={settings.holdTime} min={0} max={1000} step={50} format={fmtMs} label="Hold time" />
        </div>
        <div class="row">
          <div class="txt"><b>WCA inspection</b><span>15-second countdown. +2 from 15 s, DNF from 17 s. Never used for blindfolded events.</span></div>
          <Toggle bind:checked={settings.inspection} label="Inspection" />
        </div>
        {#if settings.inspection}
          <div class="row sub">
            <div class="txt"><b>Inspection alerts</b><span>Called at 8 and 12 seconds, like a WCA judge.</span></div>
            <Segmented bind:value={settings.inspectionAlerts} options={[{ value: 'voice', label: 'Voice' }, { value: 'beep', label: 'Beep' }, { value: 'none', label: 'Off' }]} />
          </div>
          <div class="row sub">
            <div class="txt"><b>Inspection length</b><span>Penalties are applied relative to this limit.</span></div>
            <Slider bind:value={settings.inspectionTime} min={5} max={60} step={1} format={(v) => `${v} s`} label="Inspection length" />
          </div>
        {/if}
        <div class="row">
          <div class="txt"><b>Input</b><span>Keyboard/touch timer, or type times from a stackmat.</span></div>
          <Segmented bind:value={settings.inputMode} options={[{ value: 'timer', label: 'Timer' }, { value: 'typing', label: 'Typing' }]} />
        </div>
        <div class="row">
          <div class="txt"><b>Stop with</b><span>Which key stops a running solve.</span></div>
          <Segmented bind:value={settings.stopKey} options={[{ value: 'any', label: 'Any key' }, { value: 'space', label: 'Space only' }]} />
        </div>
        <div class="row">
          <div class="txt"><b>Multi-phase</b><span>Record splits (e.g. cross / F2L / OLL / PLL) by pressing during the solve.</span></div>
          <Select value={settings.phases} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: n === 1 ? 'Off' : `${n} phases` }))} onchange={(v) => (settings.phases = v)} align="end" />
        </div>
        <div class="row">
          <div class="txt"><b>While solving show</b><span>Hide the running time to stop yourself from watching the clock.</span></div>
          <Segmented bind:value={settings.timerUpdate} options={[{ value: 'full', label: 'Live' }, { value: 'tenths', label: '0.1 s' }, { value: 'seconds', label: '1 s' }, { value: 'hidden', label: 'Hidden' }]} />
        </div>
        <div class="row">
          <div class="txt"><b>Precision</b><span>WCA records to the hundredth. Milliseconds are kept either way.</span></div>
          <Segmented bind:value={settings.precision} options={[{ value: 2, label: '0.01' }, { value: 3, label: '0.001' }]} />
        </div>
        <div class="row">
          <div class="txt"><b>Focus mode</b><span>Fade everything except the time while inspecting and solving.</span></div>
          <Toggle bind:checked={settings.focusMode} label="Focus mode" />
        </div>
        <div class="row">
          <div class="txt"><b>Start sound</b><span>A short click when the timer starts.</span></div>
          <Toggle bind:checked={settings.startSound} label="Start sound" />
        </div>
        <div class="row">
          <div class="txt"><b>Keep screen awake</b><span>Stops phones and laptops dimming mid-session. Lets go after a few idle minutes.</span></div>
          <Toggle bind:checked={settings.keepAwake} label="Keep screen awake" />
        </div>
        <div class="row">
          <div class="txt"><b>Haptic feedback</b><span>A short vibration when the timer is ready to start (phones that support it).</span></div>
          <Toggle bind:checked={settings.haptics} label="Haptic feedback" />
        </div>
      </section>

      <!-- APPEARANCE -->
      <section id="s-appearance">
        <h2>Appearance</h2>
        <p class="lead small">Monochrome by default. Everything here is also in the quick <button class="link" onclick={() => (ui.customizeOpen = true)}>Customize</button> panel beside the timer.</p>
        <div class="appearance"><AppearanceControls dark={ui.dark} /></div>
      </section>

      <!-- DISPLAY -->
      <section id="s-display">
        <h2>Display</h2>
        <div class="row">
          <div class="txt"><b>Scramble preview</b><span>Net of the scrambled puzzle in the tool dock.</span></div>
          <Toggle bind:checked={settings.showScrambleImage} label="Scramble preview" />
        </div>
        <div class="row">
          <div class="txt"><b>Celebrate personal bests</b><span>A quiet burst of facelets when you beat a record.</span></div>
          <Toggle bind:checked={settings.celebrate} label="Celebrate" />
        </div>
        {#if settings.celebrate}
          <div class="row sub">
            <div class="txt"><b>Only after</b><span>Skip celebrations in the first few solves of a session.</span></div>
            <Slider bind:value={settings.celebrateMin} min={0} max={50} step={1} format={(v) => `${v} solves`} label="Minimum solves" />
          </div>
        {/if}
        <div class="row">
          <div class="txt"><b>Milestones</b><span>A small note at 100, 500, 1,000… solves in a session.</span></div>
          <Toggle bind:checked={settings.milestones} label="Milestones" />
        </div>
        <div class="row">
          <div class="txt"><b>Reduce motion</b></div>
          <Segmented bind:value={settings.reduceMotion} options={[{ value: 'system', label: 'System' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
        </div>
      </section>

      <!-- STATS -->
      <section id="s-stats">
        <h2>Statistics</h2>
        <div class="row col">
          <div class="txt"><b>Averages shown</b><span>Shown in the session panel with current and best values.</span></div>
          <div class="chips">
            {#each sortAvgs([...AVG_CHOICES, ...settings.avgList]) as a}
              <button class="chip toggle-chip" class:solid={settings.avgList.includes(a)} onclick={() => toggleAvg(a)}>{a}</button>
            {/each}
            <form class="custom" onsubmit={(e) => { e.preventDefault(); addCustom(); }}>
              <input class="input" placeholder="ao25" bind:value={customAvg} aria-label="Custom average" />
              <button class="btn sm" type="submit">Add</button>
            </form>
          </div>
        </div>
        <div class="row">
          <div class="txt"><b>Solve list columns</b><span>Rolling averages next to each time.</span></div>
          <div class="pair">
            <Select options={colOptions} value={settings.listColumns[0]} onchange={(v) => (settings.listColumns = [v, settings.listColumns[1]])} size="sm" />
            <Select options={colOptions} value={settings.listColumns[1]} onchange={(v) => (settings.listColumns = [settings.listColumns[0], v])} size="sm" align="end" />
          </div>
        </div>
        <div class="row">
          <div class="txt"><b>Trimming</b><span>Removed from each end of an aoN. 5% matches csTimer and the community: ao5 and ao12 drop 1, ao100 drops 5.</span></div>
          <Segmented bind:value={settings.trimPct} options={[{ value: 5, label: '5%' }, { value: 10, label: '10%' }, { value: 20, label: '20%' }]} />
        </div>
      </section>

      <!-- COLOURS -->
      <section id="s-colors">
        <h2>Cube colours</h2>
        <div class="colors">
          <div class="swatches">
            {#each FACE_NAMES as name, i}
              <label class="sw">
                <input type="color" bind:value={settings.cubeColors[i]} aria-label="{name} colour" />
                <span class="dot" style="background:{settings.cubeColors[i]}"></span>
                <span>{name}</span>
              </label>
            {/each}
          </div>
          <div class="prev">{@html preview}</div>
        </div>
        <div class="presets">
          {#each PRESETS as p}
            <button class="btn sm" onclick={() => (settings.cubeColors = p.colors.slice())}>
              <span class="mini">{#each p.colors as c}<i style="background:{c}"></i>{/each}</span>{p.name}
            </button>
          {/each}
        </div>
      </section>

      <!-- VIRTUAL CUBE -->
      <section id="s-vcube">
        <h2>Virtual cube</h2>
        <div class="row">
          <div class="txt"><b>Turn speed</b><span>Animation length of one quarter turn.</span></div>
          <Slider bind:value={settings.vcTurnMs} min={0} max={300} step={10} format={(v) => (v === 0 ? 'instant' : `${v} ms`)} label="Turn speed" />
        </div>
        <div class="row">
          <div class="txt"><b>Keyboard mapping</b><span>Physical keys keep the csTimer layout on any keyboard; characters follow your layout.</span></div>
          <Segmented bind:value={settings.vcKeyMode} options={[{ value: 'physical', label: 'Physical' }, { value: 'character', label: 'Characters' }]} />
        </div>
        <div class="row">
          <div class="txt"><b>Inspection</b><span>15 s inspection after scrambling the virtual cube.</span></div>
          <Toggle bind:checked={settings.vcInspection} label="Virtual cube inspection" />
        </div>
        <div class="row">
          <div class="txt"><b>Stickerless</b><span>Draw cubies in their colour instead of black plastic with stickers.</span></div>
          <Toggle bind:checked={settings.vcStickerless} label="Stickerless" />
        </div>
        <div class="row">
          <div class="txt"><b>Show hidden faces</b><span>Mirror the back, left and bottom faces beside the cube.</span></div>
          <Toggle bind:checked={settings.vcMirrorHints} label="Show hidden faces" />
        </div>
      </section>

      <!-- TRAINER -->
      <section id="s-trainer">
        <h2>Trainer</h2>
        <div class="row">
          <div class="txt"><b>Show algorithm</b><span>When to reveal the algorithm for a case.</span></div>
          <Segmented bind:value={settings.trainerShowAlg} options={[{ value: 'after', label: 'After solve' }, { value: 'always', label: 'Always' }, { value: 'never', label: 'Never' }]} />
        </div>
        <div class="row">
          <div class="txt"><b>Realistic scrambles</b><span>Randomise the pieces a case doesn't touch, so every setup looks like a real solve.</span></div>
          <Toggle bind:checked={settings.trainerFiller} label="Realistic scrambles" />
        </div>
        <div class="row">
          <div class="txt"><b>Hold time</b></div>
          <Slider bind:value={settings.trainerHoldTime} min={0} max={800} step={50} format={fmtMs} label="Trainer hold time" />
        </div>
        <div class="row">
          <div class="txt"><b>Case images</b><span>Colour of the last layer in case diagrams.</span></div>
          <Segmented bind:value={settings.trainerYellowTop} options={[{ value: true, label: 'Yellow top' }, { value: false, label: 'White top' }]} />
        </div>
      </section>

      <!-- DATA -->
      <section id="s-data">
        <h2>Data & privacy</h2>
        <p class="lead">
          Facelet runs entirely on your device. Solves are stored in this browser ({persistent ? 'IndexedDB' : 'memory only: this browser blocks storage'}), and nothing is sent anywhere: no accounts, analytics or trackers. Export a backup now and then.
        </p>
        <div class="stat-line num">{totalSolves ?? '…'} solves in {sessions.list.length} sessions</div>
        <div class="actions">
          <button class="btn primary" onclick={doExport}><Icon name="download" size={15} />Export backup</button>
          <button class="btn" onclick={() => fileInput?.click()}><Icon name="upload" size={15} />Import…</button>
          <button class="btn" onclick={() => exportSessionCsv(sessions.current, sessions.solves)}><Icon name="list" size={15} />Session as CSV</button>
          <input type="file" accept=".json,.txt,application/json" bind:this={fileInput} onchange={onFile} hidden />
        </div>
        <p class="note">Import accepts Facelet backups and <b>csTimer</b> exports (csTimer → Export → Export to file). Sessions, penalties, scrambles, comments, dates and multi-phase splits come across. Importing the same file twice won't duplicate solves.</p>
        <div class="danger">
          <div class="txt"><b>Reset preferences</b><span>Restore every setting to its default.</span></div>
          <button class="btn sm" onclick={() => { resetSettings(); ui.toast('Settings reset'); }}>Reset</button>
        </div>
        <div class="danger">
          <div class="txt"><b>Delete all data</b><span>Permanently removes every session, solve and trainer record from this browser. Settings are kept.</span></div>
          <button class="btn sm danger" onclick={() => (wipeOpen = true)}>Delete…</button>
        </div>
      </section>
    </div>
  </div>
</div>

<Modal open={pending !== null} onclose={() => (pending = null)} title="Import data" width={460}>
  {#if pending}
    <p class="confirm">
      Found <b>{pending.solves.length.toLocaleString()}</b> solves in <b>{pending.sessions.length}</b> sessions from a {pending.source === 'cstimer' ? 'csTimer export' : 'Facelet backup'}. They'll be added alongside your current data.
    </p>
    <ul class="sess">
      {#each pending.sessions.slice(0, 8) as s}
        <li><span>{s.name}</span><span class="muted">{pending.solves.filter((x) => x.sessionId === s.id).length}</span></li>
      {/each}
      {#if pending.sessions.length > 8}<li class="muted">…and {pending.sessions.length - 8} more</li>{/if}
    </ul>
    {#if pending.source === 'facelet' && pending.settings}
      <label class="restore"><Toggle bind:checked={restoreSettings} label="Restore settings" /> Also restore settings from the backup</label>
    {/if}
  {/if}
  {#snippet footer()}
    <button class="btn ghost" onclick={() => (pending = null)}>Cancel</button>
    <button class="btn primary" onclick={confirmImport} disabled={importing}>{importing ? 'Importing…' : 'Import'}</button>
  {/snippet}
</Modal>

<Modal bind:open={wipeOpen} title="Delete all data?" width={440}>
  <p class="confirm">This permanently removes {totalSolves ?? 'all'} solves, every session and your trainer progress. Type <b>delete</b> to confirm.</p>
  <!-- svelte-ignore a11y_autofocus -->
  <input class="input" bind:value={wipeText} autofocus />
  {#snippet footer()}
    <button class="btn ghost" onclick={() => (wipeOpen = false)}>Cancel</button>
    <button class="btn primary" disabled={wipeText.trim().toLowerCase() !== 'delete'} onclick={wipe}>Delete everything</button>
  {/snippet}
</Modal>

<style>
  .layout {
    max-width: 1040px;
    margin: 0 auto;
    padding: 40px 32px 120px;
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 48px;
  }
  .toc {
    position: sticky;
    top: 40px;
    align-self: start;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .toc .page-title {
    margin-bottom: 20px;
  }
  .toc button {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    height: 34px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid transparent;
    color: var(--fg-3);
    font-weight: 500;
    font-size: 13.5px;
    transition: color 0.15s, background 0.15s;
  }
  .toc button::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 1.5px;
    background: var(--line-3);
    transition: background 0.2s;
  }
  .toc button:hover {
    color: var(--fg);
  }
  .toc button.active {
    color: var(--fg);
    background: var(--bg);
    border-color: var(--line);
    box-shadow: var(--hi), var(--shadow-sm);
  }
  .toc button.active::before {
    background: var(--accent);
  }
  /* Each section is a floating sheet. */
  section {
    padding: 18px 24px 10px;
    margin-bottom: 16px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-xl);
    box-shadow: var(--hi), var(--shadow-sm);
    scroll-margin-top: 24px;
  }
  h2 {
    font-family: var(--display);
    font-size: 27px;
    font-weight: 400;
    line-height: 1.1;
    letter-spacing: -0.01em;
    margin: 4px 0 8px;
  }
  :global(:root[data-heading='sans']) h2 {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.015em;
    margin: 6px 0 10px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 14px 0;
    border-top: 1px solid var(--line);
  }
  .row:first-of-type {
    border-top: 0;
  }
  .row.sub {
    padding-left: 18px;
  }
  .row.col {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .txt {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    max-width: 440px;
  }
  .txt b {
    font-weight: 500;
    font-size: 13.5px;
  }
  .txt span {
    color: var(--fg-3);
    font-size: 12.5px;
    line-height: 1.45;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .toggle-chip {
    cursor: pointer;
    height: 28px;
    padding: 0 12px;
    font-size: 12.5px;
  }
  .custom {
    display: flex;
    gap: 6px;
    margin-left: 6px;
  }
  .custom .input {
    width: 84px;
    height: 28px;
  }
  .pair {
    display: flex;
    gap: 6px;
  }
  .colors {
    display: flex;
    gap: 32px;
    align-items: center;
    flex-wrap: wrap;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(3, auto);
    gap: 10px 22px;
  }
  .sw {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    font-size: 13px;
    position: relative;
  }
  .sw input {
    position: absolute;
    opacity: 0;
    width: 28px;
    height: 28px;
    cursor: pointer;
  }
  .dot {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid var(--line-3);
    box-shadow: inset 0 0 0 2px var(--bg);
  }
  .prev {
    width: 220px;
  }
  .prev :global(svg) {
    width: 100%;
    height: auto;
  }
  .presets {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 18px;
  }
  .mini {
    display: inline-flex;
    gap: 2px;
  }
  .mini i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    border: 1px solid var(--line-2);
  }
  .lead {
    color: var(--fg-2);
    max-width: 620px;
    margin: 0 0 16px;
  }
  .lead.small {
    font-size: 13px;
    color: var(--fg-3);
  }
  .link {
    text-decoration: underline;
    text-underline-offset: 2px;
    color: var(--fg-2);
  }
  .appearance {
    max-width: 560px;
    padding-top: 6px;
  }
  .stat-line {
    font-size: 13px;
    color: var(--fg-3);
    margin-bottom: 12px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .note {
    color: var(--fg-3);
    font-size: 12.5px;
    max-width: 620px;
    margin: 14px 0 24px;
  }
  .danger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    margin-top: 10px;
  }
  .confirm {
    margin: 0 0 12px;
    color: var(--fg-2);
  }
  .sess {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .sess li {
    display: flex;
    justify-content: space-between;
    padding: 7px 12px;
    font-size: 13px;
    border-bottom: 1px solid var(--line);
  }
  .sess li:last-child {
    border-bottom: 0;
  }
  .restore {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 13px;
    color: var(--fg-2);
  }
  @media (max-width: 860px) {
    .layout {
      grid-template-columns: 1fr;
      gap: 12px;
      padding: 24px 16px 120px;
    }
    .toc {
      position: static;
      flex-direction: row;
      flex-wrap: wrap;
    }
    .toc .page-title {
      width: 100%;
      margin-bottom: 8px;
    }
    .row {
      flex-wrap: wrap;
    }
  }
</style>
