<script lang="ts">
  import Modal from './Modal.svelte';
  import { ui } from '../lib/store/ui.svelte';

  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl';
  const alt = mac ? '⌥' : 'Alt';

  const groups: { title: string; rows: [string[], string][] }[] = [
    {
      title: 'Timer',
      rows: [
        [['Space'], 'Hold to arm, release to start; any key stops'],
        [['Esc'], 'Cancel inspection or the running solve'],
        [[alt, '1'], 'Last solve: no penalty'],
        [[alt, '2'], 'Last solve: +2'],
        [[alt, '3'], 'Last solve: DNF'],
        [[alt, '⌫'], 'Delete last solve'],
        [[mod, 'Z'], 'Undo delete'],
        [[alt, '→'], 'Next scramble'],
        [[alt, '←'], 'Previous scramble'],
        [[alt, 'C'], 'Copy scramble'],
        [[alt, 'E'], 'Edit scramble'],
        [[alt, 'I'], 'Toggle inspection'],
        [[alt, 'T'], 'Toggle typing mode'],
        [[alt, 'S'], 'Show or hide the session panel'],
        [[alt, 'F'], 'Full screen'],
      ],
    },
    {
      title: 'Everywhere',
      rows: [
        [[mod, 'K'], 'Command palette'],
        [['?'], 'This sheet'],
        [[alt, 'D'], 'Toggle dark mode'],
        [[alt, 'P'], 'Customize appearance'],
      ],
    },
    {
      title: 'Virtual cube (csTimer layout)',
      rows: [
        [['I', 'K'], "R  R'"],
        [['J', 'F'], "U  U'"],
        [['H', 'G'], "F  F'"],
        [['S', 'L'], "D  D'"],
        [['D', 'E'], "L  L'"],
        [['W', 'O'], "B  B'"],
        [['U', 'M'], "r  r'"],
        [['V', 'R'], "l  l'"],
        [['T', 'Y'], 'x'],
        [['B', 'N'], "x'"],
        [[';', 'A'], "y  y'"],
        [['P', 'Q'], "z  z'"],
        [['5', '6'], 'M'],
        [['X', '.'], "M'"],
        [['2', '9'], "E  E'"],
        [['0', '1'], "S  S'"],
        [[',', 'C'], "u  u'"],
        [['Z', '/'], "d  d'"],
        [['Space'], 'Scramble'],
        [['Esc'], 'Reset'],
      ],
    },
  ];
</script>

<Modal bind:open={ui.shortcutsOpen} title="Keyboard shortcuts" width={760}>
  <div class="cols">
    {#each groups as g}
      <section>
        <h3>{g.title}</h3>
        {#each g.rows as [keys, desc]}
          <div class="row">
            <span class="keys">{#each keys as k}<span class="kbd">{k}</span>{/each}</span>
            <span class="desc">{desc}</span>
          </div>
        {/each}
      </section>
    {/each}
  </div>
</Modal>

<style>
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 8px 28px;
  }
  h3 {
    margin: 4px 0 8px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-3);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 5px 0;
    font-size: 13px;
    border-bottom: 1px solid var(--line);
  }
  .keys {
    display: inline-flex;
    gap: 4px;
    min-width: 62px;
  }
  .desc {
    color: var(--fg-2);
  }
</style>
