<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import { sessions } from '../../lib/store/sessions.svelte';
  import { settings } from '../../lib/store/settings.svelte';
  import { ui } from '../../lib/store/ui.svelte';
  import { formatTime } from '../../lib/stats/format';

  // Phones get a compact summary instead of the side panel; tap it for everything.
  const items = $derived.by(() => {
    void sessions.version;
    const e = sessions.engine;
    const labels = sessions.event.format === 'ao5' ? ['ao5', 'ao12'] : ['mo3', 'ao5'];
    return [
      ...labels.map((l) => ({ k: l, v: formatTime(e.current(l), settings.precision) })),
      { k: 'best', v: formatTime(e.best, settings.precision) },
    ];
  });
</script>

<button class="ms num" data-no-timer onclick={() => (ui.sheetOpen = true)} aria-label="Session statistics and times">
  <span class="name">{sessions.current?.name}<span class="n">{sessions.engine.count}</span></span>
  {#each items as it (it.k)}
    <span class="it"><span class="k">{it.k}</span><span class="v">{it.v}</span></span>
  {/each}
  <Icon name="up" size={15} />
</button>

<style>
  .ms {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    height: 52px;
    padding: 0 12px 0 16px;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: var(--bg);
    box-shadow: var(--hi), var(--shadow);
    font-size: 13px;
    color: var(--fg-2);
    text-align: left;
    transition: transform 0.14s var(--ease);
    -webkit-tap-highlight-color: transparent;
  }
  .ms:active {
    transform: scale(0.985);
  }
  .ms :global(.icon) {
    margin-left: auto;
    color: var(--fg-3);
    flex: none;
  }
  .name {
    font-family: var(--display);
    font-size: 19px;
    line-height: 1;
    color: var(--fg);
    min-width: 0;
    max-width: 32%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 0 1 auto;
  }
  :global(:root[data-heading='sans']) .name {
    font-family: var(--font);
    font-size: 13px;
    font-weight: 600;
  }
  .n {
    font-family: var(--font);
    font-size: 12px;
    color: var(--fg-3);
    margin-left: 6px;
  }
  .it {
    display: flex;
    flex-direction: column;
    gap: 1px;
    white-space: nowrap;
  }
  .k {
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--fg-3);
  }
  .v {
    font-size: 14px;
    color: var(--fg);
  }
  @media (max-width: 360px) {
    .it:last-of-type {
      display: none;
    }
  }
</style>
