<script lang="ts">
  /**
   * Maske für einen eigenen Ort — neu anlegen oder einen bestehenden ändern.
   *
   * Zwei Entscheidungen, die man an der Form sieht:
   *
   * 1. **Die Koordinate kommt von der Karte**, nicht aus zwei Zahlenfeldern.
   *    Wer unterwegs einen Laden entdeckt, tippt ihn auf der Karte an; Breite
   *    und Länge stehen nur zur Kontrolle da und sind trotzdem tippbar, falls
   *    die Werte aus einer anderen Quelle kommen.
   * 2. **„Nicht auf der Route" ist eine Station wie die anderen** — mit dem
   *    ausdrücklichen Hinweis, dass so ein Ort auf keinen Reisetag kann.
   */
  import {
    CATEGORIES,
    STATIONSWAHL,
    ABSEITS,
    stationLabelOf,
    type Category,
    type EigenerOrt,
  } from '../lib/places';
  import { ortAnlegen, ortAendern, ortLoeschen } from '../lib/store.svelte';
  import { auth } from '../lib/auth.svelte';
  import { WEEKDAYS } from '../lib/trip';

  type Props = {
    /** Koordinate aus der Karte. */
    lat: number;
    lng: number;
    /** Gesetzt, wenn ein bestehender Ort bearbeitet wird. */
    ort?: EigenerOrt | null;
    onfertig?: (nr: number | null) => void;
    onabbruch?: () => void;
    /** Erneut eine Stelle auf der Karte wählen. */
    onneuwaehlen?: () => void;
  };

  let { lat, lng, ort = null, onfertig, onabbruch, onneuwaehlen }: Props = $props();

  let name = $state(ort?.name ?? '');
  let category = $state<Category>(ort?.category ?? 'kultur');
  let station = $state(ort?.station ?? STATIONSWAHL[0].slug);
  let area = $state<'zentrum' | 'ausflug'>(ort?.area ?? 'zentrum');
  let beschreibung = $state(ort?.descriptionHtml ?? '');
  let ausBuch = $state(Boolean(ort?.book));
  let closedDay = $state(ort?.closedDay ?? '');
  let needsBooking = $state(ort?.needsBooking ?? false);
  let cashOnly = $state(ort?.cashOnly ?? false);
  let fehler = $state<string | null>(null);

  // Beim Bearbeiten bleibt die gespeicherte Koordinate, solange keine neue
  // gewählt wurde.
  let breite = $state(String((ort?.lat ?? lat).toFixed(6)));
  let laenge = $state(String((ort?.lng ?? lng).toFixed(6)));

  $effect(() => {
    // Neue Stelle auf der Karte übernehmen.
    breite = lat.toFixed(6);
    laenge = lng.toFixed(6);
  });

  let istAbseitsGewaehlt = $derived(station === ABSEITS);

  function absenden(e: Event) {
    e.preventDefault();
    fehler = null;

    const sauber = name.trim();
    if (!sauber) {
      fehler = 'Ohne Namen lässt sich der Ort später nicht finden.';
      return;
    }
    const la = Number(breite);
    const lo = Number(laenge);
    if (!Number.isFinite(la) || la < -90 || la > 90) {
      fehler = 'Die Breite muss zwischen -90 und 90 liegen.';
      return;
    }
    if (!Number.isFinite(lo) || lo < -180 || lo > 180) {
      fehler = 'Die Länge muss zwischen -180 und 180 liegen.';
      return;
    }

    const daten = {
      name: sauber,
      category,
      station,
      stationLabel: stationLabelOf(station),
      area: istAbseitsGewaehlt ? ('zentrum' as const) : area,
      lat: la,
      lng: lo,
      descriptionHtml: beschreibung.trim(),
      book: ausBuch ? '—' : undefined,
      bookTitle: ausBuch ? 'Aus dem Reiseführer' : undefined,
      closedDay: closedDay || null,
      needsBooking,
      cashOnly,
    };

    if (ort) {
      ortAendern(ort.nr, daten);
      onfertig?.(ort.nr);
      return;
    }
    try {
      onfertig?.(ortAnlegen(daten, auth.userId));
    } catch (e) {
      fehler = e instanceof Error ? e.message : 'Der Ort konnte nicht angelegt werden.';
    }
  }

  function loeschen() {
    if (!ort) return;
    if (!confirm(`„${ort.name}" wirklich löschen? Der Ort verschwindet auch bei den anderen.`)) {
      return;
    }
    ortLoeschen(ort.nr);
    onfertig?.(null);
  }
</script>

