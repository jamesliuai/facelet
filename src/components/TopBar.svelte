<script lang="ts">
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import { router, type Route } from '../lib/router.svelte';
  import { ui } from '../lib/store/ui.svelte';
  import { settings } from '../lib/store/settings.svelte';

  let { dark }: { dark: boolean } = $props();

  const items: { route: Route; label: string; icon: string }[] = [
    { route: 'timer', label: 'Timer', icon: 'timer' },
    { route: 'cube', label: 'Cube', icon: 'cube' },
    { route: 'train', label: 'Train', icon: 'grid' },
    { route: 'stats', label: 'Stats', icon: 'chart' },
    { route: 'tools', label: 'Tools', icon: 'wrench' },
  ];

  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  function toggleTheme() {
    settings.theme = dark ? 'light' : 'dark';
  }

  // The sliding thumb under the active tab (desktop and phone bars).
  const desk: HTMLAnchorElement[] = $state([]);
  const mob: HTMLAnchorElement[] = $state([]);
  // Plain numbers, written but never read here: measuring must not re-trigger itself
  // (on pages with no tab, e.g. Settings, the thumb just fades out where it was).
  let tx = $state(0);
  let tw = $state(0);
  let ton = $state(false);
  let mx = $state(0);
  let mw = $state(0);
  let mon = $state(false);
  let ready = $state(false);

  function measure() {
    const i = items.findIndex((it) => it.route === router.route);
    const a = desk[i];
    if (a) {
      tx = a.offsetLeft;
      tw = a.offsetWidth;
    }
    ton = !!a;
    const m = mob[i];
    if (m) {
      mx = m.offsetLeft;
      mw = m.offsetWidth;
    }
    mon = !!m;
  }
  $effect(() => {
    void router.route;
    void settings.uiFont;
    measure();
    // Fonts can change tab widths after first paint.
    void document.fonts?.ready.then(measure);
    const id = requestAnimationFrame(() => (ready = true));
    return () => cancelAnimationFrame(id);
  });
</script>

<svelte:window onresize={measure} />

