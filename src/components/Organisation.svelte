<script lang="ts">
  /**
   * Buchungen, Budget, Packliste und der Datenabgleich.
   *
   * Die Buchungsliste besteht aus zwei Quellen: den festen Einträgen aus
   * bookings.json (Unterkünfte, Transport, Fristen) und den Orten, bei denen das
   * Reiseband eine Reservierung erwähnt — letztere werden aus places.json
   * abgeleitet, damit sie nicht doppelt gepflegt werden müssen.
   */
  import type { Place } from '../lib/places';
  import bookingsData from '../data/bookings.json';
  import packingData from '../data/packing.json';
  import {
    addExpense,
    addPackingItem,
    exportJson,
    importJson,
    plan,
    removeExpense,
    removePackingItem,
    resetAll,
    toggleBooking,
    togglePacking,
  } from '../lib/store.svelte';
  import { formatEuro, formatFull, formatYen, stations, trip, yenToEuro } from '../lib/trip';

  type Props = { places: Place[] };
  let { places }: Props = $props();

  const today = new Date().toISOString().slice(0, 10);

  /**
   * Vorbelegung des Ausgabendatums. Vor der Reise liegt "heute" außerhalb von
   * min/max des Feldes — das Formular wäre dann dauerhaft ungültig und ließe
   * sich nicht absenden. Deshalb auf den Reisezeitraum begrenzen.
   */
  const defaultExpenseDate = today < trip.start ? trip.start : today > trip.end ? trip.end : today;

  type Booking = {
    id: string;
    label: string;
    detail: string;
    due: string | null;
    group: string;
  };

  /** Feste Einträge plus die im Reiseband erwähnten Reservierungen. */
  const bookings: Booking[] = [
    ...(bookingsData as Booking[]),
    ...places
      .filter((p) => p.needsBooking)
      .map((p) => ({
        id: `place:${p.nr}`,
        label: `${p.nr} · ${p.name}`,
        detail: p.descriptionHtml.replace(/<[^>]+>/g, ''),
        due: null,
        group: 'Vor Ort reservieren',
      })),
  ];

  const groups = [...new Set(bookings.map((b) => b.group))];

  let openBookings = $derived(bookings.filter((b) => !plan.bookings[b.id]).length);

  /** Überfällige und nahe Fristen zuerst. */
  let urgent = $derived(
    bookings
      .filter((b) => b.due && !plan.bookings[b.id])
      .sort((a, b) => (a.due! < b.due! ? -1 : 1))
      .slice(0, 3),
  );

  // ------------------------------------------------------------------ Budget

  let expLabel = $state('');
  let expYen = $state<number | null>(null);
  let expDate = $state(defaultExpenseDate);
  let expPayer = $state(trip.travellers[0]);
  let expStation = $state(stations[0].slug);

  function submitExpense(e: Event) {
    e.preventDefault();
    if (!expLabel.trim() || !expYen) return;
    addExpense({
      label: expLabel.trim(),
      yen: expYen,
      date: expDate,
      payer: expPayer,
      station: expStation,
    });
    expLabel = '';
    expYen = null;
  }

  let totalYen = $derived(plan.expenses.reduce((s, e) => s + e.yen, 0));

  let perPayer = $derived.by(() => {
    const map = new Map<string, number>(trip.travellers.map((t) => [t, 0]));
    for (const e of plan.expenses) map.set(e.payer, (map.get(e.payer) ?? 0) + e.yen);
    return [...map];
  });

  let perStation = $derived.by(() => {
    const map = new Map<string, number>();
    for (const e of plan.expenses) map.set(e.station, (map.get(e.station) ?? 0) + e.yen);
    return stations
      .map((s) => [s.name, map.get(s.slug) ?? 0] as [string, number])
      .filter(([, v]) => v > 0);
  });

  /** Fairer Ausgleich: wer liegt über oder unter dem Durchschnitt? */
  let settlement = $derived.by(() => {
    const share = totalYen / trip.travellers.length;
    return perPayer.map(([name, paid]) => ({ name, paid, diff: paid - share }));
  });

  // -------------------------------------------------------------- Packliste

  let newItem = $state('');

  function submitItem(e: Event) {
    e.preventDefault();
    addPackingItem(newItem);
    newItem = '';
  }

  let packingTotal = $derived(
    packingData.reduce((s, g) => s + g.items.length, 0) + plan.packingExtra.length,
  );

  let packingDone = $derived(
    packingData.reduce((s, g) => s + g.items.filter((i) => plan.packing[i]).length, 0) +
      plan.packingExtra.filter((i) => plan.packing[`extra:${i}`]).length,
  );

  // --------------------------------------------------------- Export / Import

  let importMsg = $state<{ ok: boolean; text: string } | null>(null);

  function download() {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `japan-2026-plan-${today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const result = importJson(await file.text());
    importMsg = result.ok
      ? { ok: true, text: 'Plan übernommen.' }
      : { ok: false, text: result.error ?? 'Die Datei konnte nicht gelesen werden.' };
    input.value = '';
  }

  function confirmReset() {
    if (confirm('Wirklich alles zurücksetzen? Tagesplan, Häkchen und Ausgaben werden gelöscht.')) {
      resetAll();
      importMsg = { ok: true, text: 'Alles zurückgesetzt.' };
    }
  }

  let plannedTotal = $derived(
    Object.values(plan.days).reduce((sum, d) => sum + d.placeNrs.length, 0),
  );
</script>

<div class="grid">
  <!-- --------------------------------------------------------- Buchungen -->
  <section class="block bookings">
    <div class="eyebrow">Buchungen &amp; Fristen</div>
    <h2>{openBookings} von {bookings.length} offen</h2>

    {#if urgent.length}
      <div class="urgent">
        <h4>Als nächstes dran</h4>
        {#each urgent as b (b.id)}
          <div class="urgentrow">
            <b>{formatFull(b.due!)}</b>
            <span>{b.label}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#each groups as group (group)}
      <h4 class="grouphead">{group}</h4>
      <ul class="checks">
        {#each bookings.filter((b) => b.group === group) as b (b.id)}
          <li class:done={plan.bookings[b.id]}>
            <label>
              <input type="checkbox" checked={!!plan.bookings[b.id]} onchange={() => toggleBooking(b.id)} />
              <span class="ctext">
                <b>{b.label}</b>
                {#if b.detail}<small>{b.detail}</small>{/if}
                {#if b.due}<em>bis {formatFull(b.due)}</em>{/if}
              </span>
            </label>
          </li>
        {/each}
      </ul>
    {/each}
  </section>

  <div class="side">
  <!-- ------------------------------------------------------------ Budget -->
  <section class="block">
    <div class="eyebrow">Budget</div>
    <h2>{formatYen(totalYen)}</h2>
    <p class="sub">
      {formatEuro(yenToEuro(totalYen))} bei Kurs {trip.yenPerEuro} ¥/€ ·
      {formatEuro(yenToEuro(totalYen) / trip.travellers.length)} pro Person
    </p>

    <form class="expform" onsubmit={submitExpense}>
      <input type="text" bind:value={expLabel} placeholder="Wofür?" required />
      <input type="number" bind:value={expYen} placeholder="¥" min="1" step="1" required />
      <input type="date" bind:value={expDate} min={trip.start} max={trip.end} />
      <select bind:value={expPayer} aria-label="Wer hat bezahlt">
        {#each trip.travellers as t (t)}
          <option value={t}>{t}</option>
        {/each}
      </select>
      <select bind:value={expStation} aria-label="Station">
        {#each stations as s (s.slug)}
          <option value={s.slug}>{s.name}</option>
        {/each}
      </select>
      <button class="btn small primary" type="submit">Eintragen</button>
    </form>

    {#if plan.expenses.length}
      <div class="sums">
        <div>
          <h4>Pro Person</h4>
          {#each settlement as s (s.name)}
            <div class="sumrow">
              <span>{s.name}</span>
              <b>{formatYen(s.paid)}</b>
              <em class:plus={s.diff > 0} class:minus={s.diff < 0}>
                {s.diff > 0 ? '+' : ''}{formatYen(s.diff)}
              </em>
            </div>
          {/each}
          <p class="hint">Plus heißt: hat mehr gezahlt und bekommt zurück.</p>
        </div>

        {#if perStation.length}
          <div>
            <h4>Pro Station</h4>
            {#each perStation as [name, yen] (name)}
              <div class="sumrow">
                <span>{name}</span>
                <b>{formatYen(yen)}</b>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <ul class="expenses">
        {#each plan.expenses as e (e.id)}
          <li>
            <span class="edate">{e.date.slice(8)}.{e.date.slice(5, 7)}.</span>
            <span class="elabel">{e.label}</span>
            <span class="epayer">{e.payer}</span>
            <b>{formatYen(e.yen)}</b>
            <button class="ctl" title="löschen" onclick={() => removeExpense(e.id)}>×</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">Noch keine Ausgaben erfasst.</p>
    {/if}
  </section>

  <!-- --------------------------------------------------------- Packliste -->
  <section class="block">
    <div class="eyebrow">Packliste</div>
    <h2>{packingDone} von {packingTotal} gepackt</h2>

    {#each packingData as group (group.group)}
      <h4 class="grouphead">{group.group}</h4>
      <ul class="checks">
        {#each group.items as item (item)}
          <li class:done={plan.packing[item]}>
            <label>
              <input type="checkbox" checked={!!plan.packing[item]} onchange={() => togglePacking(item)} />
              <span class="ctext"><b>{item}</b></span>
            </label>
          </li>
        {/each}
      </ul>
    {/each}

    {#if plan.packingExtra.length}
      <h4 class="grouphead">Selbst ergänzt</h4>
      <ul class="checks">
        {#each plan.packingExtra as item (item)}
          <li class:done={plan.packing[`extra:${item}`]}>
            <label>
              <input
                type="checkbox"
                checked={!!plan.packing[`extra:${item}`]}
                onchange={() => togglePacking(`extra:${item}`)}
              />
              <span class="ctext"><b>{item}</b></span>
            </label>
            <button class="ctl" title="entfernen" onclick={() => removePackingItem(item)}>×</button>
          </li>
        {/each}
      </ul>
    {/if}

    <form class="additem" onsubmit={submitItem}>
      <input type="text" bind:value={newItem} placeholder="Etwas ergänzen …" />
      <button class="btn small" type="submit">Hinzufügen</button>
    </form>
  </section>

  <!-- ----------------------------------------------------- Daten abgleichen -->
  <section class="block">
    <div class="eyebrow">Plan sichern &amp; übertragen</div>
    <h2>Datenabgleich</h2>

    <p class="sub">
      Der Plan liegt ausschließlich in diesem Browser — <b>er wird nicht automatisch
      zwischen euren Geräten abgeglichen</b>. Wer auf einem anderen Gerät weiterplanen will,
      exportiert hier eine Datei und spielt sie dort ein.
    </p>

    <div class="stats">
      <div><b>{plannedTotal}</b><small>Orte eingeplant</small></div>
      <div><b>{plan.done.length}</b><small>besucht</small></div>
      <div><b>{plan.expenses.length}</b><small>Ausgaben</small></div>
      <div>
        <b>{Object.values(plan.bookings).filter(Boolean).length}</b><small>Buchungen erledigt</small>
      </div>
    </div>

    {#if plan.updatedAt}
      <p class="hint">
        Letzte Änderung: {new Date(plan.updatedAt).toLocaleString('de-DE')}
      </p>
    {/if}

    <div class="dataactions">
      <button class="btn primary" onclick={download}>Als Datei exportieren</button>
      <label class="btn">
        Datei einlesen
        <input type="file" accept="application/json,.json" onchange={handleFile} hidden />
      </label>
      <button class="btn ghost danger" onclick={confirmReset}>Alles zurücksetzen</button>
    </div>

    {#if importMsg}
      <p class="msg" class:bad={!importMsg.ok}>{importMsg.text}</p>
    {/if}
  </section>
  </div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
    gap: 16px;
    align-items: start;
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  /* Die Buchungsliste ist mit Abstand die laengste — eigene Spalte, und ab
     einer gewissen Laenge scrollt sie in sich, statt die Seite zu dehnen. */
  .bookings .checks {
    max-height: none;
  }

  @media (min-width: 1100px) {
    .grid {
      grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
    }
  }

  @media (max-width: 800px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }

  .block {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 18px 18px 20px;
  }

  h2 {
    font-size: 1.32rem;
    margin-bottom: 4px;
  }

  .sub {
    font-size: 0.86rem;
    color: var(--ai-60);
    margin: 0 0 12px;
  }

  .grouphead {
    margin: 15px 0 6px;
    font-size: 0.66rem;
    letter-spacing: 0.14em;
    color: var(--kin);
  }

  /* ------------------------------------------------------------- Checklisten */

  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .checks li {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    border-radius: var(--radius-sm);
    padding: 3px 5px;
  }

  .checks li:hover {
    background: var(--washi-2);
  }

  .checks label {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    cursor: pointer;
    flex: 1;
    min-width: 0;
  }

  .checks input[type='checkbox'] {
    margin: 3px 0 0;
    accent-color: var(--shu);
    width: 16px;
    height: 16px;
    flex: none;
  }

  .ctext {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .ctext b {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .ctext small {
    font-family: var(--util);
    font-size: 0.72rem;
    color: var(--ai-40);
    line-height: 1.4;
  }

  .ctext em {
    font-family: var(--util);
    font-size: 0.7rem;
    font-style: normal;
    color: var(--shu-deep);
  }

  .checks li.done .ctext b {
    text-decoration: line-through;
    color: var(--ai-40);
    font-weight: 400;
  }

  .urgent {
    background: rgba(198, 64, 43, 0.07);
    border: 1px solid rgba(198, 64, 43, 0.24);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    margin: 4px 0 8px;
  }

  .urgent h4 {
    color: var(--shu-deep);
    margin-bottom: 5px;
  }

  .urgentrow {
    display: flex;
    gap: 9px;
    font-size: 0.84rem;
    padding: 1px 0;
  }

  .urgentrow b {
    font-family: var(--util);
    font-size: 0.74rem;
    color: var(--shu-deep);
    flex: none;
    min-width: 76px;
  }

  /* ----------------------------------------------------------------- Budget */

  .expform {
    display: grid;
    grid-template-columns: minmax(0, 2fr) 92px minmax(0, 1.2fr);
    gap: 6px;
    margin-bottom: 12px;
  }

  @media (max-width: 560px) {
    .expform {
      grid-template-columns: minmax(0, 1fr) 84px;
    }
  }

  .expform input,
  .expform select {
    background: var(--washi);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 7px 9px;
    font-family: var(--util);
    font-size: 0.8rem;
    min-width: 0;
  }

  .expform button {
    grid-column: 1 / -1;
  }

  .sums {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 14px;
    padding: 11px 0;
    border-top: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
    margin-bottom: 10px;
  }

  .sumrow {
    display: flex;
    align-items: baseline;
    gap: 7px;
    font-size: 0.82rem;
    padding: 1px 0;
  }

  .sumrow span {
    flex: 1;
    min-width: 0;
    overflow-wrap: break-word;
  }

  .sumrow b {
    font-family: var(--util);
    font-size: 0.8rem;
  }

  .sumrow em {
    font-family: var(--util);
    font-size: 0.7rem;
    font-style: normal;
    min-width: 62px;
    text-align: right;
  }

  .sumrow em.plus {
    color: var(--matcha);
  }

  .sumrow em.minus {
    color: var(--shu-deep);
  }

  .expenses {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 260px;
    overflow-y: auto;
  }

  .expenses li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    border-bottom: 1px solid var(--line-soft);
    font-size: 0.82rem;
  }

  .edate {
    font-family: var(--util);
    font-size: 0.7rem;
    color: var(--ai-40);
    flex: none;
    min-width: 44px;
  }

  .elabel {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .epayer {
    font-family: var(--util);
    font-size: 0.68rem;
    color: var(--ai-40);
    flex: none;
  }

  .expenses b {
    font-family: var(--util);
    font-size: 0.8rem;
    flex: none;
  }

  /* ------------------------------------------------------------------ Diverses */

  .additem {
    display: flex;
    gap: 6px;
    margin-top: 12px;
  }

  .additem input {
    flex: 1;
    min-width: 0;
    background: var(--washi);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 7px 10px;
    font-family: var(--util);
    font-size: 0.8rem;
  }

  .ctl {
    width: 22px;
    height: 22px;
    border: 1px solid var(--line);
    background: var(--washi);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.78rem;
    color: var(--ai-40);
    flex: none;
    padding: 0;
    line-height: 1;
  }

  .ctl:hover {
    border-color: var(--shu);
    color: var(--shu);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
    gap: 9px;
    margin: 12px 0;
  }

  .stats div {
    background: var(--washi-2);
    border-radius: var(--radius-sm);
    padding: 9px 10px;
  }

  .stats b {
    display: block;
    font-family: var(--disp);
    font-size: 1.24rem;
    color: var(--shu);
    line-height: 1.1;
  }

  .stats small {
    font-family: var(--util);
    font-size: 0.64rem;
    color: var(--ai-40);
    line-height: 1.3;
    display: block;
  }

  .dataactions {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 10px;
  }

  .dataactions label {
    cursor: pointer;
  }

  .danger:hover {
    border-color: var(--shu);
    color: var(--shu-deep);
  }

  .msg {
    font-family: var(--util);
    font-size: 0.78rem;
    color: var(--matcha);
    margin: 10px 0 0;
  }

  .msg.bad {
    color: var(--shu-deep);
  }

  .hint,
  .empty {
    font-family: var(--util);
    font-size: 0.72rem;
    color: var(--ai-40);
    margin: 6px 0 0;
  }
</style>
