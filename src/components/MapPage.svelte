<script lang="ts">
  /** Vollbildkarte mit Kategorie-Layern, Stationssprung und Tagesfilter. */
  import MapView from './MapView.svelte';
  import { CATEGORIES, type Category, type Place } from '../lib/places';
  import { buildDays, formatDay, stations, type TripDay } from '../lib/trip';
  import { placesOfDay, isDone, plan } from '../lib/store.svelte';

  type Props = { places: Place[] };
  let { places }: Props = $props();

  const days: TripDay[] = buildDays();

  let cats = $state<Set<Category>>(new Set(CATEGORIES.map((c) => c.key)));
  let mode = $state<'alle' | 'tag' | 'geplant' | 'offen'>('alle');
  let day = $state<string>(days[0].date);
  let selected = $state<number | null>(null);
  let mapRef = $state<MapView | null>(null);
  let panelOpen = $state(false);

  let visible = $derived.by(() => {
    let list = places.filter((p) => cats.has(p.category));

    if (mode === 'tag') {
      const onDay = new Set(placesOfDay(day));
      list = list.filter((p) => onDay.has(p.nr));
    } else if (mode === 'geplant') {
      const planned = new Set(Object.values(plan.days).flatMap((d) => d.placeNrs));
      list = list.filter((p) => planned.has(p.nr));
    } else if (mode === 'offen') {
      list = list.filter((p) => !isDone(p.nr));
    }

    return list.map((p) => p.nr);
  });

  /** Im Tagesmodus die geplante Reihenfolge als Linie zeigen. */
  let route = $derived(mode === 'tag' ? placesOfDay(day) : []);

  function toggleCat(key: Category) {
    const next = new Set(cats);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    cats = next.size ? next : new Set([key]);
  }

  function goStation(slug: string) {
    const s = stations.find((x) => x.slug === slug);
    if (s) mapRef?.flyTo(s.center as [number, number], s.zoom);
  }

  let dayCount = $derived(placesOfDay(day).length);
</script>

<div class="page">
  <div class="mapholder">
    <MapView
      bind:this={mapRef}
      {places}
      {visible}
      {route}
      {selected}
      fullscreen
      onselect={(nr) => (selected = nr)}
    />
  </div>

  <button class="toggle" onclick={() => (panelOpen = !panelOpen)} aria-expanded={panelOpen}>
    {panelOpen ? '✕' : '☰'} Filter
  </button>

  <aside class="panel" class:open={panelOpen}>
    <section>
      <h4>Kategorien</h4>
      <div class="chips">
        {#each CATEGORIES as c (c.key)}
          <button
            class="chip"
            class:on={cats.has(c.key)}
            style={`--chip:${c.color}`}
            onclick={() => toggleCat(c.key)}
            aria-pressed={cats.has(c.key)}
          >
            <i></i>{c.short}
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h4>Auswahl</h4>
      <div class="chips">
        <button class="chip plain" class:on={mode === 'alle'} onclick={() => (mode = 'alle')}>alle 164</button>
        <button class="chip plain" class:on={mode === 'offen'} onclick={() => (mode = 'offen')}>noch offen</button>
        <button class="chip plain" class:on={mode === 'geplant'} onclick={() => (mode = 'geplant')}>eingeplant</button>
        <button class="chip plain" class:on={mode === 'tag'} onclick={() => (mode = 'tag')}>ein Tag</button>
      </div>

      {#if mode === 'tag'}
        <select bind:value={day} aria-label="Tag">
          {#each days as d (d.date)}
            <option value={d.date}>
              {formatDay(d.date)} · {d.station.name} ({placesOfDay(d.date).length})
            </option>
          {/each}
        </select>
        <p class="hint">
          {#if dayCount}
            {dayCount} {dayCount === 1 ? 'Ort' : 'Orte'} · die Linie zeigt die geplante Reihenfolge
          {:else}
            Für diesen Tag ist noch nichts geplant.
          {/if}
        </p>
      {/if}
    </section>

    <section>
      <h4>Stationen</h4>
      <div class="stations">
        {#each stations as s (s.slug)}
          <button class="stationbtn" onclick={() => goStation(s.slug)}>
            <b>{s.no}</b>
            <span>{s.name}</span>
            <small>{s.nights} N.</small>
          </button>
        {/each}
      </div>
    </section>

    <section class="foot">
      <button class="btn small" onclick={() => mapRef?.fitVisible()}>Auf Auswahl einpassen</button>
      <p class="count">{visible.length} von {places.length} Orten sichtbar</p>
    </section>
  </aside>
</div>

<style>
  .page {
    position: relative;
    height: var(--app-h);
    display: flex;
    /* Das Filterblatt liegt auf dem Handy per translateX(100%) außerhalb des
       Bildes. Ohne diese Zeile spannt es den Scrollbereich auf und die Seite
       lässt sich seitlich wegschieben. */
    overflow: hidden;
  }

  .mapholder {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  .panel {
    width: 264px;
    flex: none;
    background: var(--washi-2);
    border-left: 1px solid var(--line);
    overflow-y: auto;
    padding: 16px 15px 22px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h4 {
    font-size: 0.68rem;
    letter-spacing: 0.16em;
    color: var(--shu);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--util);
    font-size: 0.72rem;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 10px;
    cursor: pointer;
    color: var(--ai-40);
  }

  .chip i {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--chip);
    opacity: 0.3;
    flex: none;
  }

  .chip.on {
    color: var(--ai);
    border-color: var(--chip, var(--shu));
  }

  .chip.on i {
    opacity: 1;
  }

  .chip.plain.on {
    background: var(--ai);
    border-color: var(--ai);
    color: var(--washi);
  }

  select {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 7px 9px;
    font-family: var(--util);
    font-size: 0.76rem;
    width: 100%;
  }

  .hint,
  .count {
    font-family: var(--util);
    font-size: 0.68rem;
    color: var(--ai-40);
    margin: 0;
    line-height: 1.45;
  }

  .stations {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .stationbtn {
    display: flex;
    align-items: center;
    gap: 9px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    cursor: pointer;
    font-family: var(--util);
    text-align: left;
  }

  .stationbtn:hover {
    border-color: var(--kin);
    background: var(--card);
  }

  .stationbtn b {
    font-family: var(--disp);
    color: var(--shu);
    font-size: 0.82rem;
    flex: none;
  }

  .stationbtn span {
    flex: 1;
    font-size: 0.82rem;
  }

  .stationbtn small {
    color: var(--ai-40);
    font-size: 0.66rem;
  }

  .foot {
    margin-top: auto;
    border-top: 1px solid var(--line);
    padding-top: 13px;
  }

  .toggle {
    display: none;
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 30;
    font-family: var(--util);
    font-size: 0.75rem;
    background: var(--ai);
    color: var(--washi);
    border: 1px solid var(--kin);
    border-radius: 999px;
    padding: 8px 15px;
    cursor: pointer;
  }

  @media (max-width: 800px) {
    .toggle {
      display: block;
    }
    .panel {
      position: absolute;
      inset: 0 0 auto auto;
      height: 100%;
      width: min(86vw, 290px);
      transform: translateX(100%);
      transition: transform 0.2s ease, visibility 0.2s;
      visibility: hidden;
      z-index: 25;
      box-shadow: -8px 0 24px rgba(13, 22, 38, 0.18);
      padding-top: 56px;
    }
    .panel.open {
      transform: translateX(0);
      visibility: visible;
    }
  }
</style>
