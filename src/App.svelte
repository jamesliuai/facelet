<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from './components/TopBar.svelte';
  import Toasts from './components/Toasts.svelte';
  import Celebrate from './components/Celebrate.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import ShortcutsModal from './components/ShortcutsModal.svelte';
  import TimerPage from './pages/TimerPage.svelte';
  import { router } from './lib/router.svelte';
  import { settings, prefersReducedMotion } from './lib/store/settings.svelte';
  import { sessions } from './lib/store/sessions.svelte';
  import { ui, typingInField } from './lib/store/ui.svelte';
  import { requestPersistence } from './lib/store/db';
  import { warm } from './lib/scramble/client';
  import { resolveTheme, applyTheme, UI_FONTS } from './lib/theme';

  let systemDark = $state(typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  const dark = $derived(settings.theme === 'dark' || (settings.theme === 'system' && systemDark));

  $effect(() => {
    ui.dark = dark;
    applyTheme(resolveTheme({ dark, palette: settings.palette, customLight: settings.customLight, customDark: settings.customDark, accent: settings.accent }));
  });
  $effect(() => {
    const root = document.documentElement;
    root.dataset.timerColors = settings.timerColors === 'accent' && !settings.accent ? 'mono' : settings.timerColors;
    root.dataset.heading = settings.headingFont;
    root.style.setProperty('--font', UI_FONTS[settings.uiFont] ?? UI_FONTS.geist);
  });
  let systemReduce = $state(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  $effect(() => {
    void settings.reduceMotion;
    void systemReduce;
    document.documentElement.dataset.motion = prefersReducedMotion() ? 'reduce' : 'full';
  });

  const lazy: Record<string, () => Promise<any>> = {
    cube: () => import('./pages/CubePage.svelte'),
    train: () => import('./pages/TrainerPage.svelte'),
    stats: () => import('./pages/StatsPage.svelte'),
    tools: () => import('./pages/ToolsPage.svelte'),
    settings: () => import('./pages/SettingsPage.svelte'),
    about: () => import('./pages/AboutPage.svelte'),
  };
  // Panels that only appear on demand stay out of the first load (preloaded when idle).
  let Customize: any = $state(null);
  let Sessions: any = $state(null);
  const loadCustomize = () => (Customize ? Promise.resolve() : import('./components/CustomizePanel.svelte').then((m) => (Customize = m.default)));
  const loadSessions = () => (Sessions ? Promise.resolve() : import('./components/SessionManager.svelte').then((m) => (Sessions = m.default)));
  $effect(() => {
    if (ui.customizeOpen) void loadCustomize();
  });
  $effect(() => {
    if (ui.sessionsOpen) void loadSessions();
  });

  const pageCache = new Map<string, Promise<any>>();
  function load(route: string) {
    let p = pageCache.get(route);
    if (!p) {
      p = lazy[route]();
      pageCache.set(route, p);
    }
    return p;
  }

  onMount(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => (systemDark = mq.matches);
    mq.addEventListener('change', onMq);
    const rm = matchMedia('(prefers-reduced-motion: reduce)');
    rm.addEventListener('change', () => (systemReduce = rm.matches));
    void sessions.init().then(() => {
      warm('333');
    });
    void requestPersistence();
    // Preload the other pages when idle so navigation is instant.
    const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500));
    idle(() => {
      Object.keys(lazy).forEach((r) => void load(r));
      void loadCustomize();
      void loadSessions();
    });
    return () => mq.removeEventListener('change', onMq);
  });

  function onkeydown(e: KeyboardEvent) {
    if (typingInField(e) || ui.modalDepth > 0) return;
    if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      ui.shortcutsOpen = true;
    } else if (e.altKey && e.code === 'KeyD') {
      e.preventDefault();
      settings.theme = dark ? 'light' : 'dark';
    } else if (e.altKey && e.code === 'KeyP' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      ui.customizeOpen = true;
    }
  }
</script>

<svelte:window {onkeydown} />

{#snippet loader()}
  <div class="loader" aria-hidden="true">{#each [0, 1, 2, 7, 8, 3, 6, 5, 4] as d}<i style="--d:{d}"></i>{/each}</div>
{/snippet}

<div class="app" class:timing={ui.timing && settings.focusMode}>
  <TopBar {dark} />
  <main>
    {#if !sessions.ready}
      <div class="boot" aria-label="Loading">{@render loader()}</div>
    {:else if router.route === 'timer'}
      <TimerPage />
    {:else}
      {#await load(router.route)}
        <div class="boot" aria-label="Loading">{@render loader()}</div>
      {:then mod}
        {@const Page = mod.default}
        <Page />
      {/await}
    {/if}
  </main>
</div>

<CommandPalette />
<ShortcutsModal />
{#if Customize}<Customize />{/if}
{#if Sessions}<Sessions />{/if}
<Toasts />
<Celebrate />

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  main {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  .boot {
    height: 100%;
    display: grid;
    place-items: center;
  }
  /* Nine facelets light up around the face. */
  .loader {
    display: grid;
    grid-template-columns: repeat(3, 7px);
    gap: 3px;
    animation: fade-in 0.4s 0.15s var(--ease) both;
  }
  .loader i {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--fg);
    opacity: 0.12;
    animation: facelet 1.1s calc(var(--d) * 0.11s) var(--ease-in-out) infinite;
  }
  @keyframes facelet {
    0%,
    100% {
      opacity: 0.12;
    }
    30% {
      opacity: 0.9;
    }
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @media (max-width: 720px) {
    main {
      padding-bottom: calc(78px + env(safe-area-inset-bottom));
    }
    .app.timing main {
      padding-bottom: 0;
    }
  }
</style>
