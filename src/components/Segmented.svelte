<script lang="ts" generics="T extends string | number | boolean">
  let {
    value = $bindable(),
    options,
    onchange,
    size = 'md',
  }: { value: T; options: { value: T; label: string }[]; onchange?: (v: T) => void; size?: 'sm' | 'md' } = $props();

  // A thumb slides to the chosen option instead of the highlight jumping.
  const btns: HTMLButtonElement[] = $state([]);
  // Plain numbers that measure() writes but never reads, so it can't re-trigger itself.
  let tx = $state(0);
  let tw = $state(0);
  let ton = $state(false);
  let ready = $state(false);
  let root: HTMLDivElement | undefined = $state();

  function measure() {
    const i = options.findIndex((o) => o.value === value);
    const b = btns[i];
    if (b) {
      tx = b.offsetLeft;
      tw = b.offsetWidth;
    }
    ton = !!b;
  }
  $effect(() => {
    void value;
    void options.length;
    measure();
    const id = requestAnimationFrame(() => (ready = true));
    return () => cancelAnimationFrame(id);
  });
  // Re-measure when the control changes size (fonts loading, container resizes).
  $effect(() => {
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    return () => ro.disconnect();
  });
</script>

<div class="seg {size}" class:ready role="radiogroup" bind:this={root}>
  <span class="thumb" class:on={ton} style="transform: translateX({tx}px); width: {tw}px" aria-hidden="true"></span>
  {#each options as o, i (o.value)}
    <button
      bind:this={btns[i]}
      role="radio"
      aria-checked={value === o.value}
      class:active={value === o.value}
      onclick={() => {
        value = o.value;
        onchange?.(o.value);
      }}>{o.label}</button
    >
  {/each}
</div>

<style>
  .seg {
    position: relative;
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: 11px;
    background: var(--bg-3);
    box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.05);
  }
  .thumb {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 0;
    border-radius: 8px;
    background: var(--bg);
    box-shadow: var(--hi), 0 1px 2px rgb(0 0 0 / 0.1), 0 0 0 1px var(--line);
    opacity: 0;
  }
  .thumb.on {
    opacity: 1;
  }
  .ready .thumb {
    transition: transform 0.4s var(--glide), width 0.4s var(--glide), opacity 0.2s;
  }
  button {
    position: relative;
    z-index: 1;
    height: 26px;
    padding: 0 11px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--fg-3);
    transition: color 0.2s var(--ease);
    white-space: nowrap;
  }
  button:hover {
    color: var(--fg);
  }
  button.active {
    color: var(--fg);
  }
  .sm button {
    height: 22px;
    padding: 0 8px;
    font-size: 12px;
    border-radius: 7px;
  }
  .sm .thumb {
    border-radius: 7px;
  }
</style>
