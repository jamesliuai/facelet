<script lang="ts">
  import Segmented from './Segmented.svelte';
  import Slider from './Slider.svelte';
  import Toggle from './Toggle.svelte';
  import Icon from './Icon.svelte';
  import { settings, type TimerFont } from '../lib/store/settings.svelte';
  import { PALETTES, ACCENTS, contrast, isHex } from '../lib/theme';

  let { dark }: { dark: boolean } = $props();

  const FONTS: { id: TimerFont; name: string }[] = [
    { id: 'sans', name: 'Sans' },
    { id: 'mono', name: 'Mono' },
    { id: 'serif', name: 'Serif' },
    { id: 'system', name: 'System' },
    { id: 'lcd', name: 'Display' },
  ];
  const STRIP = ['mo3', 'ao5', 'ao12', 'ao25', 'ao50', 'ao100', 'mean', 'best', 'count'];
  const STRIP_LABEL: Record<string, string> = { mean: 'mean', best: 'best single', count: 'solves' };

  function toggleStrip(id: string) {
    const has = settings.stripStats.includes(id);
    if (has) settings.stripStats = settings.stripStats.filter((x) => x !== id);
    else if (settings.stripStats.length < 4) settings.stripStats = STRIP.filter((x) => x === id || settings.stripStats.includes(x));
  }

  // Custom palette: edit the pair for the mode you're looking at.
  const pairKey = $derived(dark ? 'customDark' : 'customLight');
  function startCustom() {
    if (settings.palette !== 'custom') {
      const p = PALETTES.find((x) => x.id === settings.palette) ?? PALETTES[0];
      settings.customLight = [...p.light];
      settings.customDark = [...p.dark];
    }
    settings.palette = 'custom';
  }
  function setCustom(i: 0 | 1, v: string) {
    const pair = [...settings[pairKey]] as [string, string];
    pair[i] = v;
    settings[pairKey] = pair;
  }
  const customContrast = $derived(settings.palette === 'custom' ? contrast(settings[pairKey][0], settings[pairKey][1]) : 21);

  let customAccent = $state(isHex(settings.accent) && !ACCENTS.some((a) => a.id === settings.accent) ? settings.accent : '#2f6fed');
  const isCustomAccent = $derived(!!settings.accent && !ACCENTS.some((a) => a.id === settings.accent));
</script>

