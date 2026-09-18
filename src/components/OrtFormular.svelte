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
    istEigen,
    placeByNr,
    stationLabelOf,
    type Category,
    type Place,
  } from '../lib/places';
  import {
    ortAnlegen,
    ortAendern,
    ortEntfernen,
    schlagworteSetzen,
    schlagworteVon,
    alleSchlagworte,
    istKorrigiert,
    korrekturZuruecknehmen,
  } from '../lib/store.svelte';
  import { auth } from '../lib/auth.svelte';
  import { WEEKDAYS } from '../lib/trip';
  import { lese, inJapan } from '../lib/koordinaten';

  type Props = {
    /** Koordinate aus der Karte. */
    lat: number;
    lng: number;
    /**
     * Gesetzt, wenn ein bestehender Ort bearbeitet wird — fest oder eigen.
     * Feste Orte bekommen eine Korrektur obendrauf, eigene werden direkt
     * geändert. Diese Maske muss den Unterschied nur anzeigen, nicht verwalten.
     */
    ort?: Place | null;
    onfertig?: (nr: number | null) => void;
    onabbruch?: () => void;
    /** Erneut eine Stelle auf der Karte wählen. */
    onneuwaehlen?: () => void;
    /**
     * Vorbelegung für einen neuen Ort. Kommt vom Knopf „✚ Unterkunft": Dann
     * sind Art und Haken schon richtig gesetzt, und es bleibt Name und Adresse.
     */
    vorlage?: { category: Category; unterkunft: boolean; station: string } | null;
  };

  let {
    lat,
    lng,
    ort = null,
    onfertig,
    onabbruch,
    onneuwaehlen,
    vorlage = null,
  }: Props = $props();

  /** Eigener Ort oder einer aus dem gedruckten Reiseband? */
  let eigen = $derived(!ort || istEigen(ort));
  /** Der unkorrigierte Stand aus dem Buch — für „zurück zum Buchwert". */
  let ausDemBuch = $derived(ort && !istEigen(ort) ? placeByNr(ort.nr) : undefined);
  let korrigiert = $derived(ort ? istKorrigiert(ort.nr) : false);

  /**
   * Was weicht vom Reiseband ab, und wie stand es dort?
   *
   * Ohne das weiß man nach drei Tagen nicht mehr, was man selbst geändert hat
   * und was aus dem Buch kommt — und traut am Ende keinem der beiden.
   */
  let abweichungen = $derived.by(() => {
    if (!ort || !ausDemBuch) return [] as { feld: string; imBuch: string }[]
    const b = ausDemBuch;
    const liste: { feld: string; imBuch: string }[] = [];
    if (ort.name !== b.name) liste.push({ feld: 'Name', imBuch: b.name });
    if (ort.category !== b.category) {
      liste.push({ feld: 'Art', imBuch: CATEGORIES.find((c) => c.key === b.category)?.short ?? b.category });
    }
    if (ort.station !== b.station) liste.push({ feld: 'Station', imBuch: stationLabelOf(b.station) });
    if (Math.abs(ort.lat - b.lat) > 1e-6 || Math.abs(ort.lng - b.lng) > 1e-6) {
      liste.push({ feld: 'Koordinate', imBuch: `${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}` });
    }
    if (ort.closedDay !== b.closedDay) {
      liste.push({ feld: 'geschlossen', imBuch: b.closedDay ?? 'kein Schließtag' });
    }
    if (Boolean(ort.book) !== Boolean(b.book)) {
      liste.push({ feld: '📖', imBuch: b.book ? `Erlebnis ${b.book}` : 'nicht im Buch' });
    }
    if (ort.needsBooking !== b.needsBooking) {
      liste.push({ feld: 'Reservierung', imBuch: b.needsBooking ? 'nötig' : 'nicht nötig' });
    }
    if (ort.cashOnly !== b.cashOnly) {
      liste.push({ feld: 'Bargeld', imBuch: b.cashOnly ? 'nur Bargeld' : 'Karte geht' });
    }
    if (ort.descriptionHtml !== b.descriptionHtml) liste.push({ feld: 'Notiz', imBuch: 'geändert' });
    return liste;
  });

  let name = $state(ort?.name ?? '');
  let category = $state<Category>(ort?.category ?? vorlage?.category ?? 'kultur');
  let station = $state(ort?.station ?? vorlage?.station ?? STATIONSWAHL[0].slug);
  let area = $state<'zentrum' | 'ausflug'>(ort?.area ?? 'zentrum');
  let beschreibung = $state(ort?.descriptionHtml ?? '');
  let ausBuch = $state(Boolean(ort?.book));
  let unterkunft = $state(ort ? ort.uebernachtung === 'gebucht' : (vorlage?.unterkunft ?? false));
  let closedDay = $state(ort?.closedDay ?? '');
  let needsBooking = $state(ort?.needsBooking ?? false);
  let cashOnly = $state(ort?.cashOnly ?? false);
  let fehler = $state<string | null>(null);

  // --- Schlagworte
  let worte = $state<string[]>(ort ? [...schlagworteVon(ort.nr)] : []);
  let neuesWort = $state('');
  /** Schon vergebene Wörter, die hier noch fehlen — als Vorschlag. */
  let vorschlaege = $derived(alleSchlagworte().filter((w) => !worte.includes(w)).slice(0, 8));

  function wortDazu(w: string) {
    const sauber = w.trim();
    if (!sauber || worte.includes(sauber)) {
      neuesWort = '';
      return;
    }
    worte = [...worte, sauber];
    neuesWort = '';
  }
  function wortWeg(w: string) {
    worte = worte.filter((x) => x !== w);
  }

  // --- Koordinate aus eingefügtem Text
  let einfuegen = $state('');
  let einfuegeMeldung = $state<string | null>(null);
  let einfuegeArt = $state<'ok' | 'warn' | 'fehler'>('ok');

  /**
   * Erkennt die Koordinate selbst, statt sie abtippen zu lassen.
   *
   * Dafür ist das Feld da: Eine Unterkunft lässt sich nicht auf der Karte
   * antippen, wenn man nicht weiß, wo sie liegt — aber der Maps-Link steht in
   * der Buchungsbestätigung.
   */
  function uebernehmen() {
    const f = lese(einfuegen);
    if (f.art === 'kurzlink') {
      einfuegeArt = 'fehler';
      einfuegeMeldung = f.rat;
      return;
    }
    if (f.art === 'nichts') {
      einfuegeArt = 'fehler';
      einfuegeMeldung =
        'Darin steckt keine Koordinate. Erkannt werden Google-Maps-Links, ein Zahlenpaar wie 35.6895, 139.6917 und Angaben in Grad und Minuten.';
      return;
    }
    breite = f.lat.toFixed(6);
    laenge = f.lng.toFixed(6);
    einfuegen = '';
    // Verdrehte Werte sind der häufigste Tippfehler, und ein Pin im Nichts
    // fällt erst auf, wenn man davorsteht.
    if (!inJapan(f.lat, f.lng)) {
      einfuegeArt = 'warn';
      einfuegeMeldung = `Übernommen (${f.quelle}) — liegt aber nicht in Japan. Breite und Länge vertauscht?`;
      return;
    }
    einfuegeArt = f.quelle.includes('prüfen') ? 'warn' : 'ok';
    einfuegeMeldung = `Übernommen: ${f.quelle}.`;
  }

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

  // Wer den Haken setzt, meint ein Bett — die Kategorie zieht nach, damit der
  // Ort im Filter „Übernachten" auftaucht, wo man ihn sucht.
  $effect(() => {
    if (unterkunft && category !== 'hotel') category = 'hotel';
  });

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

    // Der Startpin liegt in der Mitte der Station — brauchbar zum Anschauen,
    // nicht als Ort. Ohne diese Rückfrage landete ein Hotel bei „Unterkunft
    // eintragen" auf dem Bahnhofsvorplatz, und auf der Reise sucht man dann
    // eine Adresse, die es nicht gibt.
    if (!inJapan(la, lo) && !confirm(`${la.toFixed(5)}, ${lo.toFixed(5)} liegt nicht in Japan. Trotzdem so speichern?`)) {
      return;
    }

    /**
     * Das 📖 braucht drei Zustände, der Haken hat zwei.
     *
     * Bei einem festen Ort heißt „Haken wie vorher" → nicht anfassen
     * (`undefined`), „Haken weg" → ausdrücklich `null`. Würde stattdessen
     * `undefined` gesendet, bliebe ein falsches 📖 stehen — und 72 der
     * Zuordnungen sind über Namensabgleich entstanden, also genau der Fall,
     * um den es geht. Und `'—'` statt des vorhandenen Werts würde die
     * Erlebnisnummer aus dem Buch durch einen Strich ersetzen.
     */
    const buchWert = eigen
      ? ausBuch
        ? '—'
        : undefined
      : ausBuch === Boolean(ort?.book)
        ? undefined
        : ausBuch
          ? (ort?.book ?? '—')
          : null;

    const daten = {
      name: sauber,
      category,
      station,
      stationLabel: stationLabelOf(station),
      area: istAbseitsGewaehlt ? ('zentrum' as const) : area,
      lat: la,
      lng: lo,
      descriptionHtml: beschreibung.trim(),
      unterkunft,
      book: buchWert,
      bookTitle: ausBuch ? 'Aus dem Reiseführer' : undefined,
      closedDay: closedDay || null,
      needsBooking,
      cashOnly,
    };

    if (ort) {
      ortAendern(ort.nr, daten);
      schlagworteSetzen(ort.nr, worte);
      onfertig?.(ort.nr);
      return;
    }
    try {
      const nr = ortAnlegen(daten, auth.userId);
      if (worte.length) schlagworteSetzen(nr, worte);
      onfertig?.(nr);
    } catch (e) {
      fehler = e instanceof Error ? e.message : 'Der Ort konnte nicht angelegt werden.';
    }
  }

  /**
   * Ort weg.
   *
   * Bei einem eigenen heißt das löschen. Bei einem festen ausblenden: Seine
   * Nummer steht im gedruckten Reiseband und wird nie neu vergeben, sonst zeigte
   * das Buch später auf etwas anderes. Die Rückfrage sagt, was passiert.
   */
  function entfernen() {
    if (!ort) return;
    const frage = eigen
      ? `„${ort.name}" wirklich löschen? Der Ort verschwindet auch bei den anderen.`
      : `„${ort.name}" ausblenden? Nr. ${ort.nr} verschwindet aus Liste, Karte und Tagesplanung — die Nummer bleibt belegt, weil sie im gedruckten Reiseband steht. Umkehrbar.`;
    if (!confirm(frage)) return;
    ortEntfernen(ort.nr);
    onfertig?.(null);
  }

  /** Alle Korrekturen zurück — der Stand aus dem Reiseband gilt wieder. */
  function zurueckZumBuch() {
    if (!ort || eigen) return;
    if (!confirm(`Alle Änderungen an Nr. ${ort.nr} zurücknehmen? Es gilt wieder der Stand aus dem Reiseband. Schlagworte bleiben.`)) {
      return;
    }
    korrekturZuruecknehmen(ort.nr);
    onfertig?.(ort.nr);
  }
