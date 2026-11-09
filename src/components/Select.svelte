<script lang="ts" generics="T extends string | number">
  import Dropdown from './Dropdown.svelte';
  import Icon from './Icon.svelte';

  interface Option {
    value: T;
    label: string;
    hint?: string;
    group?: string;
  }

  let {
    value = $bindable(),
    options,
    onchange,
    label = '',
    size = 'md',
    align = 'start',
    width = 0,
    plain = false,
  }: {
    value: T;
    options: Option[];
    onchange?: (v: T) => void;
    label?: string;
    size?: 'sm' | 'md';
    align?: 'start' | 'end';
    width?: number;
    plain?: boolean;
  } = $props();

  let open = $state(false);
  let focus = $state(-1);
  const current = $derived(options.find((o) => o.value === value));

  function pick(v: T, close: () => void) {
    value = v;
    onchange?.(v);
    close();
  }

  function onkey(e: KeyboardEvent) {
    if (!open) return;
    const close = () => (open = false);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focus = Math.min(options.length - 1, focus + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focus = Math.max(0, focus - 1);
    } else if (e.key === 'Enter' && focus >= 0) {
      e.preventDefault();
      pick(options[focus].value, close);
    }
  }

  $effect(() => {
    if (open) focus = options.findIndex((o) => o.value === value);
  });
</script>

<svelte:window onkeydown={onkey} />

<Dropdown bind:open {align} {width}>
  {#snippet trigger({ toggle })}
    <button class="sel {size}" class:plain class:open onclick={toggle} aria-haspopup="listbox" aria-expanded={open} aria-label={label || current?.label}>
      <span class="txt">{current?.label ?? '—'}</span>
      <Icon name="down" size={14} />
    </button>
  {/snippet}
  {#snippet children({ close })}
    <div role="listbox">
      {#each options as o, i (o.value)}
        {#if o.group && (i === 0 || options[i - 1].group !== o.group)}
          <div class="menu-head">{o.group}</div>
        {/if}
        <button
          class="menu-item"
          class:selected={o.value === value}
          class:focused={i === focus}
          role="option"
          aria-selected={o.value === value}
          onclick={() => pick(o.value, close)}
          onpointerenter={() => (focus = i)}
        >
          <span class="check">{#if o.value === value}<Icon name="check" size={14} />{/if}</span>
          <span>{o.label}</span>
          {#if o.hint}<span class="hint">{o.hint}</span>{/if}
        </button>
      {/each}
    </div>
  {/snippet}
</Dropdown>

<style>
  .sel {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 9px 0 12px;
    border-radius: 11px;
    border: 1px solid var(--line);
    background: var(--bg);
    box-shadow: var(--hi), var(--shadow-sm);
    font-weight: 500;
    font-size: 13px;
    max-width: 100%;
    transition: background 0.15s, border-color 0.15s, transform 0.14s var(--ease);
  }
  .sel:hover,
  .sel.open {
    background: var(--bg-hover);
    border-color: var(--line-3);
  }
  .sel:active {
    transform: scale(0.98);
  }
  .sel.sm {
    height: 28px;
    font-size: 12.5px;
    padding: 0 7px 0 9px;
    border-radius: 9px;
  }
  .sel.plain {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
  .sel.plain:hover,
  .sel.plain.open {
    background: var(--bg-hover);
  }
  .txt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sel :global(.icon) {
    color: var(--fg-3);
  }
  .check {
    width: 14px;
    display: inline-grid;
  }
</style>
