<script lang="ts">
  /**
   * Das Reisetagebuch für die Gäste.
   *
   * Struktur von Polarsteps, Optik vom Freundebuch: Kennzahlen, Karte mit Route
   * und einem Marker je Beitrag, dann die Einträge nach Reisetag gruppiert, zum
   * Schluss die Steckbriefe.
   *
   * **Eine eigene Komponente und keine Verzweigung in `Freundebuch.svelte`.** Dort
   * wäre jede Bedingung „darf schreiben" eine Stelle, an der später ein
   * Löschknopf für Gäste erscheint. Hier gibt es kein einziges Eingabefeld, kein
   * Formular und keinen Löschknopf — das ist die Zusicherung, und sie steht nicht
   * in einer Bedingung, sondern in der Abwesenheit des Markups. Der Browsertest
   * prüft genau das.
   *
   * Geteilt wird nur, was sich ohne Risiko teilen lässt: die Daten
   * (`freundebuch.svelte.ts`), die Logik (`tagebuch.ts`), die Aufkleber und die
   * Optik (`y2k.css`).
   *
   * Bewusst **kein** Import von `lib/store.svelte`: Der würde beim Laden den
   * Plan aus dem localStorage des Betrachters holen — für einen Gast sinnlos —
   * und die halbe Planungsmaschine ins Bundle ziehen.
   */
  import { onMount } from 'svelte';
  import Sticker, { type StickerName } from './Sticker.svelte';
  import MapView from './MapView.svelte';
  import Bildfeld from './Bildfeld.svelte';
  import { vorlagenklasse } from '../lib/vorlagen';
  import '../styles/y2k.css';
  import {
    buch,
    bilderVon,
    ladeFreundebuch,
    person,
    FRAGEN,
    type Beitrag,
  } from '../lib/freundebuch.svelte';
  import {
    escape,
    gruppiereNachTag,
    kennzahlen,
    markenFuer,
    ortVon,
    stationsRoute,
  } from '../lib/tagebuch.ts';
  import { formatFull, trip } from '../lib/trip';

  /**
   * Der Stichtag kommt einmal beim Mounten, nicht bei jedem Lesen.
   *
   * `kennzahlen()` nimmt ihn als Parameter, damit die Funktion prüfbar bleibt.
   * Hier wird er in UTC gebildet — mit lokaler Zeit wäre der Reisetag in Japan
   * um einen Tag verschoben, und die Zeile „Tag 7 von 20" stimmte für die
   * Reisenden nicht.
   */
  const heute = new Date().toISOString().slice(0, 10);

  let kaputt = $state<Set<string>>(new Set());

  onMount(() => {
    // `oeffentlich: true` umgeht den Anmeldezwang und holt öffentliche statt
    // signierter Bildlinks. Kein `initAuth`, kein `initSync` — eine Leseansicht
    // gleicht nichts ab.
    void ladeFreundebuch({ oeffentlich: true });
  });

  let zahlen = $derived(kennzahlen(buch.beitraege, buch.personen, heute));
  let gruppen = $derived(gruppiereNachTag(buch.beitraege));
  let route = $derived(stationsRoute());
  let marken = $derived(
    markenFuer(
      buch.beitraege,
      (id) => person(id).farbe,
      (id) => person(id).name,
    ),
  );

  /** Die neueste Gruppe — Ziel des Sprungs „zum Neuesten". */
  let neuesteGruppe = $derived(gruppen.length ? gruppen[gruppen.length - 1].schluessel : null);

  /**
   * Der Strom wird begrenzt und auf Wunsch verlängert.
   *
   * Grund ist nicht die Übersicht, sondern das Freikontingent: Der Bucket ist
   * öffentlich und hat damit keine Bremse. Rund 300 kB je Foto und hundert
   * Beiträge sind 30 MB pro vollständigem Seitenaufruf; bei fünfzig
   * interessierten Freunden, die mehrfach nachsehen, sind die 5 GB im Monat real
   * erreichbar. `loading="lazy"` hilft nur, solange nicht gescrollt wird.
   */
  const SCHRITT = 8;
  let sichtbareGruppen = $state(SCHRITT);
  let gezeigt = $derived(gruppen.slice(0, sichtbareGruppen));
  let restGruppen = $derived(Math.max(0, gruppen.length - sichtbareGruppen));

  function alleZeigen() {
    sichtbareGruppen = gruppen.length;
  }

  function bildKaputt(id: string) {
    // Mit öffentlichen Links ist `bildUrl` immer gesetzt, der `.kein`-Zweig des
    // Freundebuchs greift hier also nie. Ist die Bilderablage nicht öffentlich,
    // sähe ein Gast kaputte Bildsymbole und niemand erfährt es. Deshalb dieser
    // Weg: Das Versagen der einzigen unprüfbaren Annahme wird sichtbar.
    kaputt = new Set(kaputt).add(id);
  }

  /** Leichte Kippung wie beim Freundebuch — aus der Kennung, nicht zufällig. */
  function kippung(id: string): string {
    let summe = 0;
    for (const z of id) summe += z.charCodeAt(0);
    return `${((summe % 7) - 3) * 0.4}deg`;
  }

  function ortstext(b: Beitrag): string | null {
    return ortVon(b)?.name ?? null;
  }
