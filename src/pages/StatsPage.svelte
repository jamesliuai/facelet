<script lang="ts">
  import Select from '../components/Select.svelte';
  import Segmented from '../components/Segmented.svelte';
  import TrendChart from '../components/charts/TrendChart.svelte';
  import Histogram from '../components/charts/Histogram.svelte';
  import Heatmap from '../components/charts/Heatmap.svelte';
  import Bars from '../components/charts/Bars.svelte';
  import { sessions, type Solve } from '../lib/store/sessions.svelte';
  import { settings } from '../lib/store/settings.svelte';
  import { EVENTS, VIRTUAL_EVENTS, eventById } from '../lib/scramble/events';
  import { solveValue, rolling, parseAvgSpec, trimCount, averageOf, roundAvg } from '../lib/stats/stats';
  import { formatTime, formatDate, formatDuration, parseTimeEntry } from '../lib/stats/format';

  let eventId = $state(sessions.current?.event ?? '333');
  let sessionId = $state<string>(sessions.currentId);
  let range = $state<'100' | '1000' | 'all'>('all');
  let solves = $state.raw<Solve[]>([]);
  let loading = $state(true);
  let sub = $state('');

  const eventsWithData = $derived.by(() => {
    const ids = new Set(sessions.list.map((s) => s.event));
    return [...EVENTS, ...VIRTUAL_EVENTS].filter((e) => ids.has(e.id)).map((e) => ({ value: e.id, label: e.name }));
  });
  const sessionOptions = $derived([
    { value: 'all', label: `All ${eventById(eventId).short} sessions` },
    ...sessions.sorted().filter((s) => s.event === eventId).map((s) => ({ value: s.id, label: s.name })),
  ]);

  $effect(() => {
    const sid = sessionId;
    const ev = eventId;
    void sessions.version;
    loading = true;
    const load = async () => {
      if (sid === 'all') {
        const ids = sessions.list.filter((s) => s.event === ev).map((s) => s.id);
        const all = (await Promise.all(ids.map((id) => sessions.solvesOf(id)))).flat();
        return all.sort((a, b) => a.date - b.date);
      }
      return sessions.solvesOf(sid);
    };
    void load().then((r) => {
      if (sid === sessionId && ev === eventId) {
        solves = r;
        loading = false;
      }
    });
  });

  function onEvent(id: string) {
    eventId = id;
    const s = sessions.sorted().find((x) => x.event === id);
    sessionId = s?.id ?? 'all';
  }

  const p = $derived(settings.precision);
  const ev = $derived(eventById(eventId));
  const values = $derived(solves.map((s) => solveValue(s, p)));
  const n = $derived(values.length);
  // The range applies to every card: "Last 100" is a view of your recent form.
  const offset = $derived(range === 'all' ? 0 : Math.max(0, n - parseInt(range)));
  const shown = $derived(offset ? values.slice(offset) : values);
  const shownSolves = $derived(offset ? solves.slice(offset) : solves);

  // One rolling pass per average over the whole history, shared by every card
  // (windows that start before the range still count, so the lines don't restart).
  const rolls = $derived.by(() => {
    void values;
    void settings.trimPct;
    void p;
    return new Map<string, Float64Array>();
  });
  function roll(label: string): Float64Array {
    let r = rolls.get(label);
    if (!r) {
      r = rolling(values, parseAvgSpec(label)!, settings.trimPct, p);
      rolls.set(label, r);
    }
    return r;
  }
  function bestIn(label: string): { v: number; i: number } {
    const r = roll(label);
    let v = NaN;
    let i = -1;
    for (let k = offset; k < r.length; k++) {
      const x = r[k];
      if (!Number.isNaN(x) && (i < 0 || x < v)) {
        v = x;
        i = k;
      }
    }
    return { v, i };
  }

  const trend = $derived.by(() => {
    const out: { label: string; values: ArrayLike<number>; tone: 'strong' | 'mid' | 'soft' }[] = [];
    if (n >= 5 && n < 50) out.push({ label: 'ao5', values: roll('ao5').subarray(offset), tone: 'mid' });
    if (n >= 12) out.push({ label: 'ao12', values: roll('ao12').subarray(offset), tone: n >= 100 ? 'mid' : 'strong' });
    if (n >= 100) out.push({ label: 'ao100', values: roll('ao100').subarray(offset), tone: 'strong' });
    return out;
  });

  // Headline averages follow the event's format: mo3 for big cubes and FMC, success rate for BLD.
  const bld = $derived(ev.format === 'bo3' || ev.format === 'bo5');
  const kpiAvgs = $derived(ev.format === 'ao5' ? ['ao5', 'ao12', 'ao100'] : bld ? ['mo3', 'ao5'] : ['mo3', 'ao5', 'ao12']);
  const kpis = $derived.by(() => {
    let ok = 0;
    let sum = 0;
    let sumSq = 0;
    let single = Infinity;
    for (const v of shown) {
      if (!isFinite(v)) continue;
      ok++;
      sum += v;
      sumSq += v * v;
      if (v < single) single = v;
    }
    let total = 0;
    for (const s of shownSolves) total += s.time;
    return {
      count: shown.length,
      dnf: shown.length - ok,
      single: ok ? single : NaN,
      mean: ok ? roundAvg(sum / ok, p) : NaN,
      sd: ok > 1 ? Math.sqrt(Math.max(0, sumSq / ok - (sum / ok) ** 2)) : NaN,
      rate: shown.length ? ok / shown.length : NaN,
      avgs: kpiAvgs.map((l) => ({ label: l, ...bestIn(l) })),
      total,
      first: shownSolves[0]?.date,
    };
  });

  const pb = $derived.by(() => {
    const run = (arr: ArrayLike<number>) => {
      const out = new Array<number>(arr.length - offset);
      let best = NaN;
      for (let k = offset; k < arr.length; k++) {
        const v = arr[k];
        if (!Number.isNaN(v) && isFinite(v) && (Number.isNaN(best) || v < best)) best = v;
        out[k - offset] = best;
      }
      return out;
    };
    const singles = run(values);
    return {
      singles,
      series: [
        ...(n >= 5 ? [{ label: 'ao5', values: run(roll('ao5')), tone: 'mid' as const }] : []),
        ...(n >= 12 ? [{ label: 'ao12', values: run(roll('ao12')), tone: 'strong' as const }] : []),
        { label: 'single', values: singles, tone: 'soft' as const },
      ],
    };
  });

  const hours = $derived.by(() => {
    const h = new Array(24).fill(0);
    for (const s of shownSolves) h[new Date(s.date).getHours()]++;
    return h;
  });
  const weekdays = $derived.by(() => {
    const w = new Array(7).fill(0);
    for (const s of shownSolves) w[(new Date(s.date).getDay() + 6) % 7]++;
    return w;
  });

  const thresholds = $derived.by(() => {
    const finite = shown.filter(isFinite).sort((a, b) => a - b);
    if (!finite.length) return [];
    const med = finite[Math.floor(finite.length / 2)];
    const step = med < 30000 ? 1000 : med < 120000 ? 5000 : 30000;
    const base = Math.floor(med / step) * step;
    const list = [base - 2 * step, base - step, base, base + step, base + 2 * step].filter((t) => t > 0);
    const custom = sub.trim() ? parseTimeEntry(sub, 3) : null;
    if (custom && custom.penalty === 0) list.push(custom.time);
    return [...new Set(list)].sort((a, b) => a - b).map((t) => ({ t, n: shown.filter((v) => v < t).length }));
  });

  const table = $derived.by(() => {
    return ['mo3', 'ao5', 'ao12', 'ao25', 'ao50', 'ao100', 'ao200', 'ao500', 'ao1000']
      .map((l) => {
        const spec = parseAvgSpec(l)!;
        if (n < spec.n || n - offset < 1) return null;
        const { v, i } = bestIn(l);
        if (i < 0) return null;
        return { label: l, best: v, date: solves[i]?.date, current: roll(l)[n - 1], trim: spec.mean ? 0 : trimCount(spec.n, settings.trimPct) };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  });

  const sessionAvg = $derived(shown.length >= 3 ? averageOf(shown, trimCount(shown.length, settings.trimPct), p) : NaN);
  const scopeLabel = $derived(sessionId === 'all' ? `all ${ev.short} sessions` : sessions.list.find((s) => s.id === sessionId)?.name ?? '');
  const HOURS = Array.from({ length: 24 }, (_, i) => (i % 6 === 0 ? `${i}h` : ''));
  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
</script>

<div class="page">
  <div class="page-inner">
    <span class="eyebrow">{ev.name}{scopeLabel ? ` · ${scopeLabel}` : ''}</span>
    <h1 class="page-title">Statistics</h1>
    <p class="page-sub">WCA-style statistics: singles truncated, averages rounded, and aoN trimmed by {settings.trimPct}% from each end. The range applies to every card.</p>

    <div class="filters">
      <Select options={eventsWithData} value={eventId} onchange={onEvent} label="Event" width={240} />
      <Select options={sessionOptions} bind:value={sessionId} label="Session" width={260} />
      <span class="grow"></span>
      <Segmented bind:value={range} options={[{ value: '100', label: 'Last 100' }, { value: '1000', label: 'Last 1000' }, { value: 'all', label: 'All' }]} size="sm" />
    </div>

    {#if !loading && values.length === 0}
      <div class="empty card">No solves here yet. Times you record on the timer show up here.</div>
    {:else}
      <div class="kpis">
        <div class="kpi"><span>Solves</span><b>{kpis.count.toLocaleString()}</b><em>{kpis.dnf} DNF</em></div>
        <div class="kpi"><span>Best single</span><b>{formatTime(kpis.single, p)}</b><em>mean {formatTime(kpis.mean, p)}</em></div>
        {#if bld}
          <div class="kpi"><span>Success rate</span><b>{Number.isNaN(kpis.rate) ? '–' : `${Math.round(kpis.rate * 100)}%`}</b><em>{kpis.count - kpis.dnf} of {kpis.count}</em></div>
        {/if}
        {#each kpis.avgs as a (a.label)}
          <div class="kpi"><span>Best {a.label}</span><b>{formatTime(a.v, p)}</b><em>{a.i >= 0 && solves[a.i] ? formatDate(solves[a.i].date, false) : '–'}</em></div>
        {/each}
        <div class="kpi"><span>Time solving</span><b>{formatDuration(kpis.total)}</b><em>{kpis.first ? `since ${formatDate(kpis.first, false)}` : ''}{Number.isNaN(kpis.sd) ? '' : ` · σ ${(kpis.sd / 1000).toFixed(2)}`}</em></div>
      </div>

      <section class="card block">
        <header>
          <h2>Progress</h2>
          <div class="legend">
            <span><i class="dot"></i>single</span>
            {#each trend as s}<span><i class="ln {s.tone}"></i>{s.label}</span>{/each}
          </div>
        </header>
        <TrendChart singles={shown} series={trend} precision={p} labelFor={(i) => `#${i + 1 + offset}${solves[i + offset] ? ' · ' + formatDate(solves[i + offset].date, false) : ''}`} />
      </section>

      <div class="two">
        <section class="card block">
          <header><h2>Distribution</h2><span class="muted small">session average {formatTime(sessionAvg, p)}</span></header>
          <Histogram values={shown} precision={p} />
        </section>
        <section class="card block">
          <header>
            <h2>Personal bests</h2>
            <div class="legend">{#each pb.series as s}<span><i class="ln {s.tone}"></i>{s.label}</span>{/each}</div>
          </header>
          <TrendChart singles={pb.singles} series={pb.series} precision={p} dots={false} height={220} />
        </section>
      </div>

      <section class="card block">
        <header><h2>Practice calendar</h2><span class="muted small">{scopeLabel}{offset ? ` · last ${n - offset} solves` : ''}</span></header>
        <Heatmap dates={shownSolves.map((s) => s.date)} />
      </section>

      <div class="two">
        <section class="card block">
          <header><h2>Time of day</h2></header>
          <Bars values={hours} labels={HOURS} />
        </section>
        <section class="card block">
          <header><h2>Weekday</h2></header>
          <Bars values={weekdays} labels={DAYS} />
        </section>
      </div>

      <div class="two">
        <section class="card block">
          <header>
            <h2>Sub-X</h2>
            <input class="input sub" placeholder="custom, e.g. 12.5 or 1:05" bind:value={sub} inputmode="decimal" aria-label="Custom threshold in seconds" />
          </header>
          <table class="t num">
            <thead><tr><th>under</th><th>solves</th><th>share</th></tr></thead>
            <tbody>
              {#each thresholds as r}
                <tr>
                  <td>{formatTime(r.t, r.t % 10 ? 3 : 2).replace(/\.00$/, '')}</td>
                  <td>{r.n.toLocaleString()}</td>
                  <td>
                    <span class="bar"><span style="width:{(r.n / Math.max(1, shown.length)) * 100}%"></span></span>
                    {((r.n / Math.max(1, shown.length)) * 100).toFixed(1)}%
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
        <section class="card block">
          <header><h2>Best averages</h2><span class="muted small">trim shown per average</span></header>
          <table class="t num">
            <thead><tr><th></th><th>best</th><th>current</th><th>when</th></tr></thead>
            <tbody>
              {#each table as r}
                <tr>
                  <td>{r.label} <span class="muted small">{r.trim ? `−${r.trim}/${r.trim}` : ''}</span></td>
                  <td><b>{formatTime(r.best, p)}</b></td>
                  <td>{formatTime(r.current, p)}</td>
                  <td class="muted">{r.date ? formatDate(r.date, false) : '–'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      </div>
    {/if}
  </div>
</div>

<style>
  .filters {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .grow {
    flex: 1;
  }
  .empty {
    padding: 48px;
    text-align: center;
    color: var(--fg-3);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .kpi {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: var(--hi), var(--shadow-sm);
    padding: 14px 16px 13px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .kpi span {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--fg-3);
  }
  .kpi b {
    font-size: 27px;
    font-weight: 500;
    line-height: 1.1;
    letter-spacing: -0.035em;
    font-variant-numeric: proportional-nums;
  }
  .kpi em {
    font-style: normal;
    font-size: 11.5px;
    color: var(--fg-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .block {
    padding: 18px 20px 16px;
    margin-bottom: 14px;
    min-width: 0;
    border-radius: var(--r-xl);
  }
  .block header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  h2 {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--fg-2);
    margin: 0;
  }
  .small {
    font-size: 12px;
  }
  .legend {
    display: flex;
    gap: 14px;
    font-size: 12px;
    color: var(--fg-2);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--fg-4);
  }
  .ln {
    width: 16px;
    height: 2px;
    border-radius: 2px;
    background: var(--fg);
  }
  .ln.mid {
    background: var(--fg-2);
  }
  .ln.soft {
    background: var(--fg-3);
    height: 1.5px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .t {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .t th {
    text-align: left;
    font-family: var(--mono);
    font-weight: 500;
    font-size: 10px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--fg-3);
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  .t td {
    padding: 7px 8px;
    border-bottom: 1px solid var(--line);
  }
  .t tr:last-child td {
    border-bottom: 0;
  }
  .t b {
    font-weight: 600;
  }
  .bar {
    display: inline-block;
    width: 80px;
    height: 4px;
    border-radius: 4px;
    background: var(--line);
    margin-right: 8px;
    vertical-align: middle;
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--fg);
  }
  .sub {
    width: 140px;
    height: 28px;
  }
  @media (max-width: 1000px) {
    .kpis {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  @media (max-width: 760px) {
    .two {
      grid-template-columns: 1fr;
    }
    .kpis {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