<header class="topbar" class:hidden={ui.timing && settings.focusMode}>
  <a class="brand" href="#/" aria-label="Facelet home">
    <Logo size={20} />
    <span class="word">facelet</span>
  </a>

  <nav class="desk" class:ready aria-label="Main">
    <span class="thumb" class:on={ton} style="transform: translateX({tx}px); width: {tw}px" aria-hidden="true"></span>
    {#each items as it, i (it.route)}
      <a
        bind:this={desk[i]}
        href={'#/' + (it.route === 'timer' ? '' : it.route)}
        class:active={router.route === it.route}
        aria-current={router.route === it.route ? 'page' : undefined}
      >
        {it.label}
      </a>
    {/each}
  </nav>

  <div class="right">
    <button class="search" onclick={() => (ui.paletteOpen = true)} aria-label="Search and commands">
      <Icon name="search" size={15} />
      <span class="lbl">Search</span>
      <span class="kbd">{mac ? '⌘' : 'Ctrl'} K</span>
    </button>
    <div class="tools">
      <button class="icon-btn" class:active={ui.customizeOpen} onclick={() => (ui.customizeOpen = !ui.customizeOpen)} aria-label="Customize appearance" title="Customize (Alt P)">
        <Icon name="palette" size={17} />
      </button>
      <button class="icon-btn" onclick={toggleTheme} aria-label="Toggle theme" title="Toggle theme (Alt D)">
        <Icon name={dark ? 'sun' : 'moon'} size={17} />
      </button>
      <a class="icon-btn" class:active={router.route === 'settings'} href="#/settings" aria-label="Settings" title="Settings">
        <Icon name="sliders" size={17} />
      </a>
    </div>
  </div>
</header>

<nav class="mobile" class:ready class:hidden={ui.timing && settings.focusMode} aria-label="Main">
  <span class="mthumb" class:on={mon} style="transform: translateX({mx}px); width: {mw}px" aria-hidden="true"></span>
  {#each items as it, i (it.route)}
    <a bind:this={mob[i]} href={'#/' + (it.route === 'timer' ? '' : it.route)} class:active={router.route === it.route}>
      <Icon name={it.icon} size={19} />
      <span>{it.label}</span>
    </a>
  {/each}
</nav>

<style>
  .topbar {
    height: var(--topbar-h);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 14px 0 22px;
    position: relative;
    z-index: 40;
    transition: opacity 0.35s var(--ease), transform 0.45s var(--glide), filter 0.35s var(--ease);
  }
  .hidden {
    opacity: 0;
    transform: translateY(-8px);
    filter: blur(3px);
    pointer-events: none;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--fg);
    justify-self: start;
    border-radius: 8px;
  }
  .brand :global(svg) {
    transition: transform 0.5s var(--spring);
  }
  .brand:hover :global(svg) {
    transform: rotate(90deg);
  }
  .word {
    font-family: var(--display);
    font-size: 23px;
    line-height: 1;
    letter-spacing: -0.01em;
    margin-top: -1px;
  }
  :global(:root[data-heading='sans']) .word {
    font-weight: 600;
    font-size: 17px;
    letter-spacing: -0.04em;
  }

  /* Floating nav pill with an ink thumb that slides between tabs. */
  nav.desk {
    position: relative;
    display: flex;
    gap: 2px;
    padding: 4px;
    border-radius: 14px;
    background: var(--bg);
    border: 1px solid var(--line);
    box-shadow: var(--hi), var(--shadow);
  }
  nav.desk a {
    position: relative;
    z-index: 1;
    height: 30px;
    display: inline-flex;
    align-items: center;
    padding: 0 15px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    color: var(--fg-3);
    text-decoration: none;
    transition: color 0.25s var(--ease);
  }
  nav.desk a:hover {
    color: var(--fg);
  }
  nav.desk a.active {
    color: var(--accent-fg);
  }
  .thumb {
    position: absolute;
    top: 4px;
    left: 0;
    height: 30px;
    border-radius: 10px;
    background-color: var(--accent);
    background-image: linear-gradient(180deg, rgb(255 255 255 / 0.12), rgb(255 255 255 / 0));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.14), 0 1px 2px rgb(0 0 0 / 0.18), 0 4px 10px -4px color-mix(in srgb, var(--accent) 55%, transparent);
    opacity: 0;
  }
  .thumb.on {
    opacity: 1;
  }
  .ready .thumb,
  .ready .mthumb {
    transition: transform 0.45s var(--glide), width 0.45s var(--glide), opacity 0.2s;
  }

  .right {
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .search {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 6px 0 11px;
    border-radius: 11px;
    border: 1px solid var(--line);
    background: var(--bg);
    box-shadow: var(--hi), var(--shadow-sm);
    color: var(--fg-3);
    font-size: 13px;
    min-width: 188px;
    transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
  }
  .search:hover {
    border-color: var(--line-3);
    color: var(--fg-2);
  }
  .search .kbd {
    margin-left: auto;
    height: 22px;
  }
  nav.mobile {
    display: none;
  }
  @media (max-width: 860px) {
    .search .lbl,
    .search .kbd {
      display: none;
    }
    .search {
      min-width: 0;
      width: 34px;
      padding: 0;
      justify-content: center;
    }
  }
  @media (max-width: 720px) {
    .topbar {
      grid-template-columns: 1fr auto;
      padding: 0 10px 0 16px;
      --topbar-h: 56px;
    }
    nav.desk {
      display: none;
    }
    .search {
      border: 0;
      box-shadow: none;
      background: transparent;
      width: 32px;
    }
    .right {
      gap: 2px;
    }
    /* A floating glass tab bar. */
    nav.mobile {
      display: flex;
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: calc(10px + env(safe-area-inset-bottom));
      z-index: 40;
      height: 60px;
      padding: 5px;
      border-radius: 20px;
      background: var(--glass);
      -webkit-backdrop-filter: blur(18px) saturate(1.6);
      backdrop-filter: blur(18px) saturate(1.6);
      border: 1px solid var(--line);
      box-shadow: var(--hi), var(--shadow-float);
      transition: opacity 0.3s var(--ease), transform 0.45s var(--glide);
    }
    nav.mobile.hidden {
      transform: translateY(16px);
      filter: none;
    }
    nav.mobile a {
      position: relative;
      z-index: 1;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      border-radius: 15px;
      font-size: 10.5px;
      font-weight: 500;
      color: var(--fg-3);
      text-decoration: none;
      transition: color 0.25s var(--ease);
      -webkit-tap-highlight-color: transparent;
    }
    nav.mobile a.active {
      color: var(--fg);
    }
    .mthumb {
      position: absolute;
      top: 5px;
      bottom: 5px;
      left: 0;
      border-radius: 15px;
      background: var(--bg-3);
      opacity: 0;
    }
    .mthumb.on {
      opacity: 1;
    }
  }
</style>
