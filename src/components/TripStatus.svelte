<script lang="ts">
  /** Countdown und Planungsfortschritt — der einzige bewegliche Teil der Startseite. */
  import { plan } from '../lib/store.svelte';
  import { buildDays, formatDay, trip } from '../lib/trip';
  import { url } from '../lib/paths';

  type Props = { total: number };
  let { total }: Props = $props();

  const days = buildDays();

  /** Tage bis zur Abreise, über UTC gerechnet. */
  function daysUntil(): number {
    const [y, m, d] = trip.start.split('-').map(Number);
    const target = Date.UTC(y, m - 1, d);
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((target - today) / 86_400_000);
  }

  const until = daysUntil();

  let planned = $derived(Object.values(plan.days).reduce((s, d) => s + d.placeNrs.length, 0));
  let visited = $derived(plan.done.length);

  /** Tage ohne einen einzigen geplanten Ort. */
  let emptyDays = $derived(days.filter((d) => !(plan.days[d.date]?.placeNrs.length ?? 0)));

  let percent = $derived(Math.round((visited / total) * 100));
</script>

<div class="status">
  <div class="countdown">
    {#if until > 0}
      <b>{until}</b>
      <span>{until === 1 ? 'Tag' : 'Tage'} bis zur Abreise</span>
    {:else if until > -trip.nights - 1}
      <b>{Math.abs(until) + 1}</b>
      <span>Reisetag läuft</span>
    {:else}
      <b>✓</b>
      <span>Reise vorbei</span>
    {/if}
  </div>

  <div class="bars">
    <div class="bar">
      <div class="barhead">
        <span>Eingeplant</span>
        <b>{planned} von {total} Orten</b>
      </div>
      <div class="track"><i style={`width:${(planned / total) * 100}%`} class="fill plan"></i></div>
    </div>

    <div class="bar">
      <div class="barhead">
        <span>Besucht</span>
        <b>{visited} von {total} · {percent}%</b>
      </div>
      <div class="track"><i style={`width:${percent}%`} class="fill done"></i></div>
    </div>
  </div>

  <div class="hintbox">
    {#if emptyDays.length === days.length}
      <p>
        Noch kein Tag verplant. Im <a href={url('plan')}>Tagesplan</a> liegen die 20 Reisetage bereit —
        die Vorschläge zeigen jeweils nur die Orte der passenden Station.
      </p>
    {:else if emptyDays.length}
      <p>
        <b>{emptyDays.length} {emptyDays.length === 1 ? 'Tag' : 'Tage'} noch leer:</b>
        {emptyDays
          .slice(0, 8)
          .map((d) => formatDay(d.date))
          .join(' · ')}{emptyDays.length > 8 ? ' …' : ''}
      </p>
    {:else}
      <p>Alle {days.length} Tage haben mindestens einen Ort. Fehlt noch etwas?</p>
    {/if}
  </div>
</div>

<style>
  .status {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 16px 22px;
    align-items: center;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 16px 18px;
  }

  .countdown {
    text-align: center;
    padding-right: 20px;
    border-right: 1px solid var(--line);
    min-width: 108px;
  }

  .countdown b {
    display: block;
    font-family: var(--disp);
    font-weight: 700;
    font-size: 2.7rem;
    line-height: 1;
    color: var(--shu);
  }

  .countdown span {
    font-family: var(--util);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ai-40);
    display: block;
    margin-top: 4px;
  }

  .bars {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .barhead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-family: var(--util);
    font-size: 0.7rem;
    color: var(--ai-40);
    margin-bottom: 3px;
    gap: 10px;
  }

  .barhead b {
    color: var(--ai);
    font-size: 0.72rem;
  }

  .track {
    height: 7px;
    background: var(--washi-2);
    border-radius: 999px;
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  .fill.plan {
    background: var(--kin);
  }

  .fill.done {
    background: var(--matcha);
  }

  .hintbox {
    grid-column: 1 / -1;
    border-top: 1px solid var(--line-soft);
    padding-top: 11px;
  }

  .hintbox p {
    margin: 0;
    font-size: 0.86rem;
    color: var(--ai-60);
  }

  .hintbox b {
    color: var(--ai);
  }

  @media (max-width: 560px) {
    .status {
      grid-template-columns: 1fr;
    }
    .countdown {
      border-right: none;
      border-bottom: 1px solid var(--line);
      padding: 0 0 12px;
      text-align: left;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .countdown span {
      margin: 0;
    }
  }
</style>
