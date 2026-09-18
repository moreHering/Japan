<script lang="ts">
  /**
   * Orte und Karte — ein Bildschirm.
   *
   * Vorher waren das zwei Seiten: eine Liste mit kleiner Karte daneben und
   * eine Vollbildkarte mit eigenem Filterblatt. Beide zeigten dieselben Orte
   * mit fast denselben Filtern, nur jeweils halb. Wer auf der Karte etwas fand,
   * musste zur Liste wechseln, um es auf einen Tag zu legen; wer in der Liste
   * filterte, sah das Ergebnis auf der anderen Seite nicht.
   *
   * Jetzt filtert eine Leiste beide Ansichten gleichzeitig. Am Rechner stehen
   * Liste und Karte nebeneinander, auf dem Handy wird umgeschaltet — die Filter
   * bleiben dabei gesetzt.
   *
   * Liste und Karte liegen bewusst in einer einzigen Komponente. Als zwei
   * getrennte Astro-Islands müssten sie Zustand über die Inselgrenze teilen,
   * was bei Svelte-5-Runes nicht garantiert funktioniert.
   */
  import MapView from './MapView.svelte';
  import PlaceCard from './PlaceCard.svelte';
  import OrtFormular from './OrtFormular.svelte';
  import {
    ABSEITS,
    ABSEITS_LABEL,
    CATEGORIES,
    istAbseits,
    istEigen,
    plainText,
    type Category,
    type EigenerOrt,
    type Place,
  } from '../lib/places';
  import { buildDays, formatDay, stations, type TripDay } from '../lib/trip';
  import {
    addToDay,
    dayOfPlace,
    isDone,
    istPlanbar,
    plan,
    placesOfDay,
    unplacePlace,
  } from '../lib/store.svelte';

  type Props = { places: Place[] };
  let { places }: Props = $props();

  /**
   * Feste Orte aus dem Build plus die selbst ergänzten aus dem Plan. Alle
   * Filter arbeiten danach auf einer Liste — sie müssen nicht wissen, woher
   * ein Ort kommt.
   */
  let alle = $derived<Place[]>([...places, ...plan.customPlaces]);

  const days: TripDay[] = buildDays();

  // Die Startseite verlinkt einzelne Stationen als ?station=kyoto.
  const initialStation = (() => {
    if (typeof location === 'undefined') return 'alle';
    const wanted = new URLSearchParams(location.search).get('station');
    if (!wanted) return 'alle';
    const bekannt = wanted === ABSEITS || stations.some((s) => s.slug === wanted);
    return bekannt ? wanted : 'alle';
  })();

  let query = $state('');
  let station = $state<string>(initialStation);
  let cats = $state<Set<Category>>(new Set(CATEGORIES.map((c) => c.key)));
  let onlyTips = $state(false);
  let onlyBook = $state(false);
  let onlyOpen = $state(false);
  let hideDone = $state(false);
  let nurGeplant = $state(false);
  /** Gesetzt: nur die Orte dieses Reisetags, mit Linie in der Reihenfolge. */
  let tagFilter = $state<string | null>(null);

  let selected = $state<number | null>(null);
  let targetDay = $state<string>(days[0].date);
  let mobileView = $state<'liste' | 'karte'>('liste');
  /**
   * Auf dem Handy liegen die Filter zusammengeklappt.
   *
   * Ausgeklappt sind es fünf Reihen — dann steht der erste Ort unterhalb des
   * Bildschirmrands, und die Seite beginnt mit Bedienelementen statt mit
   * Inhalt. Am Rechner ist genug Platz, dort stehen sie immer offen.
   */
  let filterOffen = $state(false);
  let mapRef = $state<MapView | null>(null);

  /** Erfassung eigener Orte. */
  let pin = $state<{ lat: number; lng: number } | null>(null);
  let pickMode = $state(false);
  let formOffen = $state(false);
  let bearbeiten = $state<EigenerOrt | null>(null);

  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const amTag = tagFilter ? new Set(placesOfDay(tagFilter)) : null;
    const geplant = nurGeplant
      ? new Set(Object.values(plan.days).flatMap((d) => d.placeNrs))
      : null;

    return alle.filter((p) => {
      if (amTag) return amTag.has(p.nr); // ein Tag zeigt genau seine Orte
      if (geplant && !geplant.has(p.nr)) return false;
      if (!cats.has(p.category)) return false;
      if (station !== 'alle' && p.station !== station) return false;
      if (onlyTips && !p.isFriendTip) return false;
      if (onlyBook && !p.book) return false;
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

  /** Im Tagesfilter zeigt die Karte die geplante Reihenfolge als Linie. */
  let route = $derived(tagFilter ? placesOfDay(tagFilter) : []);

  // Nach Station und Nummer gruppieren, damit die Reihenfolge der des Buchs
  // folgt. Im Tagesfilter zählt dagegen die geplante Reihenfolge.
  let grouped = $derived.by(() => {
    if (tagFilter) {
      const reihe = placesOfDay(tagFilter)
        .map((nr) => filtered.find((p) => p.nr === nr))
        .filter((p): p is Place => Boolean(p));
      return reihe.length ? [[formatDay(tagFilter), reihe] as [string, Place[]]] : [];
    }
    const map = new Map<string, Place[]>();
    for (const p of [...filtered].sort((a, b) => a.nr - b.nr)) {
      const key = p.stationLabel;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map];
  });

  /** Wie viele Filter gerade etwas einschränken — für die Zahl am Knopf. */
  let aktiveFilter = $derived(
    (station !== 'alle' ? 1 : 0) +
      (cats.size < CATEGORIES.length ? 1 : 0) +
      (onlyTips ? 1 : 0) +
      (onlyBook ? 1 : 0) +
      (onlyOpen ? 1 : 0) +
      (hideDone ? 1 : 0) +
      (nurGeplant ? 1 : 0) +
      (tagFilter ? 1 : 0),
  );

  function filterZuruecksetzen() {
    query = '';
    station = 'alle';
    cats = new Set(CATEGORIES.map((c) => c.key));
    onlyTips = onlyBook = onlyOpen = hideDone = nurGeplant = false;
    tagFilter = null;
    selected = null;
  }

  let abseitsAnzahl = $derived(alle.filter(istAbseits).length);
  let eigeneAnzahl = $derived(plan.customPlaces.length);
  let plannedTotal = $derived(
    Object.values(plan.days).reduce((sum, d) => sum + d.placeNrs.length, 0),
  );

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

  /** Tagesfilter setzen oder abschalten. */
  function tagWaehlen(datum: string | null) {
    tagFilter = datum;
    nurGeplant = false;
    selected = null;
    if (datum) setTimeout(() => mapRef?.fitVisible(), 60);
  }

  // ------------------------------------------------------------- Erfassung --

  function stelleGewaehlt(lat: number, lng: number) {
    pin = { lat, lng };
    pickMode = false;
    formOffen = true;
    mobileView = 'liste';
  }

  function erfassenStarten() {
    bearbeiten = null;
    pin = null;
    formOffen = false;
    pickMode = true;
    mobileView = 'karte';
  }

  function bearbeitenStarten(ort: EigenerOrt) {
    bearbeiten = ort;
    pin = { lat: ort.lat, lng: ort.lng };
    formOffen = true;
    mobileView = 'liste';
  }

  function erfassenSchliessen() {
    formOffen = false;
    pickMode = false;
    pin = null;
    bearbeiten = null;
  }
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
      {#if abseitsAnzahl}
        <option value={ABSEITS}>{ABSEITS_LABEL} ({abseitsAnzahl})</option>
      {/if}
    </select>
  </div>

  <div class="row schnell">
    <button
      class="btn small filterknopf"
      class:primary={aktiveFilter > 0}
      onclick={() => (filterOffen = !filterOffen)}
      aria-expanded={filterOffen}
    >
      Filter{aktiveFilter ? ` (${aktiveFilter})` : ''}
      <span class="pfeil" class:auf={filterOffen}>▾</span>
    </button>

    <span class="count"><b>{filtered.length}</b> von {alle.length}</span>

    <span class="spacer"></span>

    <div class="switch">
      <button
        class="btn small"
        class:primary={mobileView === 'liste'}
        onclick={() => (mobileView = 'liste')}>Liste</button
      >
      <button
        class="btn small"
        class:primary={mobileView === 'karte'}
        onclick={() => (mobileView = 'karte')}>Karte</button
      >
    </div>
  </div>

  <div class="row cats" class:zu={!filterOffen}>
    {#each CATEGORIES as c (c.key)}
      <button
        class="chip"
        class:on={cats.has(c.key)}
        style={`--chip:${c.color}`}
        onclick={() => toggleCat(c.key)}
        aria-pressed={cats.has(c.key)}
        disabled={Boolean(tagFilter)}
      >
        <i></i>{c.short}
      </button>
    {/each}
  </div>

  <div class="row cats" class:zu={!filterOffen}>
    <button
      class="chip plain"
      class:on={onlyTips}
      onclick={() => (onlyTips = !onlyTips)}
      aria-pressed={onlyTips}
      disabled={Boolean(tagFilter)}>★ Freundestipps</button
    >
    <button
      class="chip plain"
      class:on={onlyBook}
      onclick={() => (onlyBook = !onlyBook)}
      aria-pressed={onlyBook}
      disabled={Boolean(tagFilter)}>📖 Reiseführer</button
    >
    <button
      class="chip plain"
      class:on={hideDone}
      onclick={() => (hideDone = !hideDone)}
      aria-pressed={hideDone}
      disabled={Boolean(tagFilter)}>noch offen</button
    >
    <button
      class="chip plain"
      class:on={onlyOpen}
      onclick={() => (onlyOpen = !onlyOpen)}
      aria-pressed={onlyOpen}
      disabled={Boolean(tagFilter)}>ohne Schließtag</button
    >
    <button
      class="chip plain"
      class:on={nurGeplant}
      onclick={() => {
        nurGeplant = !nurGeplant;
        tagFilter = null;
      }}
      aria-pressed={nurGeplant}>eingeplant ({plannedTotal})</button
    >

    <!-- Kam von der früheren Kartenseite: ein einzelner Reisetag, mit Linie. -->
    <label class="tagwahl" class:on={Boolean(tagFilter)}>
      <span>Tag</span>
      <select
        value={tagFilter ?? ''}
        aria-label="Nur die Orte eines Reisetags"
        onchange={(e) => tagWaehlen((e.currentTarget as HTMLSelectElement).value || null)}
      >
        <option value="">alle</option>
        {#each days as d (d.date)}
          <option value={d.date}>
            {d.label} · {d.station.name} ({placesOfDay(d.date).length})
          </option>
        {/each}
      </select>
    </label>
  </div>

  <div class="row status" class:zu={!filterOffen}>
    {#if eigeneAnzahl}
      <span class="count dim">{eigeneAnzahl} selbst ergänzt</span>
    {/if}
    {#if aktiveFilter}
      <button class="btn small ghost" onclick={filterZuruecksetzen}>Filter zurücksetzen</button>
    {/if}

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
</div>

{#if formOffen && pin}
  <div class="erfassen">
    <OrtFormular
      lat={pin.lat}
      lng={pin.lng}
      ort={bearbeiten}
      onfertig={(nr) => {
        erfassenSchliessen();
        if (nr !== null) {
          selected = nr;
          // Ein frisch angelegter Ort soll auffindbar sein, auch wenn die
          // Filter ihn gerade ausschließen würden.
          station = 'alle';
          tagFilter = null;
          nurGeplant = false;
          query = '';
        }
      }}
      onabbruch={erfassenSchliessen}
      onneuwaehlen={() => {
        formOffen = false;
        pickMode = true;
        mobileView = 'karte';
      }}
    />
  </div>
{/if}

<div class="split" data-view={mobileView}>
  <div class="list">
    {#if !filtered.length}
      <p class="empty">
        {#if tagFilter}
          Für {formatDay(tagFilter)} ist noch nichts geplant.
        {:else}
          Kein Ort passt zu diesen Filtern.
        {/if}
      </p>
    {/if}

    {#each grouped as [label, group] (label)}
      <h2 class="group">
        {label}<span>{group.length}</span>
      </h2>
      {#each group as place (place.nr)}
        <PlaceCard {place} active={selected === place.nr} onselect={select}>
          {#if istEigen(place)}
            <button class="btn small ghost" onclick={() => bearbeitenStarten(place)}>
              bearbeiten
            </button>
          {/if}
          {#if dayOfPlace(place.nr)}
            <button class="btn small" onclick={() => unplacePlace(place.nr)}>
              vom {formatDay(dayOfPlace(place.nr)!)} nehmen
            </button>
          {:else if istPlanbar(place.nr)}
            <button class="btn small primary" onclick={() => addToDay(targetDay, place.nr)}>
              + {formatDay(targetDay)}
            </button>
          {:else}
            <span class="nichtplanbar" title="Zu weit weg, um an einem Reisetag dazwischenzupassen">
              nicht auf der Route
            </span>
          {/if}
        </PlaceCard>
      {/each}
    {/each}
  </div>

  <div class="mapwrap">
    <MapView
      bind:this={mapRef}
      places={alle}
      visible={visibleNrs}
      {selected}
      {route}
      {pin}
      {pickMode}
      onselect={(nr) => (selected = nr)}
      onpick={stelleGewaehlt}
    />

    <!-- Auf dem Handy scrollt die Werkzeugleiste weg, sobald die Karte den
         Bildschirm füllt. Der Knopf zum Ergänzen bleibt deshalb auf ihr. -->
    {#if !formOffen}
      <button
        class="rundknopf"
        class:aktiv={pickMode}
        onclick={() => (pickMode ? erfassenSchliessen() : erfassenStarten())}
        title="Eigenen Ort ergänzen — oder lange auf die Karte drücken"
      >
        {pickMode ? '✕' : '+'}<span>{pickMode ? 'abbrechen' : 'Ort'}</span>
      </button>
    {/if}
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

  /* Die Maske schiebt sich über die Werkzeugleiste, damit sie auf dem Handy
     nicht unter der Liste verschwindet. */
  .erfassen {
    background: var(--washi-2);
    border: 1px solid var(--shu);
    border-radius: var(--radius);
    padding: 14px 15px;
    margin-bottom: 14px;
  }

  .nichtplanbar {
    font-family: var(--util);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    color: var(--kin);
    border: 1px dashed var(--kin);
    border-radius: 999px;
    padding: 5px 10px;
    white-space: nowrap;
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

  /* Im Tagesfilter zeigt die Ansicht genau die Orte dieses Tages — die
     übrigen Filter hätten dort keine Wirkung und stehen deshalb still. */
  .chip[disabled] {
    opacity: 0.4;
    cursor: default;
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

  .tagwahl {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--util);
    font-size: 0.74rem;
    color: var(--ai-40);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 2px 4px 2px 11px;
    background: var(--card);
  }

  .tagwahl.on {
    border-color: var(--shu);
    color: var(--shu-deep);
    background: var(--washi-2);
  }

  .tagwahl select {
    font-size: 0.74rem;
    padding: 4px 6px;
    border-color: transparent;
    background: transparent;
    max-width: 190px;
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

  .schnell {
    align-items: center;
  }

  .filterknopf {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .pfeil {
    transition: transform 0.15s ease;
    display: inline-block;
  }

  .pfeil.auf {
    transform: rotate(180deg);
  }

  .switch {
    display: flex;
    gap: 6px;
  }

  /* Am Rechner ist Platz: Dort stehen die Filter immer offen, und der
     Umschalter zwischen Liste und Karte ist überflüssig, weil beides
     nebeneinander liegt. */
  @media (min-width: 901px) {
    .filterknopf,
    .switch {
      display: none;
    }
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
    max-height: calc(var(--app-h) - 150px);
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
    height: calc(var(--app-h) - 150px);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    position: sticky;
    top: calc(var(--nav-h) + 14px);
  }

  .rundknopf {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 500;
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 46px;
    padding: 0 16px 0 14px;
    border-radius: 999px;
    border: 1px solid var(--shu);
    background: var(--shu);
    color: #fff;
    font-family: var(--util);
    font-size: 1.15rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(22, 35, 60, 0.28);
  }

  .rundknopf span {
    font-size: 0.76rem;
    letter-spacing: 0.04em;
  }

  .rundknopf.aktiv {
    background: var(--ai);
    border-color: var(--ai);
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

    /* Zugeklappt: Die Seite beginnt mit Orten, nicht mit fünf Reihen Knöpfen. */
    .row.zu {
      display: none;
    }

    .split[data-view='liste'] .mapwrap {
      display: none;
    }

    .split[data-view='karte'] .list {
      display: none;
    }

    .list {
      max-height: none;
      overflow: visible;
    }

    /*
     * Die Karte füllt auf dem Handy den Rest des Bildschirms. Ohne feste Höhe
     * bekäme sie die Höhe ihres Inhalts — und Leaflet hat keinen.
     */
    .mapwrap {
      position: relative;
      top: auto;
      height: calc(var(--app-h) - 60px);
      min-height: 320px;
    }
  }
</style>
