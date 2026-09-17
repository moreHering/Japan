<script lang="ts">
  /**
   * Orte-Browser: Filter, Liste und Karte.
   *
   * Liste und Karte liegen bewusst in einer einzigen Komponente. Als zwei
   * getrennte Astro-Islands müssten sie Zustand über die Inselgrenze teilen,
   * was bei Svelte-5-Runes nicht garantiert funktioniert.
   */
  import MapView from './MapView.svelte';
  import PlaceCard from './PlaceCard.svelte';
  import { CATEGORIES, plainText, type Category, type Place } from '../lib/places';
  import { buildDays, formatDay, stations, type TripDay } from '../lib/trip';
  import { addToDay, dayOfPlace, isDone, plan, unplacePlace } from '../lib/store.svelte';

  type Props = { places: Place[] };
  let { places }: Props = $props();

  const days: TripDay[] = buildDays();

  // Die Startseite verlinkt einzelne Stationen als ?station=kyoto.
  const initialStation = (() => {
    if (typeof location === 'undefined') return 'alle';
    const wanted = new URLSearchParams(location.search).get('station');
    return wanted && stations.some((s) => s.slug === wanted) ? wanted : 'alle';
  })();

  let query = $state('');
  let station = $state<string>(initialStation);
  let cats = $state<Set<Category>>(new Set(CATEGORIES.map((c) => c.key)));
  let onlyTips = $state(false);
  let onlyOpen = $state(false);
  let hideDone = $state(false);
  let selected = $state<number | null>(null);
  let targetDay = $state<string>(days[0].date);
  let mobileView = $state<'liste' | 'karte'>('liste');
  let mapRef = $state<MapView | null>(null);

  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return places.filter((p) => {
      if (!cats.has(p.category)) return false;
      if (station !== 'alle' && p.station !== station) return false;
      if (onlyTips && !p.isFriendTip) return false;
      if (onlyOpen && p.closedDay) return false;
      if (hideDone && isDone(p.nr)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        String(p.nr) === q ||
        plainText(p.descriptionHtml).toLowerCase().includes(q)
      );
    });
  });

  let visibleNrs = $derived(filtered.map((p) => p.nr));

  // Nach Station und Nummer gruppieren, damit die Reihenfolge der des Buchs folgt.
  let grouped = $derived.by(() => {
    const map = new Map<string, Place[]>();
    for (const p of [...filtered].sort((a, b) => a.nr - b.nr)) {
      const key = p.stationLabel;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map];
  });

  function toggleCat(key: Category) {
    const next = new Set(cats);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // Nie alles ausschalten — eine leere Karte hilft niemandem.
    cats = next.size ? next : new Set([key]);
  }

  function select(nr: number) {
    selected = nr;
    if (window.matchMedia('(max-width: 900px)').matches) mobileView = 'karte';
  }

  /** Station filtern und die Karte gleich dorthin bewegen. */
  function jumpToStation(slug: string) {
    station = slug;
    selected = null;
    const s = stations.find((x) => x.slug === slug);
    if (s) mapRef?.flyTo(s.center as [number, number], s.zoom);
    else mapRef?.fitVisible();
  }

  let plannedTotal = $derived(
    Object.values(plan.days).reduce((sum, d) => sum + d.placeNrs.length, 0),
  );
</script>