</script>

<div class="y2k tagebuch">
  <!-- ------------------------------------------------------------------ Kopf -->
  <header class="kopf">
    <div class="glitzer" aria-hidden="true">
      <Sticker name="sakura" size={22} />
      <Sticker name="fuji" size={22} />
      <Sticker name="ramen" size={22} />
      <Sticker name="torii" size={22} />
    </div>

    <div class="jp">りょこう にっき</div>
    <h1>REISE TAGEBUCH</h1>
    <div class="jahr">
      {formatFull(trip.start)} – {formatFull(trip.end)}
    </div>

    <div class="laufband" aria-hidden="true">
      <div class="lauf">
        {#if zahlen.reisetagJetzt !== null}
          ★ unterwegs — Tag {zahlen.reisetagJetzt} von {zahlen.tageGesamt} ★ Paule,
          Deggel und Baldes in Japan ★
        {:else if zahlen.tageBisAbreise !== null}
          ★ noch {zahlen.tageBisAbreise}
          {zahlen.tageBisAbreise === 1 ? 'Tag' : 'Tage'} bis zur Abreise ★ hier
          erscheinen die Einträge ★
        {:else}
          ★ zurück ★ {zahlen.anzahl}
          {zahlen.anzahl === 1 ? 'Eintrag' : 'Einträge'} aus {zahlen.tageGesamt} Tagen
          Japan ★
        {/if}
      </div>
    </div>
  </header>

  <!-- ------------------------------------------------------------- Zustände -->
  {#if buch.status === 'aus'}
    <div class="kasten warnung">
      Das Tagebuch ist noch nicht verbunden — die Zugangsdaten fehlen im Build.
    </div>
  {:else if buch.status === 'fehler'}
    <div class="kasten warnung">
      {buch.fehler}
      <button class="knopf schlicht" onclick={() => void ladeFreundebuch({ oeffentlich: true })}>
        nochmal versuchen
      </button>
    </div>
  {:else if buch.status === 'lädt'}
    <p class="hinweis">lädt …</p>
  {/if}

  {#if buch.status === 'bereit'}
    <!-- ---------------------------------------------------------- Kennzahlen -->
    <section class="teil">
      <h2><Sticker name="fuji" size={24} />Die Reise in Zahlen</h2>

      <div class="zahlen">
        <div class="zahl">
          <b>{zahlen.tageGesamt}</b><span>Tage</span>
        </div>
        <div class="zahl">
          <b>{zahlen.naechte}</b><span>Nächte</span>
        </div>
        <div class="zahl">
          <b>{zahlen.stationen}</b><span>Stationen</span>
        </div>
        <div class="zahl">
          <b>{zahlen.anzahl}</b><span>{zahlen.anzahl === 1 ? 'Eintrag' : 'Einträge'}</span>
        </div>
        <div class="zahl">
          <b>{zahlen.mitFoto}</b><span>mit Foto</span>
        </div>
        <div class="zahl">
          <b>{zahlen.orte}</b><span>Orte</span>
        </div>
      </div>

      {#if zahlen.anzahl > 0}
        <p class="mini">
          An {zahlen.tageMitEintrag} von {zahlen.tageGesamt} Tagen wurde geschrieben.
          {#if zahlen.aufkleber}
            Meistgeklebt: {zahlen.aufkleber.name} ({zahlen.aufkleber.anzahl}×).
          {/if}
        </p>

        <ul class="jeperson">
          {#each zahlen.jePerson as eintrag (eintrag.person.id)}
            <li style={`--k:${eintrag.person.farbe}`}>
              <span class="pname">{eintrag.person.name}</span>
              <span class="pbalken" style={`width:${Math.round((eintrag.anzahl / Math.max(1, zahlen.jePerson[0].anzahl)) * 100)}%`}
              ></span>
              <span class="pzahl">{eintrag.anzahl}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- --------------------------------------------------------------- Karte -->
    <section class="teil">
      <h2><Sticker name="torii" size={24} />Wo wir waren</h2>
      <p class="mini">
        Die gestrichelte Linie ist die <b>geplante</b> Route über die sechs Stationen.
        Ein Kreis steht für einen Ort; die Zahl dahinter sagt, wie viele Einträge
        dort geschrieben wurden — alle stehen im Popup.
      </p>

      <!--
        `places={[]} visible={[]}`: Damit fallen die 164 Reiseführer-Marker und
        ihre Popups weg. Die Karte zeigt ausschließlich Route und Beiträge.

        Eine Marke je **Ort**, nicht je Beitrag: Zwei Marker auf derselben
        Koordinate verdecken einander vollständig, und der untere nimmt keine
        Klicks mehr an. `markenFuer()` bündelt deshalb — siehe den Kopf der
        Funktion in `src/lib/tagebuch.ts`.
      -->
      <div class="karterahmen">
        <MapView
          places={[]}
          visible={[]}
          center={[36.2, 137.5]}
          zoom={6}
          linie={{ punkte: route, farbe: '#7b5cff' }}
          {marken}
        />
      </div>
    </section>

    <!-- ----------------------------------------------------------- Einträge -->
    <section class="teil">
      <h2><Sticker name="ramen" size={24} />Tag für Tag</h2>

      {#if !gruppen.length}
        <p class="hinweis">
          Noch kein Eintrag. Die Reise beginnt am {formatFull(trip.start)}.
        </p>
      {:else}
        {#if neuesteGruppe && gruppen.length > 2}
          <!-- Vorwärts gelesen, aber wer täglich mitliest, will nicht scrollen. -->
          <p class="sprung">
            <a href={`#${neuesteGruppe}`} onclick={alleZeigen}>↓ zum Neuesten</a>
          </p>
        {/if}

        {#each gezeigt as gruppe (gruppe.schluessel)}
          <div class="tag" id={gruppe.schluessel}>
            <div class="tagkopf" class:rand={gruppe.lage !== 'reise'}>
              <b>{gruppe.titel}</b>
              <span>{gruppe.untertitel}</span>
            </div>

            <div class="strom">
              {#each gruppe.beitraege as b (b.id)}
                {@const wer = person(b.autorId)}
                {@const ort = ortstext(b)}
                <article
                  class={vorlagenklasse(b.vorlage)}
                  class:nurtext={!b.bildUrls.length || kaputt.has(b.id)}
                  style={`--k:${wer.farbe}; --kipp:${kippung(b.id)}`}
                >
                  {#if b.sticker}
                    <span class="klebe">
                      <Sticker name={b.sticker as StickerName} size={34} />
                    </span>
                  {/if}

                  <!--
                    Dieselbe Komponente wie im Freundebuch. Sie enthält bewusst
                    kein `button` und kein `input` — die Zusicherung dieser Seite,
                    nichts Bedienbares zu tragen, bleibt damit heil.
                  -->
                  {#if !kaputt.has(b.id)}
                    <Bildfeld
                      vorlage={b.vorlage}
                      bilder={bilderVon(b)}
                      erwartet={b.bildPfade.length}
                      onFehler={() => bildKaputt(b.id)}
                    />
                  {:else}
                    <div class="kein">Bild lässt sich gerade nicht laden</div>
                  {/if}

                  <div class="unten">
                    {#if b.text}<p>{b.text}</p>{/if}
                    <div class="zeile">
                      <span class="wer">{wer.name}</span>
                      {#if ort}<span class="ort">{ort}</span>{/if}
                    </div>
                  </div>
                </article>
              {/each}
            </div>
          </div>
        {/each}

        {#if restGruppen > 0}
          <button class="knopf gross" onclick={alleZeigen}>
            ▾ {restGruppen} weitere {restGruppen === 1 ? 'Tag' : 'Tage'} anzeigen
          </button>
        {/if}
      {/if}
    </section>

    <!-- -------------------------------------------------------- Steckbriefe -->
    {#if buch.personen.length}
      <section class="teil">
        <h2><Sticker name="sakura" size={24} />Wer unterwegs ist</h2>

        <div class="briefe">
          {#each buch.personen as p (p.id)}
            {@const brief = buch.steckbriefe[p.id] ?? {}}
            <article class="brief" style={`--k:${p.farbe}`}>
              <div class="briefkopf">
                <span class="avatar">{['(•‿•)', '(＾▽＾)', '(๑˃̵ᴗ˂̵)'][buch.personen.indexOf(p) % 3]}</span>
                <b>{p.name}</b>
              </div>
              <dl>
                {#each FRAGEN as frage (frage.feld)}
                  <dt>{frage.frage}</dt>
                  <!-- Nur Text, nie ein Eingabefeld. Gäste lesen. -->
                  <dd>{brief[frage.feld] || '— noch nichts —'}</dd>
                {/each}
              </dl>
            </article>
          {/each}
        </div>
      </section>
    {/if}
  {/if}

  <!-- ------------------------------------------------------------------ Fuß -->
  <footer class="fuss">
    <div class="bau" aria-hidden="true">✦ ✦ ✦</div>
    <p>
      Ein Reisetagebuch von Paule, Deggel und Baldes.<br />
      <span class="jp">ありがとう</span>
    </p>
  </footer>
</div>

<style>
  /* Nur was es im Freundebuch nicht gibt. Alles Gemeinsame steht in y2k.css. */

  .tagebuch {
    padding-top: 6px;
  }

  /* ---------------------------------------------------------- Kennzahlen */

  .zahlen {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .zahl {
    border: 3px solid var(--tinte);
    border-radius: 8px;
    background: #fff;
    padding: 8px 4px;
    text-align: center;
    box-shadow: 2px 2px 0 var(--lila);
  }
  .zahl b {
    display: block;
    font-size: 1.5rem;
    line-height: 1.1;
    color: var(--tinte);
  }
  .zahl span {
    display: block;
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6b5a8a;
  }

  .mini {
    font-size: 0.76rem;
    line-height: 1.55;
    color: #6b5a8a;
    margin: 10px 0 0;
  }

  .jeperson {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .jeperson li {
    display: grid;
    /* Name, Balken, Zahl — der Balken nimmt, was übrig ist. */
    grid-template-columns: 5.5em 1fr 2em;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
  }
  .pname {
    color: var(--tinte);
    font-weight: 700;
  }
  .pbalken {
    height: 12px;
    min-width: 3px;
    background: var(--k);
    border: 2px solid var(--tinte);
    border-radius: 3px;
  }
  .pzahl {
    text-align: right;
    color: #6b5a8a;
  }

  /* --------------------------------------------------------------- Karte */

  .karterahmen {
    /* Feste Höhe ist Pflicht: Leaflet braucht sie, und die Hinweisfelder der
       Komponente liegen absolut. */
    position: relative;
    height: 62vw;
    min-height: 260px;
    max-height: 420px;
    margin-top: 10px;
    border: 3px solid var(--tinte);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 3px 3px 0 var(--cyan);
  }

  /* ------------------------------------------------------------ Tagesköpfe */

  .tag {
    /* Damit der Sprung „zum Neuesten" die Kopfzeile nicht unter den Rand
       schiebt. */
    scroll-margin-top: 14px;
  }
  .tag + .tag {
    margin-top: 18px;
  }
  .tagkopf {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    padding: 5px 9px;
    margin-bottom: 8px;
    background: var(--lila);
    color: #fff;
    border: 3px solid var(--tinte);
    border-radius: 6px;
    box-shadow: 2px 2px 0 var(--tinte);
  }
  /* Einträge außerhalb der Reise sehen anders aus — sonst liest man sie als
     Reisetag. */
  .tagkopf.rand {
    background: #8a7fa8;
  }
  .tagkopf b {
    font-size: 0.95rem;
  }
  .tagkopf span {
    font-size: 0.72rem;
    opacity: 0.9;
  }

  .sprung {
    margin: 0 0 12px;
    font-size: 0.8rem;
  }
  .sprung a {
    color: var(--pink);
    font-weight: 700;
    /* 44 px, damit ein Finger den Sprung trifft. */
    display: inline-block;
    padding: 12px 0;
  }

  /* ---------------------------------------------------------- Steckbriefe */

  .briefe {
    display: grid;
    gap: 10px;
  }
  .brief {
    border: 3px solid var(--tinte);
    border-radius: 8px;
    background: #fff;
    padding: 10px 12px;
    box-shadow: 3px 3px 0 var(--k);
  }
  .briefkopf {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .avatar {
    font-size: 0.9rem;
    color: var(--k);
  }
  .briefkopf b {
    font-size: 0.95rem;
    color: var(--tinte);
  }
  .brief dl {
    margin: 0;
    display: grid;
    gap: 4px 10px;
    grid-template-columns: 1fr;
  }
  .brief dt {
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6b5a8a;
  }
  .brief dd {
    margin: 0 0 6px;
    font-size: 0.85rem;
    color: var(--tinte);
  }

  /* ------------------------------------------------ Kartenpopups (global) ---

     `:global()`, weil Leaflet die Popup-Knoten außerhalb des Svelte-Scopes in
     die Karte einhängt — mit Hash träfe keine Regel. Dasselbe Muster wie die
     `:global(.jp-popup…)`-Regeln in `MapView.svelte`.

     Das `tb-`-Präfix ist deshalb Pflicht und nicht Geschmack: Die Regeln liegen
     global, und ein `.popup` oder `.eintrag` würde in der ganzen Anwendung
     wirken. Das HTML dazu baut `popupHtml()` in `src/lib/tagebuch.ts`; ändert
     sich dort ein Klassenname, verschwindet hier still die Optik. */
  :global(.tb-popup) {
    font-family: 'Zen Kaku Gothic New', system-ui, sans-serif;
    color: var(--tinte);
  }

  :global(.tb-popup > strong) {
    display: block;
    font-family: 'DotGothic16', monospace;
    font-size: 0.95rem;
    color: var(--lila);
    border-bottom: 2px dotted var(--pink);
    padding-bottom: 4px;
    margin-bottom: 6px;
  }

  /* Ein Ort kann mehrere Beiträge tragen — `markenFuer()` bündelt sie, statt
     Marker übereinanderzulegen. Die Trennlinie ab dem zweiten macht sichtbar,
     dass es mehrere sind. */
  :global(.tb-popup-eintrag + .tb-popup-eintrag) {
    border-top: 1px dashed var(--lila);
    margin-top: 8px;
    padding-top: 8px;
  }

  :global(.tb-popup-kopf) {
    font-family: 'DotGothic16', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    color: #6b5f78;
  }

  :global(.tb-popup p) {
    margin: 3px 0 4px;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  :global(.tb-popup-wer) {
    display: inline-block;
    background: var(--lila);
    color: #fff;
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 0.66rem;
  }

  @media (min-width: 560px) {
    .zahlen {
      grid-template-columns: repeat(6, 1fr);
    }
    .brief dl {
      grid-template-columns: 9em 1fr;
    }
    .brief dt {
      text-align: right;
      padding-top: 2px;
    }
  }
</style>
