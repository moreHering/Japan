<script lang="ts">
  /**
   * Tagesplaner: 20 Reisetage, Orte zuordnen und sortieren.
   *
   * Drag-and-Drop gibt es für Maus und Trackpad. Auf dem Handy ist natives
   * HTML5-Drag-and-Drop unbrauchbar, deshalb hat jeder Eintrag zusätzlich
   * Schaltflächen zum Verschieben — die funktionieren überall und sind auch mit
   * Tastatur bedienbar.
   */
  import PlaceCard from './PlaceCard.svelte';
  import MapView from './MapView.svelte';
  import {
    CATEGORIES,
    categoryOf,
    istAbseits,
    istEigen,
    type Category,
    type Place,
  } from '../lib/places';
  import { buildDays, formatDay, formatFull, type TripDay } from '../lib/trip';
  import {
    addToDay,
    dayOfPlace,
    isDone,
    moveWithinDay,
    plan,
    placesOfDay,
    removeFromDay,
    setNote,
  } from '../lib/store.svelte';

  type Props = { places: Place[] };
  let { places }: Props = $props();

  const days: TripDay[] = buildDays();

  /**
   * Feste und eigene Orte zusammen. Orte abseits der Route fallen hier heraus:
   * Sie sind nicht auf einen Reisetag legbar, also haben sie im Planer nichts
   * zu suchen — auch nicht als Vorschlag, der sich dann nicht anklicken lässt.
   */
  let alle = $derived<Place[]>([
    ...places,
    ...plan.customPlaces.filter((p) => !istAbseits(p)),
  ]);

  /** Nachschlagewerk für die Orte eines Tages. Wächst mit den eigenen Orten. */
  let byNr = $derived(new Map(alle.map((p) => [p.nr, p])));

  let openDay = $state<string>(days[0].date);
  let poolQuery = $state('');
  let poolCats = $state<Set<Category>>(new Set(CATEGORIES.map((c) => c.key)));
  let poolAll = $state(false);
  let showMap = $state(false);
  let dragging = $state<number | null>(null);
  let dragOver = $state<{ date: string; index: number } | null>(null);

  let current = $derived(days.find((d) => d.date === openDay)!);

  /** Vorschläge: standardmäßig nur die Station des geöffneten Tages. */
  let pool = $derived.by(() => {
    const q = poolQuery.trim().toLowerCase();
    return alle
      .filter((p) => {
        if (dayOfPlace(p.nr)) return false;
        if (!poolCats.has(p.category)) return false;
        if (!poolAll && p.station !== current.station.slug) return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q) || String(p.nr) === q;
      })
      .sort((a, b) => a.nr - b.nr);
  });

  let currentPlaces = $derived(
    placesOfDay(openDay)
      .map((nr) => byNr.get(nr))
      .filter((p): p is Place => !!p),
  );

  /**
   * Der eigentliche Nutzen gegenüber einer Papierliste: sagt, wenn ein
   * eingeplanter Ort an diesem Wochentag geschlossen ist.
   */
  function conflictsOf(date: string): { place: Place; day: string }[] {
    const weekday = days.find((d) => d.date === date)!.weekday;
    return placesOfDay(date)
      .map((nr) => byNr.get(nr))
      .filter((p): p is Place => !!p && p.closedDay === weekday)
      .map((p) => ({ place: p, day: weekday }));
  }

  let allConflicts = $derived.by(() => {
    const out: Record<string, { place: Place; day: string }[]> = {};
    for (const d of days) {
      const c = conflictsOf(d.date);
      if (c.length) out[d.date] = c;
    }
    return out;
  });

  function togglePoolCat(key: Category) {
    const next = new Set(poolCats);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    poolCats = next.size ? next : new Set([key]);
  }

  // --------------------------------------------------------- Drag and Drop

  function onDragStart(e: DragEvent, nr: number) {
    dragging = nr;
    e.dataTransfer?.setData('text/plain', String(nr));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOverSlot(e: DragEvent, date: string, index: number) {
    e.preventDefault();
    dragOver = { date, index };
  }

  function onDrop(e: DragEvent, date: string, index: number) {
    e.preventDefault();
    const nr = Number(e.dataTransfer?.getData('text/plain') ?? dragging);
    dragOver = null;
    dragging = null;
    if (!Number.isInteger(nr)) return;

    const from = dayOfPlace(nr);
    if (from === date) {
      const list = placesOfDay(date);
      const oldIndex = list.indexOf(nr);
      // Beim Verschieben nach hinten rutscht der Zielindex um eins vor.
      moveWithinDay(date, oldIndex, oldIndex < index ? index - 1 : index);
    } else {
      addToDay(date, nr, index);
    }
  }

  function moveUp(date: string, nr: number) {
    const i = placesOfDay(date).indexOf(nr);
    if (i > 0) moveWithinDay(date, i, i - 1);
  }

  function moveDown(date: string, nr: number) {
    const list = placesOfDay(date);
    const i = list.indexOf(nr);
    if (i > -1 && i < list.length - 1) moveWithinDay(date, i, i + 1);
  }

  let totalPlanned = $derived(
    Object.values(plan.days).reduce((sum, d) => sum + d.placeNrs.length, 0),
  );
</script>

<div class="planner">
  <!-- ------------------------------------------------------- Tagesübersicht -->
  <nav class="daybar" aria-label="Reisetage">
    {#each days as d (d.date)}
      {@const count = placesOfDay(d.date).length}
      <button
        class="daytab"
        class:on={openDay === d.date}
        class:leg={!!d.leg}
        onclick={() => (openDay = d.date)}
      >
        <small>{d.weekday}</small>
        <b>{d.date.slice(8)}.{d.date.slice(5, 7)}.</b>
        <span class="tabstation">{d.station.name}</span>
        {#if count}<i class="dot">{count}</i>{/if}
        {#if allConflicts[d.date]}<i class="warn" title="Ein Ort ist an diesem Tag geschlossen">!</i>{/if}
      </button>
    {/each}
  </nav>

  <div class="layout">
    <!-- ------------------------------------------------------- Der Tag selbst -->
    <section class="day">
      <header class="dayhead">
        <div>
          <div class="eyebrow">
            Tag {current.dayNo} von {days.length} · {current.station.no}
            {current.station.name}
          </div>
          <h2>{formatDay(current.date)}</h2>
          <p class="dim">{formatFull(current.date)} · {current.station.claim}</p>
        </div>
        <div class="dayactions">
          <button class="btn small" onclick={() => (showMap = !showMap)} aria-pressed={showMap}>
            {showMap ? 'Karte aus' : 'Karte an'}
          </button>
        </div>
      </header>

      {#if current.leg}
        <div class="note leg">
          <b>Umzug: {current.leg.from} → {current.leg.to}</b>
          <span>{current.leg.connection} · {current.leg.duration}</span>
        </div>
      {/if}

      {#if current.isDeparture}
        <div class="note">Letzter Tag — Rückflug. Keine Übernachtung mehr.</div>
      {/if}

      {#if allConflicts[current.date]}
        <div class="note warn">
          <b>Geschlossen an diesem {current.weekday}.</b>
          <span>
            {allConflicts[current.date].map((c) => `${c.place.nr} ${c.place.name}`).join(' · ')}
          </span>
        </div>
      {/if}

      {#if showMap}
        <div class="daymap">
          <MapView
            places={alle}
            visible={placesOfDay(current.date)}
            route={placesOfDay(current.date)}
            center={current.station.center as [number, number]}
            zoom={current.station.zoom}
          />
        </div>
      {/if}

      <!-- Sortierbare Liste der geplanten Orte -->
      <ol class="stops">
        <li
          class="slot"
          class:active={dragOver?.date === current.date && dragOver?.index === 0}
          ondragover={(e) => onDragOverSlot(e, current.date, 0)}
          ondrop={(e) => onDrop(e, current.date, 0)}
        ></li>

        {#each currentPlaces as place, i (place.nr)}
          <li
            class="stop"
            class:dragging={dragging === place.nr}
            draggable="true"
            ondragstart={(e) => onDragStart(e, place.nr)}
            ondragend={() => {
              dragging = null;
              dragOver = null;
            }}
          >
            <span class="order">{i + 1}</span>

            <div class="stopbody">
              <div class="stoptitle">
                <span class="pin {place.category}">{place.nr}</span>
                <b>{place.name}</b>
                {#if place.isFriendTip}<span class="tip">★</span>{/if}
                {#if place.book}<span class="book" title={`Reiseführer ${place.book}`}>📖</span>{/if}
                {#if isDone(place.nr)}<span class="ok">✓</span>{/if}
              </div>
              <div class="stopmeta">
                <span style={`color:${categoryOf(place.category).color}`}>
                  {categoryOf(place.category).short}
                </span>
                {#if place.closedDay === current.weekday}
                  <span class="badwarn">heute geschlossen</span>
                {:else if place.closedDay}
                  <span class="dim">{place.closedDay}. geschlossen</span>
                {/if}
                {#if place.needsBooking}<span class="dim">Reservierung</span>{/if}
                {#if place.cashOnly}<span class="dim">Bargeld</span>{/if}
              </div>
            </div>

            <div class="stopctl">
              <button class="ctl" title="nach oben" onclick={() => moveUp(current.date, place.nr)} disabled={i === 0}>
                ↑
              </button>
              <button
                class="ctl"
                title="nach unten"
                onclick={() => moveDown(current.date, place.nr)}
                disabled={i === currentPlaces.length - 1}
              >
                ↓
              </button>
              <select
                class="ctl move"
                title="auf anderen Tag verschieben"
                onchange={(e) => {
                  const target = (e.currentTarget as HTMLSelectElement).value;
                  if (target) addToDay(target, place.nr);
                  (e.currentTarget as HTMLSelectElement).value = '';
                }}
              >
                <option value="">→</option>
                {#each days.filter((d) => d.date !== current.date) as d (d.date)}
                  <option value={d.date}>{formatDay(d.date)}</option>
                {/each}
              </select>
              <button class="ctl del" title="entfernen" onclick={() => removeFromDay(current.date, place.nr)}>
                ×
              </button>
            </div>
          </li>

          <li
            class="slot"
            class:active={dragOver?.date === current.date && dragOver?.index === i + 1}
            ondragover={(e) => onDragOverSlot(e, current.date, i + 1)}
            ondrop={(e) => onDrop(e, current.date, i + 1)}
          ></li>
        {/each}
      </ol>

      {#if !currentPlaces.length}
        <p class="empty">
          Noch nichts geplant. Aus den Vorschlägen wählen — am Rechner lassen sie sich auch
          hierher ziehen.
        </p>
      {/if}

      <label class="notefield">
        <span class="eyebrow">Notiz zum Tag</span>
        <textarea
          rows="3"
          placeholder="Tischreservierung, Treffpunkt, Zugzeit …"
          value={plan.days[current.date]?.note ?? ''}
          oninput={(e) => setNote(current.date, (e.currentTarget as HTMLTextAreaElement).value)}
        ></textarea>
      </label>
    </section>

    <!-- ------------------------------------------------------------ Vorschläge -->
    <aside class="pool">
      <div class="poolhead">
        <div class="eyebrow">Vorschläge</div>
        <input type="search" bind:value={poolQuery} placeholder="Ort suchen …" autocomplete="off" />

        <label class="allswitch">
          <input type="checkbox" bind:checked={poolAll} />
          alle Stationen statt nur {current.station.name}
        </label>

        <div class="poolcats">
          {#each CATEGORIES as c (c.key)}
            <button
              class="chip"
              class:on={poolCats.has(c.key)}
              style={`--chip:${c.color}`}
              onclick={() => togglePoolCat(c.key)}
              aria-pressed={poolCats.has(c.key)}
            >
              <i></i>{c.short}
            </button>
          {/each}
        </div>

        <p class="poolcount">{pool.length} noch nicht eingeplant · {totalPlanned} insgesamt verplant</p>
      </div>

      <div class="poollist">
        {#each pool as place (place.nr)}
          <div
            class="poolitem"
            draggable="true"
            ondragstart={(e) => onDragStart(e, place.nr)}
            ondragend={() => (dragging = null)}
          >
            <PlaceCard {place} compact>
              <button class="btn small primary" onclick={() => addToDay(current.date, place.nr)}>
                + {formatDay(current.date)}
              </button>
            </PlaceCard>
          </div>
        {/each}

        {#if !pool.length}
          <p class="empty">
            {poolAll
              ? 'Alle passenden Orte sind eingeplant.'
              : `Für ${current.station.name} ist alles verplant — Häkchen oben setzen für alle Stationen.`}
          </p>
        {/if}
      </div>
    </aside>
  </div>
</div>

<style>
  /* ------------------------------------------------------------- Tagesleiste */

  .daybar {
    display: flex;
    gap: 5px;
    overflow-x: auto;
    padding: 0 0 10px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--line);
    scrollbar-width: thin;
  }

  .daytab {
    position: relative;
    flex: none;
    min-width: 74px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 7px 9px 8px;
    cursor: pointer;
    font-family: var(--util);
    text-align: left;
    line-height: 1.2;
  }

  .daytab small {
    display: block;
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    color: var(--ai-40);
    text-transform: uppercase;
  }

  .daytab b {
    display: block;
    font-family: var(--disp);
    font-size: 0.94rem;
  }

  .tabstation {
    display: block;
    font-size: 0.62rem;
    color: var(--ai-40);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .daytab.on {
    background: var(--ai);
    border-color: var(--ai);
    color: var(--washi);
  }

  .daytab.on small,
  .daytab.on .tabstation {
    color: var(--kin-soft);
  }

  .daytab.leg::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: var(--kin);
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  }

  .dot,
  .warn {
    position: absolute;
    top: -5px;
    font-style: normal;
    font-size: 0.6rem;
    font-weight: 700;
    min-width: 16px;
    height: 16px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
  }

  .dot {
    right: -4px;
    background: var(--shu);
    color: #fff;
  }

  .warn {
    left: -4px;
    background: var(--kin);
    color: #fff;
  }

  /* ------------------------------------------------------------------ Layout */

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }

  .dayhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
  }

  .dayhead h2 {
    font-size: clamp(1.4rem, 3.4vw, 1.9rem);
  }

  .dim {
    color: var(--ai-40);
    font-size: 0.82rem;
    margin: 3px 0 0;
    font-family: var(--util);
  }

  .note {
    background: var(--card);
    border: 1px solid var(--line);
    border-left: 4px solid var(--kin);
    border-radius: var(--radius-sm);
    padding: 9px 13px;
    margin-bottom: 10px;
    font-size: 0.86rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .note b {
    font-family: var(--util);
    font-size: 0.78rem;
    letter-spacing: 0.03em;
  }

  .note span {
    color: var(--ai-60);
    font-size: 0.82rem;
  }

  .note.leg {
    border-left-color: var(--kin);
  }

  .note.warn {
    border-left-color: var(--shu);
    background: rgba(198, 64, 43, 0.07);
  }

  .note.warn b {
    color: var(--shu-deep);
  }

  .daymap {
    height: 300px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 12px;
    position: relative;
  }

  /* -------------------------------------------------------------- Tagesliste */

  .stops {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .slot {
    height: 6px;
    border-radius: 3px;
    transition: background 0.1s, height 0.1s;
  }

  .slot.active {
    height: 26px;
    background: rgba(198, 64, 43, 0.22);
    border: 1px dashed var(--shu);
  }

  .stop {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 9px 11px;
    cursor: grab;
  }

  .stop.dragging {
    opacity: 0.4;
  }

  .order {
    font-family: var(--disp);
    font-weight: 700;
    font-size: 1.05rem;
    color: var(--ai-40);
    min-width: 17px;
    text-align: right;
    flex: none;
  }

  .stopbody {
    flex: 1;
    min-width: 0;
  }

  .stoptitle {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .stoptitle b {
    font-family: var(--disp);
    font-weight: 600;
    font-size: 0.97rem;
  }

  .tip {
    color: var(--kin);
  }

  .book {
    font-size: 0.85em;
    opacity: 0.85;
  }

  .ok {
    color: var(--matcha);
    font-weight: 700;
  }

  .stopmeta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-family: var(--util);
    font-size: 0.68rem;
    margin-top: 3px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .stopmeta .dim {
    color: var(--ai-40);
    font-size: 0.68rem;
    margin: 0;
  }

  .badwarn {
    color: #fff;
    background: var(--shu);
    border-radius: 999px;
    padding: 1px 7px;
  }

  .stopctl {
    display: flex;
    gap: 3px;
    flex: none;
  }

  .ctl {
    width: 26px;
    height: 26px;
    border: 1px solid var(--line);
    background: var(--washi);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.8rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: var(--ai-60);
  }

  .ctl:hover:not(:disabled) {
    border-color: var(--kin);
    color: var(--ai);
  }

  .ctl:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .ctl.move {
    width: auto;
    min-width: 34px;
    font-family: var(--util);
    font-size: 0.68rem;
  }

  .ctl.del:hover {
    border-color: var(--shu);
    color: var(--shu);
  }

  .notefield {
    display: block;
    margin-top: 16px;
  }

  textarea {
    width: 100%;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 9px 11px;
    font-family: var(--serif);
    font-size: 0.9rem;
    resize: vertical;
  }

  /* -------------------------------------------------------------- Vorschläge */

  .pool {
    position: sticky;
    top: calc(var(--nav-h) + 12px);
    display: flex;
    flex-direction: column;
    max-height: calc(var(--app-h) - 40px);
    background: var(--washi-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .poolhead {
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .poolhead input[type='search'] {
    width: 100%;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 7px 10px;
    font-family: var(--util);
    font-size: 0.82rem;
  }

  .allswitch {
    display: flex;
    align-items: center;
    gap: 7px;
    font-family: var(--util);
    font-size: 0.72rem;
    color: var(--ai-60);
    cursor: pointer;
  }

  .poolcats {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--util);
    font-size: 0.68rem;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 3px 9px;
    cursor: pointer;
    color: var(--ai-40);
  }

  .chip i {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--chip);
    opacity: 0.3;
    flex: none;
  }

  .chip.on {
    color: var(--ai);
    border-color: var(--chip);
  }

  .chip.on i {
    opacity: 1;
  }

  .poolcount {
    font-family: var(--util);
    font-size: 0.68rem;
    color: var(--ai-40);
    margin: 0;
  }

  .poollist {
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .poolitem {
    cursor: grab;
  }

  .empty {
    font-family: var(--util);
    font-size: 0.82rem;
    color: var(--ai-40);
    padding: 14px 0;
    margin: 0;
  }

  @media (max-width: 940px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .pool {
      position: static;
      max-height: none;
    }
    .poollist {
      max-height: 60dvh;
    }
    .stop {
      cursor: default;
    }
  }

  /* --------------------------------------------------------------- Handy */

  @media (max-width: 767px) {
    /*
     * Nebeneinander reicht die Breite nicht: Die vier Bedienelemente drängen
     * den Ortsnamen in den Umbruch und die Zeile wird doppelt so hoch. Deshalb
     * steht der Name hier oben über die volle Breite und die Steuerung darunter.
     */
    .stop {
      flex-wrap: wrap;
      gap: 8px 10px;
      padding: 11px 12px;
    }

    .stopbody {
      flex: 1 1 auto;
      min-width: 0;
    }

    .stopctl {
      flex: 1 0 100%;
      justify-content: flex-end;
      gap: 6px;
      padding-top: 2px;
      border-top: 1px solid var(--line-soft);
      margin-top: 2px;
    }

    .ctl {
      width: 40px;
      height: 38px;
      font-size: 1rem;
    }

    .ctl.move {
      flex: 1;
      max-width: 140px;
    }

    .stoptitle b {
      font-size: 1rem;
    }

    /* Der Tagesstreifen wird zum Wischband mit fangenden Positionen. */
    .daybar {
      scroll-snap-type: x proximity;
      gap: 7px;
      padding-bottom: 12px;
      margin-left: -14px;
      margin-right: -14px;
      padding-left: 14px;
      padding-right: 14px;
    }

    .daytab {
      scroll-snap-align: start;
      min-width: 82px;
      padding: 9px 11px 10px;
    }

    .daytab b {
      font-size: 1.02rem;
    }

    .dayhead {
      flex-wrap: wrap;
      gap: 8px;
    }

    .daymap {
      height: 260px;
      margin-left: -14px;
      margin-right: -14px;
      border-radius: 0;
      border-left: none;
      border-right: none;
    }

    .order {
      font-size: 1.15rem;
      min-width: 20px;
    }
  }
</style>