<div class="toolbar">
  <div class="row">
    <label class="search">
      <span class="sr-only">Orte durchsuchen</span>
      <input
        type="search"
        bind:value={query}
        placeholder="Suchen — Name, Nummer oder Stichwort"
        autocomplete="off"
      />
    </label>

    <select
      value={station}
      aria-label="Station"
      onchange={(e) => jumpToStation((e.currentTarget as HTMLSelectElement).value)}
    >
      <option value="alle">Alle Stationen</option>
      {#each stations as s (s.slug)}
        <option value={s.slug}>{s.no} · {s.name}</option>
      {/each}
    </select>
  </div>

  <div class="row cats">
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

    <span class="spacer"></span>

    <button class="chip plain" class:on={onlyTips} onclick={() => (onlyTips = !onlyTips)} aria-pressed={onlyTips}>
      ★ Freundestipps
    </button>
    <button class="chip plain" class:on={hideDone} onclick={() => (hideDone = !hideDone)} aria-pressed={hideDone}>
      offen
    </button>
    <button class="chip plain" class:on={onlyOpen} onclick={() => (onlyOpen = !onlyOpen)} aria-pressed={onlyOpen}>
      ohne Schließtag
    </button>
  </div>

  <div class="row status">
    <span class="count"><b>{filtered.length}</b> von {places.length} Orten</span>
    <span class="count dim">{plannedTotal} eingeplant · {plan.done.length} besucht</span>

    <span class="spacer"></span>

    <label class="target">
      auf Tag
      <select bind:value={targetDay} aria-label="Zieltag für neue Orte">
        {#each days as d (d.date)}
          <option value={d.date}>{d.label} · {d.station.name}</option>
        {/each}
      </select>
    </label>

    <button class="btn small ghost" onclick={() => mapRef?.fitVisible()}>Karte einpassen</button>
  </div>

  <div class="row switch">
    <button class="btn small" class:primary={mobileView === 'liste'} onclick={() => (mobileView = 'liste')}>
      Liste
    </button>
    <button class="btn small" class:primary={mobileView === 'karte'} onclick={() => (mobileView = 'karte')}>
      Karte
    </button>
  </div>
</div>

<div class="split" data-view={mobileView}>
  <div class="list">
    {#if !filtered.length}
      <p class="empty">Kein Ort passt zu diesen Filtern.</p>
    {/if}

    {#each grouped as [label, group] (label)}
      <h2 class="group">
        {label}<span>{group.length}</span>
      </h2>
      {#each group as place (place.nr)}
        <PlaceCard {place} active={selected === place.nr} onselect={select}>
          {#if dayOfPlace(place.nr)}
            <button class="btn small" onclick={() => unplacePlace(place.nr)}>
              vom {formatDay(dayOfPlace(place.nr)!)} nehmen
            </button>
          {:else}
            <button class="btn small primary" onclick={() => addToDay(targetDay, place.nr)}>
              + {formatDay(targetDay)}
            </button>
          {/if}
        </PlaceCard>
      {/each}
    {/each}
  </div>

  <div class="mapwrap">
    <MapView bind:this={mapRef} {places} visible={visibleNrs} {selected} onselect={(nr) => (selected = nr)} />
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-bottom: 14px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    align-items: center;
  }

  .search {
    flex: 1;
    min-width: 190px;
  }

  input[type='search'],
  select {
    width: 100%;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 8px 11px;
    font-family: var(--util);
    font-size: 0.85rem;
  }

  select {
    width: auto;
    cursor: pointer;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--util);
    font-size: 0.74rem;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 11px;
    cursor: pointer;
    color: var(--ai-40);
  }

  .chip i {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--chip);
    opacity: 0.32;
    flex: none;
  }

  .chip.on {
    color: var(--ai);
    border-color: var(--chip, var(--kin));
    background: var(--washi-2);
  }

  .chip.on i {
    opacity: 1;
  }

  .chip.plain.on {
    border-color: var(--shu);
    color: var(--shu-deep);
  }

  .spacer {
    flex: 1;
  }

  .status {
    font-family: var(--util);
    font-size: 0.74rem;
    color: var(--ai-60);
    border-top: 1px solid var(--line-soft);
    padding-top: 9px;
  }

  .count b {
    color: var(--ai);
  }

  .count.dim {
    color: var(--ai-40);
  }

  .target {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.74rem;
  }

  .target select {
    font-size: 0.74rem;
    padding: 5px 8px;
  }

  .switch {
    display: none;
  }

  /* -------------------------------------------------------------- Zweispalter */

  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: calc(100vh - var(--nav-h) - 150px);
    overflow-y: auto;
    padding-right: 4px;
  }

  .group {
    font-family: var(--util);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--shu);
    margin: 14px 0 2px;
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .group:first-child {
    margin-top: 0;
  }

  .group span {
    font-size: 0.66rem;
    color: var(--ai-40);
    background: var(--washi-2);
    border-radius: 999px;
    padding: 1px 7px;
    letter-spacing: 0;
  }

  .mapwrap {
    position: relative;
    height: calc(100vh - var(--nav-h) - 150px);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    position: sticky;
    top: calc(var(--nav-h) + 14px);
  }

  .empty {
    font-family: var(--util);
    font-size: 0.85rem;
    color: var(--ai-40);
    padding: 20px 0;
  }

  @media (max-width: 900px) {
    .split {
      grid-template-columns: 1fr;
    }
    .switch {
      display: flex;
    }
    .split[data-view='liste'] .mapwrap {
      display: none;
    }
    .split[data-view='karte'] .list {
      display: none;
    }
    .list,
    .mapwrap {
      max-height: none;
      height: auto;
      position: static;
    }
    .mapwrap {
      height: 70vh;
    }
  }
</style>
