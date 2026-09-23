<script lang="ts">
  /**
   * Wo in der Reise ihr gerade steht — als Zeitleiste über die 20 Tage.
   *
   * Hier stand vorher, wie viele der 164 Orte eingeplant und besucht sind.
   * Das ist bewusst raus: Eine Fortschrittsanzeige über Orte macht aus einer
   * Reise eine Liste zum Abarbeiten. Was hier zählt, ist der Tag — vorher das
   * Warten, unterwegs der Platz in der Reise, danach nichts mehr.
   */
  import { buildDays, daysBetween, formatFull, heuteInJapan, stations, trip } from '../lib/trip';
  import { url } from '../lib/paths';

  const days = buildDays();

  /**
   * Tage bis zur Abreise, gezählt ab **heute in Japan**. Bis zum 23.09. stand
   * hier das UTC-Datum — in Japan vor 9 Uhr morgens also noch gestern.
   */
  function tageBis(iso: string): number {
    return daysBetween(heuteInJapan(), iso);
  }

  const bisAbreise = tageBis(trip.start);
  /** 1-basierter Reisetag, oder 0 davor und days.length+1 danach. */
  const heuteNr = bisAbreise > 0 ? 0 : Math.min(days.length + 1, 1 - bisAbreise);
  const unterwegs = heuteNr >= 1 && heuteNr <= days.length;

  const heute = unterwegs ? days[heuteNr - 1] : null;

  /** Stationsblöcke für die Leiste: je Station die Zahl ihrer Tage. */
  const bloecke = stations.map((s) => ({
    ...s,
    tage: days.filter((d) => d.station.slug === s.slug),
  }));

  const farbe = ['var(--shu)', 'var(--kin)', 'var(--matcha)', 'var(--ai)', '#2F5D6B', 'var(--shu-deep)'];
</script>

<div class="status" class:laeuft={unterwegs}>
  <div class="zahl">
    {#if bisAbreise > 0}
      <b>{bisAbreise}</b>
      <span>{bisAbreise === 1 ? 'Tag' : 'Tage'} bis zur Abreise</span>
    {:else if unterwegs}
      <b>{heuteNr}</b>
      <span>von {days.length} Reisetagen</span>
    {:else}
      <b>旅</b>
      <span>Reise vorbei</span>
    {/if}
  </div>

  <div class="rechts">
    {#if unterwegs && heute}
      <p class="heute">
        <b>{heute.label}</b> in {heute.station.name}
        {#if heute.leg}
          · <span class="umzug">Umzug nach {heute.leg.to}, {heute.leg.connection}</span>
        {:else if heute.isDeparture}
          · <span class="umzug">Rückflug</span>
        {/if}
      </p>
    {:else if bisAbreise > 0}
      <p class="heute">
        Ab <b>{formatFull(trip.start)}</b> zählt hier der Reisetag.
        Bis dahin liegt im <a href={url('plan')}>Tagesplan</a> alles bereit.
      </p>
    {:else}
      <p class="heute">Zwanzig Tage, sechs Stationen. Der <a href={url('plan')}>Plan</a> bleibt stehen.</p>
    {/if}

    <!-- Die Leiste: ein Feld je Reisetag, gruppiert nach Station. -->
    <div class="leiste" role="img" aria-label={`Reisetag ${heuteNr} von ${days.length}`}>
      {#each bloecke as b, i (b.slug)}
        <div class="block" style={`--f:${farbe[i % farbe.length]}; flex-grow:${b.tage.length}`}>
          <div class="felder">
            {#each b.tage as d (d.date)}
              <i
                class="feld"
                class:vorbei={heuteNr > d.dayNo}
                class:jetzt={heuteNr === d.dayNo}
                title={`${d.label} · ${d.station.name}`}
              ></i>
            {/each}
          </div>
          <span class="name">{b.name}</span>
        </div>
      {/each}
    </div>
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

  /* Unterwegs darf die Karte etwas mehr Gewicht haben. */
  .status.laeuft {
    border-color: var(--shu);
  }

  .zahl {
    text-align: center;
    padding-right: 20px;
    border-right: 1px solid var(--line);
    min-width: 108px;
  }

  .zahl b {
    display: block;
    font-family: var(--disp);
    font-weight: 700;
    font-size: 2.7rem;
    line-height: 1;
    color: var(--shu);
  }

  .zahl span {
    font-family: var(--util);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ai-40);
    display: block;
    margin-top: 4px;
  }

  .rechts {
    display: flex;
    flex-direction: column;
    gap: 13px;
    min-width: 0;
  }

  .heute {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ai-60);
    line-height: 1.5;
  }

  .heute b {
    color: var(--ai);
  }

  .umzug {
    font-family: var(--util);
    font-size: 0.78rem;
    color: var(--kin);
  }

  .leiste {
    display: flex;
    gap: 7px;
    align-items: flex-end;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    /* Die Breite wächst mit der Zahl der Tage (flex-grow kommt aus dem Markup),
       damit die Leiste die Reise maßstäblich zeigt: Tokio ist dreimal so lang
       wie Kanazawa, und genau so soll es aussehen. */
    flex: 0 1 0;
  }

  .felder {
    display: flex;
    gap: 2px;
  }

  .feld {
    flex: 1 1 0;
    height: 9px;
    border-radius: 2px;
    background: var(--washi-2);
    border: 1px solid var(--line);
    min-width: 6px;
  }

  .feld.vorbei {
    background: var(--f);
    border-color: var(--f);
    opacity: 0.55;
  }

  .feld.jetzt {
    background: var(--f);
    border-color: var(--f);
    box-shadow: 0 0 0 2px var(--card), 0 0 0 3px var(--f);
  }

  .name {
    font-family: var(--util);
    font-size: 0.6rem;
    letter-spacing: 0.06em;
    color: var(--ai-40);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    .status {
      grid-template-columns: 1fr;
    }

    .zahl {
      border-right: none;
      border-bottom: 1px solid var(--line);
      padding: 0 0 12px;
      text-align: left;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .zahl span {
      margin: 0;
    }

    /* Sechs Namen nebeneinander bei 390 px: kleiner setzen, und die kurzen
       Blöcke kürzen ihren Namen über text-overflow ab. */
    .name {
      font-size: 0.52rem;
    }
  }
</style>
