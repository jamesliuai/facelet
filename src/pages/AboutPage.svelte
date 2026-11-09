<script lang="ts">
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  import Logo from '../components/Logo.svelte';
  import { ui } from '../lib/store/ui.svelte';
</script>

<div class="page">
  <div class="page-inner narrow">
    <div class="hero">
      <Logo size={44} />
      <h1>facelet</h1>
      <p>A private, open speedcubing suite.</p>
    </div>

    <section>
      <h2>Private by design</h2>
      <p>Facelet runs entirely in your browser. There are no accounts, no servers, no analytics and no third-party requests, and even the fonts are bundled. Solves live in this browser's IndexedDB, and you can export everything as a JSON backup from Settings → Data. It works offline and can be installed as an app.</p>
    </section>

    <section>
      <h2>Real scrambles</h2>
      <p>3x3 scrambles come from a two-phase (Kociemba) solver written for Facelet. A uniformly random cube state is generated with the browser's cryptographic RNG, solved, and the solution reversed, so every state is equally likely, as WCA Regulation 4b3 requires. 2x2, Pyraminx and Skewb use optimal solvers over their full state spaces and respect the WCA minimum move counts. Clock is random-state by construction. 5x5–7x7 and Megaminx use WCA-style random-move scrambles, which the WCA allows. Square-1 is random-state too: a two-phase solver goes to cube shape, then solves the permutation with parity-aware search. 4x4 currently uses random-move scrambles in WCA notation. Blindfolded scrambles end with random wide moves so the orientation is random, and FMC scrambles are padded with R' U' F.</p>
    </section>

    <section>
      <h2>WCA-correct statistics</h2>
      <p>Singles are truncated to centiseconds, and averages and means are rounded. ao5 and ao12 trim one solve from each end, and larger averages trim 5% (ao50 → 3, ao100 → 5). An average with more DNFs than trimmed solves is a DNF, and a mean with any DNF is a DNF. Inspection follows Regulation A4d: +2 from 15.00 s and DNF from 17.00 s, with spoken 8- and 12-second warnings.</p>
    </section>

    <section>
      <h2>Algorithms</h2>
      <p>OLL, PLL and the 2-look sets use standard community algorithms. F2L, ZBLS (305 cases), COLL, CMLL and all 472 ZBLL cases were enumerated by program, with algorithms found by an exhaustive search in finger-friendly move groups (&lt;R,U&gt;, &lt;R,U,D&gt;, &lt;R,U,F&gt;) and well-known human algorithms preferred where they exist. Every algorithm in the trainer is machine-checked against its case. You can also save your own; they are checked too.</p>
    </section>

    <section>
      <h2>Coming from csTimer?</h2>
      <p>In csTimer, use Export → Export to file, then import that file in Facelet's Settings → Data. Sessions, times, penalties, scrambles, comments, dates and multi-phase splits all come across, and the virtual cube uses csTimer's keyboard layout.</p>
    </section>

    <section>
      <h2>Keyboard</h2>
      <p>Press <span class="kbd">?</span> anywhere for every shortcut, or <span class="kbd">{mac ? '⌘' : 'Ctrl'}</span> <span class="kbd">K</span> to search commands. <button class="link" onclick={() => (ui.shortcutsOpen = true)}>Show shortcuts</button></p>
    </section>

    <section>
      <h2>Credits</h2>
      <p>Typeset in Geist and Geist Mono (SIL Open Font License) and Instrument Serif (OFL). Built with Svelte. Every solver, renderer and chart is hand-written, with no runtime dependencies beyond Svelte itself.</p>
    </section>
  </div>
</div>

<style>
  .narrow {
    max-width: 720px;
  }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 24px 0 18px;
  }
  .hero h1 {
    margin: 10px 0 0;
    font-family: var(--display);
    font-size: 64px;
    font-weight: 400;
    line-height: 0.95;
    letter-spacing: -0.02em;
  }
  :global(:root[data-heading='sans']) .hero h1 {
    font-size: 44px;
    font-weight: 600;
    letter-spacing: -0.05em;
  }
  .hero p {
    margin: 0;
    color: var(--fg-3);
    font-size: 16px;
  }
  section {
    padding: 22px 0;
    border-top: 1px solid var(--line);
  }
  h2 {
    font-family: var(--display);
    font-size: 25px;
    font-weight: 400;
    line-height: 1.15;
    letter-spacing: -0.01em;
    margin: 0 0 8px;
  }
  :global(:root[data-heading='sans']) h2 {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  p {
    margin: 0;
    color: var(--fg-2);
    line-height: 1.65;
  }
  .link {
    text-decoration: underline;
    color: var(--fg);
    margin-left: 6px;
  }
</style>