<form class="maske" onsubmit={absenden}>
  <div class="kopf">
    <h2>{ort ? 'Ort bearbeiten' : 'Neuer Ort'}</h2>
    {#if ort}
      <span class="nr">{ort.vorlaeufig ? 'Nummer folgt' : `Nr. ${ort.nr}`}</span>
    {/if}
    <button type="button" class="zu" onclick={onabbruch} aria-label="schließen">×</button>
  </div>

  <label class="feld">
    <span>Name</span>
    <input type="text" bind:value={name} placeholder="z. B. Hoshino Coffee" required />
  </label>

  <div class="paar">
    <label class="feld">
      <span>Art</span>
      <select bind:value={category}>
        {#each CATEGORIES as c (c.key)}
          <option value={c.key}>{c.label}</option>
        {/each}
      </select>
    </label>

    <label class="feld">
      <span>Station</span>
      <select bind:value={station}>
        {#each STATIONSWAHL as s (s.slug)}
          <option value={s.slug}>{s.label}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if istAbseitsGewaehlt}
    <p class="warn">
      Orte abseits der Route stehen auf Karte und in der Liste, lassen sich aber
      <b>nicht auf einen Reisetag legen</b> — sie liegen zu weit weg, um an einem
      Nachmittag dazwischenzupassen.
    </p>
  {:else}
    <div class="radios">
      <label>
        <input type="radio" bind:group={area} value="zentrum" />
        <span>im Zentrum</span>
      </label>
      <label>
        <input type="radio" bind:group={area} value="ausflug" />
        <span>Ausflug in die Umgebung</span>
      </label>
    </div>
  {/if}

  <label class="feld">
    <span>Notiz</span>
    <textarea
      bind:value={beschreibung}
      rows="3"
      placeholder="Was hier zu holen ist, Öffnungszeiten, Warnungen …"
    ></textarea>
  </label>

  <div class="koordinaten">
    <label class="feld klein">
      <span>Breite</span>
      <input type="text" bind:value={breite} inputmode="decimal" />
    </label>
    <label class="feld klein">
      <span>Länge</span>
      <input type="text" bind:value={laenge} inputmode="decimal" />
    </label>
    {#if onneuwaehlen}
      <button type="button" class="btn small ghost" onclick={onneuwaehlen}>
        auf Karte wählen
      </button>
    {/if}
  </div>

  <div class="haken">
    <label>
      <input type="checkbox" bind:checked={ausBuch} />
      <span>📖 aus dem Reiseführer</span>
    </label>
    <label>
      <input type="checkbox" bind:checked={needsBooking} />
      <span>Reservierung nötig</span>
    </label>
    <label>
      <input type="checkbox" bind:checked={cashOnly} />
      <span>nur Bargeld</span>
    </label>
    <label class="tag">
      <span>geschlossen</span>
      <select bind:value={closedDay}>
        <option value="">—</option>
        {#each WEEKDAYS as w (w)}
          <option value={w}>{w}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if fehler}
    <p class="fehler">{fehler}</p>
  {/if}

  <div class="knoepfe">
    {#if ort}
      <button type="button" class="btn small ghost danger" onclick={loeschen}>löschen</button>
    {/if}
    <span class="spacer"></span>
    <button type="button" class="btn small ghost" onclick={onabbruch}>abbrechen</button>
    <button type="submit" class="btn small primary">{ort ? 'speichern' : 'anlegen'}</button>
  </div>
</form>

<style>
  .maske {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-family: var(--util);
  }

  .kopf {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .kopf h2 {
    font-family: var(--disp);
    font-size: 1.05rem;
    margin: 0;
  }

  .nr {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--kin);
  }

  .zu {
    margin-left: auto;
    background: none;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    color: var(--ai-60);
    cursor: pointer;
    padding: 0 4px;
  }

  .feld {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .feld > span {
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ai-60);
  }

  input[type='text'],
  select,
  textarea {
    width: 100%;
    background: var(--washi);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 9px 11px;
    font-family: var(--util);
    font-size: 0.86rem;
    color: var(--ai);
  }

  textarea {
    resize: vertical;
    line-height: 1.5;
  }

  .paar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
  }

  .koordinaten {
    display: flex;
    gap: 9px;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .klein {
    flex: 1;
    min-width: 110px;
  }

  .radios,
  .haken {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: 0.8rem;
    color: var(--ai-60);
  }

  .radios label,
  .haken label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .haken input,
  .radios input {
    accent-color: var(--shu);
    width: 17px;
    height: 17px;
  }

  .haken .tag select {
    width: auto;
    padding: 4px 7px;
  }

  .warn {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--ai-60);
    background: rgba(166, 124, 51, 0.12);
    border-left: 3px solid var(--kin);
    padding: 8px 11px;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  .warn b {
    color: var(--ai);
  }

  .fehler {
    margin: 0;
    font-size: 0.78rem;
    color: var(--shu-deep);
  }

  .knoepfe {
    display: flex;
    gap: 7px;
    align-items: center;
  }

  .spacer {
    flex: 1;
  }

  @media (max-width: 480px) {
    .paar {
      grid-template-columns: 1fr;
    }
  }
</style>