<div class="ac">
  <section>
    <h3>Theme</h3>
    <Segmented bind:value={settings.theme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
  </section>

  <section>
    <h3>Palette</h3>
    <div class="palettes">
      {#each PALETTES as p (p.id)}
        <button class="pal" class:on={settings.palette === p.id} onclick={() => (settings.palette = p.id)} aria-pressed={settings.palette === p.id} title="{p.name}: light and dark">
          <span class="chip-c split">
            <span class="half" style="background:{p.light[0]}; color:{p.light[1]}">A</span>
            <span class="half" style="background:{p.dark[0]}; color:{p.dark[1]}">a</span>
          </span>
          <span class="nm">{p.name}</span>
        </button>
      {/each}
      <button class="pal" class:on={settings.palette === 'custom'} onclick={startCustom} aria-pressed={settings.palette === 'custom'}>
        <span class="chip-c custom"><Icon name="edit" size={14} /></span>
        <span class="nm">Custom</span>
      </button>
    </div>
    {#if settings.palette === 'custom'}
      <div class="customs">
        <label class="well">
          <input type="color" value={settings[pairKey][0]} oninput={(e) => setCustom(0, (e.target as HTMLInputElement).value)} aria-label="Background colour" />
          <span class="sw" style="background:{settings[pairKey][0]}"></span>
          <span>Background</span>
        </label>
        <label class="well">
          <input type="color" value={settings[pairKey][1]} oninput={(e) => setCustom(1, (e.target as HTMLInputElement).value)} aria-label="Text colour" />
          <span class="sw" style="background:{settings[pairKey][1]}"></span>
          <span>Text</span>
        </label>
        <span class="note">{dark ? 'Dark' : 'Light'} mode{customContrast < 4.5 ? ' · low contrast' : ''}</span>
      </div>
    {/if}
  </section>

  <section>
    <h3>Accent</h3>
    <div class="accents">
      {#each ACCENTS as a (a.id)}
        <button
          class="acc"
          class:on={settings.accent === a.id}
          class:none={!a.id}
          style={a.id ? `--c:${a.id}` : ''}
          onclick={() => (settings.accent = a.id)}
          aria-label={a.name}
          title={a.name}
          aria-pressed={settings.accent === a.id}
        ></button>
      {/each}
      <label class="acc custom" class:on={isCustomAccent} title="Custom colour" style="--c:{customAccent}">
        <input
          type="color"
          value={customAccent}
          oninput={(e) => {
            customAccent = (e.target as HTMLInputElement).value;
            settings.accent = customAccent;
          }}
          aria-label="Custom accent colour"
        />
      </label>
    </div>
    <p class="note">{settings.accent ? 'Used for highlights, personal bests and controls.' : 'Pure monochrome. The only colour is the cube.'}</p>
  </section>

  <section>
    <h3>Timer</h3>
    <div class="fonts">
      {#each FONTS as f (f.id)}
        <button class="font-card font-{f.id}" class:on={settings.timerFont === f.id} onclick={() => (settings.timerFont = f.id)} aria-pressed={settings.timerFont === f.id}>
          <span class="sample num" style="font-weight:{f.id === 'serif' || f.id === 'lcd' ? 400 : settings.timerWeight}">
            {#if f.id === 'lcd'}<span class="seg">12.34</span>{:else if settings.smallDecimals}12<span class="d">.34</span>{:else}12.34{/if}
          </span>
          <span class="name">{f.name}</span>
        </button>
      {/each}
    </div>
    <div class="line">
      <span>Size</span>
      <Slider bind:value={settings.timerSize} min={0.5} max={1.6} step={0.05} format={(v) => `${Math.round(v * 100)}%`} label="Timer size" />
    </div>
    {#if settings.timerFont !== 'serif' && settings.timerFont !== 'lcd'}
      <div class="line">
        <span>Weight</span>
        <Slider bind:value={settings.timerWeight} min={100} max={800} step={50} format={(v) => String(v)} label="Timer weight" />
      </div>
    {/if}
    <div class="line">
      <span>Hold &amp; ready</span>
      <Segmented
        size="sm"
        bind:value={settings.timerColors}
        options={[{ value: 'mono', label: 'Fade' }, { value: 'classic', label: 'Red / green' }, ...(settings.accent ? [{ value: 'accent' as const, label: 'Accent' }] : [])]}
      />
    </div>
    {#if settings.timerFont !== 'lcd'}
      <label class="tg"><span>Smaller decimals</span><Toggle bind:checked={settings.smallDecimals} label="Smaller decimals" /></label>
    {/if}
    <label class="tg"><span>Soft light behind the time</span><Toggle bind:checked={settings.spotlight} label="Soft light behind the time" /></label>
  </section>

  <section>
    <h3>Text</h3>
    <div class="line">
      <span>Interface</span>
      <Segmented size="sm" bind:value={settings.uiFont} options={[{ value: 'geist', label: 'Geist' }, { value: 'system', label: 'System' }, { value: 'mono', label: 'Mono' }]} />
    </div>
    <div class="line">
      <span>Headings</span>
      <Segmented size="sm" bind:value={settings.headingFont} options={[{ value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }]} />
    </div>
    <div class="line">
      <span>Scramble</span>
      <Segmented size="sm" bind:value={settings.scrambleFont} options={[{ value: 'mono', label: 'Mono' }, { value: 'sans', label: 'Sans' }]} />
    </div>
    <div class="line">
      <span>Scramble size</span>
      <Slider bind:value={settings.scrambleSize} min={0.6} max={1.6} step={0.05} format={(v) => `${Math.round(v * 100)}%`} label="Scramble size" />
    </div>
  </section>

  <section>
    <h3>Under the time</h3>
    <div class="chips">
      {#each STRIP as id (id)}
        <button class="chip" class:solid={settings.stripStats.includes(id)} onclick={() => toggleStrip(id)} aria-pressed={settings.stripStats.includes(id)}>{STRIP_LABEL[id] ?? id}</button>
      {/each}
    </div>
    <label class="tg"><span>Time needed for a new best</span><Toggle bind:checked={settings.showPbHint} label="Time needed for a new best" /></label>
    <label class="tg"><span>OK / +2 / DNF buttons</span><Toggle bind:checked={settings.showLastSolveBar} label="Last-solve controls" /></label>
  </section>

  <section>
    <h3>Layout</h3>
    <label class="tg"><span>Session panel</span><Toggle bind:checked={settings.showSidebar} label="Session panel" /></label>
    {#if settings.showSidebar}
      <div class="line sub">
        <span>Side</span>
        <Segmented size="sm" bind:value={settings.sidebarSide} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} />
      </div>
    {/if}
    <label class="tg"><span>Tool dock (preview, solver, trend)</span><Toggle bind:checked={settings.showDock} label="Tool dock" /></label>
    <label class="tg"><span>Today's practice</span><Toggle bind:checked={settings.showToday} label="Today's practice" /></label>
    <label class="tg"><span>Focus mode while solving</span><Toggle bind:checked={settings.focusMode} label="Focus mode" /></label>
  </section>
</div>

<style>
  .sample .d {
    font-size: 0.6em;
  }
  .ac {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h3 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--fg-3);
  }
  h3::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 1.5px;
    background: var(--line-3);
  }
  .palettes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 8px;
  }
  .pal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 4px;
    border-radius: 12px;
  }
  .chip-c {
    position: relative;
    width: 100%;
    height: 40px;
    border-radius: 9px;
    border: 1px solid var(--line-2);
    display: grid;
    place-items: center;
    transition: box-shadow 0.15s, transform 0.15s var(--ease);
  }
  .chip-c.split {
    display: flex;
    overflow: hidden;
  }
  .half {
    flex: 1;
    height: 100%;
    display: grid;
    place-items: center;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .chip-c.custom {
    color: var(--fg-3);
    background: repeating-linear-gradient(45deg, var(--bg-3) 0 6px, var(--bg) 6px 12px);
  }
  .pal:hover .chip-c {
    transform: translateY(-1px);
  }
  .pal.on .chip-c {
    box-shadow: 0 0 0 2px var(--bg), 0 0 0 3.5px var(--accent);
  }
  .nm {
    font-size: 11.5px;
    color: var(--fg-3);
  }
  .pal.on .nm {
    color: var(--fg);
    font-weight: 500;
  }
  .customs {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .well {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    cursor: pointer;
  }
  .well input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .sw {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 1px solid var(--line-3);
  }
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--fg-3);
  }
  .accents {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .acc {
    position: relative;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--c);
    border: 1px solid color-mix(in srgb, var(--c, var(--fg)) 70%, var(--fg));
    transition: transform 0.15s var(--ease), box-shadow 0.15s;
    cursor: pointer;
  }
  .acc:hover {
    transform: scale(1.08);
  }
  .acc.on {
    box-shadow: 0 0 0 2px var(--bg), 0 0 0 3.5px var(--c, var(--fg));
  }
  .acc.none {
    background: linear-gradient(135deg, var(--fg) 50%, var(--bg) 50%);
    border-color: var(--line-3);
  }
  .acc.custom {
    background: conic-gradient(#e5484d, #e8a317, #1f9d55, #0e9f8e, #2f6fed, #7c5cff, #e0457b, #e5484d);
    border-color: var(--line-3);
  }
  .acc.custom.on {
    background: var(--c);
  }
  .acc.custom input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .fonts {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .font-card {
    padding: 10px 4px 7px;
    border-radius: 11px;
    border: 1px solid var(--line-2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: border-color 0.15s, background 0.15s;
    min-width: 0;
  }
  .font-card:hover {
    background: var(--bg-2);
  }
  .font-card.on {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 0.5px var(--accent);
  }
  .sample {
    font-size: 19px;
    letter-spacing: -0.04em;
    line-height: 1.1;
    white-space: nowrap;
  }
  .font-mono .sample {
    font-family: var(--mono);
    letter-spacing: -0.06em;
  }
  .font-serif .sample {
    font-family: var(--serif);
    font-size: 22px;
  }
  .font-system .sample {
    font-family: var(--system);
  }
  .seg {
    font-family: var(--mono);
    font-size: 16px;
    letter-spacing: 0.02em;
    font-style: italic;
    font-weight: 600;
  }
  .font-card .name {
    font-size: 11px;
    color: var(--fg-3);
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    font-size: 13px;
    color: var(--fg-2);
    min-height: 30px;
  }
  .line :global(.slider) {
    min-width: 0;
    flex: 0 1 220px;
  }
  .line.sub {
    padding-left: 14px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips .chip {
    cursor: pointer;
    height: 28px;
    padding: 0 11px;
    font-size: 12.5px;
  }
  .tg {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    color: var(--fg-2);
    min-height: 30px;
    cursor: pointer;
  }
</style>