</script>

<form class="maske" onsubmit={absenden}>
  <div class="kopf">
    <h2>{ort ? 'Ort bearbeiten' : 'Neuer Ort'}</h2>
    {#if ort}
      <span class="nr">
        {istEigen(ort) && ort.vorlaeufig ? 'Nummer folgt' : `Nr. ${ort.nr}`}
      </span>
      {#if !eigen}
        <!-- Sichtbar machen, woran man gerade schraubt: an einem Eintrag aus
             dem gedruckten Band, nicht an einem eigenen. -->
        <span class="herkunft" class:geaendert={korrigiert}>
          {korrigiert ? 'vom Reiseband abweichend' : 'aus dem Reiseband'}
        </span>
      {/if}
    {/if}
    <button type="button" class="zu" onclick={onabbruch} aria-label="schließen">×</button>
  </div>

  {#if abweichungen.length}
    <ul class="abweichungen">
      {#each abweichungen as a (a.feld)}
        <li><b>{a.feld}</b> geändert · im Buch: {a.imBuch}</li>
      {/each}
    </ul>
  {/if}

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

  <!--
    Der wichtigste Weg für Unterkünfte: Link aus der Buchungsbestätigung
    einfügen. Eine Adresse, die man nicht kennt, lässt sich auf der Karte nicht
    antippen — der Link steht dagegen in jeder Bestätigung.
  -->
  <div class="feld einfuegefeld">
    <span>Adresse einfügen</span>
    <div class="zeile">
      <input
        type="text"
        bind:value={einfuegen}
        placeholder="Google-Maps-Link oder 35.6895, 139.6917"
        autocomplete="off"
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            uebernehmen();
          }
        }}
      />
      <button type="button" class="btn small" onclick={uebernehmen} disabled={!einfuegen.trim()}>
        lesen
      </button>
    </div>
    {#if einfuegeMeldung}
      <p class="einfuegemeldung {einfuegeArt}">{einfuegeMeldung}</p>
    {/if}
  </div>

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
      <input type="checkbox" bind:checked={unterkunft} />
      <span>hier schlafen wir</span>
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

  <div class="feld schlagwortfeld">
    <span>Schlagworte</span>
    {#if worte.length}
      <div class="wortreihe">
        {#each worte as w (w)}
          <button type="button" class="wort" onclick={() => wortWeg(w)} title="entfernen">
            {w}<span class="x">✕</span>
          </button>
        {/each}
      </div>
    {/if}
    <div class="zeile">
      <input
        type="text"
        bind:value={neuesWort}
        placeholder="z. B. Frühstück, Regentag, teuer"
        autocomplete="off"
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            wortDazu(neuesWort);
          }
        }}
      />
      <button type="button" class="btn small" onclick={() => wortDazu(neuesWort)} disabled={!neuesWort.trim()}>
        dazu
      </button>
    </div>
    {#if vorschlaege.length}
      <!-- Schon vergebene Wörter anbieten, damit nicht „Frühstück" und
           „fruehstueck" nebeneinander entstehen und der Filter zerfällt. -->
      <div class="wortreihe vorschlag">
        {#each vorschlaege as w (w)}
          <button type="button" class="wort leer" onclick={() => wortDazu(w)}>+ {w}</button>
        {/each}
      </div>
    {/if}
  </div>

  {#if fehler}
    <p class="fehler">{fehler}</p>
  {/if}

  <div class="knoepfe">
    {#if ort}
      <button type="button" class="btn small ghost danger" onclick={entfernen}>
        {eigen ? 'löschen' : 'ausblenden'}
      </button>
      {#if korrigiert}
        <button type="button" class="btn small ghost" onclick={zurueckZumBuch}>
          zurück zum Buchwert
        </button>
      {/if}
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

  .herkunft {
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--ai);
    opacity: 0.75;
  }
  .herkunft.geaendert {
    border-color: var(--shu);
    color: var(--shu);
    opacity: 1;
  }

  .abweichungen {
    list-style: none;
    margin: 0;
    padding: 8px 10px;
    border-left: 3px solid var(--shu);
    background: rgba(198, 64, 43, 0.06);
    font-size: 0.76rem;
    line-height: 1.5;
  }

  /* Einfügefeld und Schlagworte teilen sich die Zeilenform. */
  .einfuegefeld .zeile,
  .schlagwortfeld .zeile {
    display: flex;
    gap: 6px;
  }
  .einfuegefeld .zeile input,
  .schlagwortfeld .zeile input {
    flex: 1 1 0;
    min-width: 0;
  }
  .einfuegefeld .zeile .btn,
  .schlagwortfeld .zeile .btn {
    flex: none;
    min-height: 44px;
  }

  .einfuegemeldung {
    margin: 6px 0 0;
    font-size: 0.74rem;
    line-height: 1.45;
  }
  .einfuegemeldung.ok {
    color: var(--matcha);
  }
  .einfuegemeldung.warn {
    color: var(--kin);
  }
  .einfuegemeldung.fehler {
    color: var(--shu);
  }

  .wortreihe {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }
  .wortreihe.vorschlag {
    margin: 6px 0 0;
  }
  /* 44 px hoch, weil darunter kein Finger trifft. */
  .wort {
    min-height: 44px;
    padding: 0 10px;
    border: 1px solid var(--ai);
    border-radius: 999px;
    background: var(--ai);
    color: var(--washi);
    font: inherit;
    font-size: 0.76rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .wort .x {
    opacity: 0.7;
    font-size: 0.68rem;
  }
  .wort.leer {
    background: transparent;
    color: var(--ai);
    border-style: dashed;
    opacity: 0.8;
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
    flex-wrap: wrap;
  }
  /*
   * 44 px, nicht die 38 der allgemeinen Knopfgröße.
   *
   * Hier stehen jetzt bis zu vier Knöpfe nebeneinander, darunter „ausblenden"
   * und „zurück zum Buchwert" — beides Dinge, die man nicht versehentlich
   * treffen will und die man mit einem Daumen im Zug treffen muss. Unter 44 px
   * geht beides schief.
   */
  .knoepfe .btn,
  /* Auch „auf Karte wählen" — der steht in der Koordinatenzeile, nicht hier. */
  .koordinaten .btn {
    min-height: 44px;
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
