<script lang="ts">
  /**
   * Buchungen, Packliste und der Datenabgleich.
   *
   * Die Buchungsliste besteht aus zwei Quellen: den festen Einträgen aus
   * bookings.json (Unterkünfte, Transport, Fristen) und den Orten, bei denen das
   * Reiseband eine Reservierung erwähnt — letztere werden aus places.json
   * abgeleitet, damit sie nicht doppelt gepflegt werden müssen.
   */
  import LoginPanel from './LoginPanel.svelte';
  import SyncPanel from './SyncPanel.svelte';
  import { sync } from '../lib/sync.svelte';
  import bookingsData from '../data/bookings.json';
  import packingData from '../data/packing.json';
  import {
    addPackingItem,
    exportJson,
    importJson,
    plan,
    removePackingItem,
    resetAll,
    sichtbareOrte,
    toggleBooking,
    togglePacking,
  } from '../lib/store.svelte';
  import { formatFull, heuteInJapan } from '../lib/trip';
  import { url } from '../lib/paths';
  import { dateiAnbieten } from '../lib/download';

  // In Japan-Zeit — für den Dateinamen des Exports und die Fristen.
  const today = heuteInJapan();

  type Booking = {
    id: string;
    label: string;
    detail: string;
    due: string | null;
    group: string;
  };

  /**
   * Feste Einträge plus die Orte, die eine Reservierung brauchen — aus der
   * **korrigierten** Liste und reaktiv. Bis zum 23.09. kam sie einmalig aus dem
   * Build: Ein eigener Ort mit „Reservierung nötig" tauchte nie auf, ein auf
   * „keine Reservierung" korrigierter blieb für immer stehen. Nur endgültig
   * nummerierte Orte: Der Haken wird unter `place:<nr>` gespeichert, und eine
   * vorläufige (negative) Nummer wechselt beim nächsten Abgleich.
   */
  let bookings: Booking[] = $derived([
    ...(bookingsData as Booking[]),
    ...sichtbareOrte()
      .filter((p) => p.needsBooking && p.nr > 0)
      .map((p) => ({
        id: `place:${p.nr}`,
        label: `${p.nr} · ${p.name}`,
        detail: p.descriptionHtml.replace(/<[^>]+>/g, ''),
        due: null,
        group: 'Vor Ort reservieren',
      })),
  ]);

  let groups = $derived([...new Set(bookings.map((b) => b.group))]);

  let openBookings = $derived(bookings.filter((b) => !plan.bookings[b.id]).length);

  /** Überfällige und nahe Fristen zuerst. */
  let urgent = $derived(
    bookings
      .filter((b) => b.due && !plan.bookings[b.id])
      .sort((a, b) => (a.due! < b.due! ? -1 : 1))
      .slice(0, 3),
  );

  /*
   * Hier stand das Budget: Ausgaben erfassen, je Person und Station summieren,
   * Ausgleich zwischen den dreien. Es ist seit dem 23.09. auf Wunsch raus aus der
   * Seite. Die Daten bleiben unangetastet — `plan.expenses` und die Tabelle
   * `expenses` in der Datenbank —, der Abgleich überträgt sie weiter. Wer es
   * zurückwill, holt diesen Abschnitt aus der Versionsgeschichte.
   */

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
    dateiAnbieten(blob, `japan-2026-plan-${today}.json`);
  }

  /** Angemeldet schreibt jede Übernahme auch die gemeinsame Ablage um. */
  let wirktAufAlle = $derived(sync.status !== 'aus' && sync.status !== 'abgemeldet');

  async function handleFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (
      wirktAufAlle &&
      !confirm(
        'Diese Datei ersetzt den gemeinsamen Plan — auch auf den Geräten der anderen. Fortfahren?',
      )
    ) {
      input.value = '';
      return;
    }
    const result = importJson(await file.text());
    importMsg = result.ok
      ? { ok: true, text: 'Plan übernommen.' }
      : { ok: false, text: result.error ?? 'Die Datei konnte nicht gelesen werden.' };
    input.value = '';
  }

  function confirmReset() {
    const frage = wirktAufAlle
      ? 'Wirklich alles zurücksetzen? Tagesplan, Häkchen und Ausgaben werden gelöscht — '
        + 'angemeldet auch in der gemeinsamen Ablage und damit für alle drei.'
      : 'Wirklich alles zurücksetzen? Tagesplan, Häkchen und Ausgaben werden gelöscht.';
    if (confirm(frage)) {
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

    <div class="login">
      <LoginPanel />
      <SyncPanel />
    </div>

    <!--
      Der Weg zur Selbstprüfung. Sie steht **nicht** in der Navigation: Die trägt
      fünf Einträge, und ein sechster drängt die Tab-Leiste bei 390 px zusammen.
      Hier ist die richtige Stelle, weil daneben schon der Abgleich steht — wer
      nachsieht, ob etwas klemmt, sucht zuerst hier.
    -->
    <p class="wachelink">
      <a href={url('wache')}>Selbstprüfung öffnen</a> — prüft auf <b>diesem</b> Gerät, ob die
      Koordinaten plausibel sind, welche Kartenart läuft und ob der Plan sich speichern lässt.
      Das erreicht keine Prüfung im Bauvorgang, denn eigene Orte und Korrekturen liegen nur
      hier.
    </p>

    <p class="sub">
      Angemeldet gleicht sich der Plan zwischen euren Geräten ab: Änderungen wirken sofort
      hier und gehen dann in die gemeinsame Ablage — auch nachträglich, wenn gerade kein Netz
      da war. Bearbeitet ihr <b>gleichzeitig denselben Tag</b>, gewinnt der spätere Stand.
      Der Export bleibt als Sicherungskopie, die niemand versehentlich überschreiben kann.
    </p>

    <div class="stats">
      <div><b>{plannedTotal}</b><small>Orte eingeplant</small></div>
      <div><b>{plan.done.length}</b><small>besucht</small></div>
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
  .wachelink {
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--ai-60);
    margin: 10px 0 0;
  }
  .wachelink a {
    color: var(--shu);
    font-weight: 600;
  }

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

  .login {
    background: var(--washi-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 11px 13px;
    margin-bottom: 12px;
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

  .hint {
    font-family: var(--util);
    font-size: 0.72rem;
    color: var(--ai-40);
    margin: 6px 0 0;
  }
</style>
