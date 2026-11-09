<script lang="ts" module>
  // Seven-segment glyphs, like a Stackmat display. Segments: a b c d e f g.
  const GLYPH: Record<string, string> = {
    '0': 'abcdef',
    '1': 'bc',
    '2': 'abdeg',
    '3': 'abcdg',
    '4': 'bcfg',
    '5': 'acdfg',
    '6': 'acdefg',
    '7': 'abc',
    '8': 'abcdefg',
    '9': 'abcdfg',
    '-': 'g',
    ' ': '',
  };
  // Slightly slanted hexagonal segments in a 56 × 100 cell.
  const SEG: Record<string, string> = {
    a: '12,4 48,4 42,10 18,10',
    b: '50,6 52,46 46,42 44,12',
    c: '52,54 50,94 44,88 46,58',
    d: '48,96 12,96 18,90 42,90',
    e: '10,94 8,54 14,58 16,88',
    f: '8,46 10,6 16,12 14,42',
    g: '10,50 16,45 44,45 50,50 44,55 16,55',
  };
  const ALL = Object.keys(SEG);
</script>

<script lang="ts">
  let { text }: { text: string } = $props();
  const chars = $derived([...text]);
  const lcd = $derived(chars.every((c) => c in GLYPH || c === '.' || c === ':'));
</script>

{#if lcd}
  <span class="lcd" aria-label={text} role="img">
    {#each chars as c, i (i)}
      {#if c === '.'}
        <svg class="dot" viewBox="0 0 14 100" aria-hidden="true"><circle cx="6" cy="92" r="5" /></svg>
      {:else if c === ':'}
        <svg class="dot" viewBox="0 0 14 100" aria-hidden="true"><circle cx="7" cy="32" r="5" /><circle cx="6" cy="70" r="5" /></svg>
      {:else}
        <svg class="digit" viewBox="0 0 60 100" aria-hidden="true">
          {#each ALL as s (s)}
            <polygon points={SEG[s]} class:on={GLYPH[c].includes(s)} />
          {/each}
        </svg>
      {/if}
    {/each}
  </span>
{:else}
  <span class="fallback">{text}</span>
{/if}

<style>
  .lcd {
    display: inline-flex;
    align-items: flex-end;
    height: 0.8em;
    gap: 0.04em;
    vertical-align: baseline;
  }
  svg {
    height: 100%;
    width: auto;
    overflow: visible;
  }
  .digit {
    aspect-ratio: 60 / 100;
  }
  .dot {
    aspect-ratio: 14 / 100;
  }
  polygon {
    fill: currentColor;
    opacity: 0.07;
    transition: opacity 0.04s linear;
  }
  polygon.on {
    opacity: 1;
  }
  circle {
    fill: currentColor;
  }
  .fallback {
    font-family: var(--mono);
    letter-spacing: 0;
  }
</style>
