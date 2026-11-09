<script lang="ts">
  let { size = 20 }: { size?: number } = $props();
  const cells = Array.from({ length: 9 }, (_, i) => i);
</script>

<!-- One lit facelet on a quiet face: Facelet's mark. -->
<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  {#each cells as i}
    <rect
      x={1.25 + (i % 3) * 7.4}
      y={1.25 + Math.floor(i / 3) * 7.4}
      width="6.6"
      height="6.6"
      rx="1.9"
      fill={i === 0 ? 'var(--accent)' : 'currentColor'}
      opacity={i === 0 ? 1 : 0.16}
    />
  {/each}
</svg>
