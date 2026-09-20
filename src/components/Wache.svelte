<script lang="ts">
  /**
   * Die Selbstprüfung — was dieses Gerät über sich sagen kann.
   *
   * ## Warum es diese Seite gibt
   *
   * Der Wächter im CI prüft die **Dateien**: `src/data/places.json`, die 164 Orte
   * aus dem Reiseband. Eigene Orte ab Nr. 165, Ortskorrekturen und Ausblendungen
   * liegen aber im localStorage und in Supabase — der CI sieht sie nie. Wer in der
   * App eine falsche Koordinate einträgt, etwa aus einem Maps-Link, der auf den
   * Kartenmittelpunkt statt den Ort zeigt, bekam bis hierher von nirgends eine
   * Warnung. Genau das ist der Fall, den die Grundregel des Projekts meint: *auf
   * der Reise ist ein falsch markierter Ort schlimmer als ein fehlender.*
   *
   * ## Die Regeln stehen nicht hier
   *
   * Sie stehen in `src/lib/wache.ts` und werden von `test/orte-plausibel.test.ts`
   * im CI genauso benutzt. Eine Kopie hier wäre so lange einig mit dem CI, bis
   * jemand eine der beiden anfasst — und dann sagt der grüne Haken etwas anderes
   * als das Telefon in der Hand. Was in dieser Datei bleibt, ist **Anzeige**.
   *
   * ## Keine Anmeldung, und das ist kein Versehen
   *
   * Die Seite liest ausschließlich localStorage und Konstanten aus der Bauzeit. Ein
   * Fremder sieht seinen eigenen leeren Zustand, nicht euren. Sie holt **nichts**
   * aus Supabase.
   */

  import MapView from './MapView.svelte';
  import { alleOrte } from '../lib/places';
  import { alleOrteMitKorrekturen, plan, vorlaeufigeOrte } from '../lib/store.svelte';
  import { abgleichen, ERSTABGLEICH, kennzahlen, sync } from '../lib/sync.svelte';
  import { auth } from '../lib/auth.svelte';
  import { supabaseConfigured } from '../lib/supabase';
  import { befundZusammenfassung, pruefeOrte, type Befund, type Station } from '../lib/wache';
  import type { Kachelzustand } from '../lib/karte';
  import stationenRoh from '../data/stations.json';
  import { url } from '../lib/paths';

  const stationen = stationenRoh as unknown as Station[];

  // ============================================================= 1) Die Orte ===

  /**
   * Geprüft wird der **Gerätestand**, nicht die Datei.
   *
   * `alleOrteMitKorrekturen()` liefert die 164 mit euren Korrekturen eingerechnet;
   * `plan.customPlaces` sind die selbst angelegten. Ausdrücklich **ohne** den
   * Filter auf Ausgeblendete: Ein ausgeblendeter Ort mit falscher Koordinate ist
   * harmlos (er steht auf keiner Karte), aber wenn er wieder eingeblendet wird,
   * ist der Fehler da. Lieber jetzt gemeldet als unterwegs.
   */
  let geprueft = $derived(alleOrteMitKorrekturen());
  let befunde = $derived<Befund[]>(pruefeOrte(geprueft, stationen));

  /*
   * `geprueft.length` und **nicht** `alleOrte.length`, und das ist eine Korrektur.
   *
   * Der erste Entwurf zeigte „164 Orte geprüft". `alleOrteMitKorrekturen()` baut
   * aber auf `places`, und das lässt die 23 erledigten Unterkunftsvorschläge weg
   * (`places.ts:102`) — geprüft waren also 141 plus die eigenen. Eine Prüfseite,
   * die mehr behauptet, als sie angesehen hat, ist genau das Gegenteil von
   * nützlich: Man hält 23 Orte für kontrolliert, die niemand kontrolliert hat.
   *
   * Dass die 23 fehlen, ist richtig — sie sind in der App gar nicht sichtbar. Also
   * wird die Zahl genannt, die stimmt, und der Unterschied dazu erklärt.
   */
  let zahlen = $derived({
    geprueft: geprueft.length,
    imBuch: alleOrte.length,
    eigen: plan.customPlaces.length,
    korrigiert: Object.keys(plan.korrekturen).length,
    versteckt: Object.values(plan.korrekturen).filter((k) => k.versteckt).length,
    vorlaeufig: vorlaeufigeOrte().length,
  });

  const SCHWERE_TEXT = { fehler: 'Fehler', warnung: 'Achtung', hinweis: 'Hinweis' } as const;

  // ============================================================ 2) Die Karte ===

  /**
   * Der gemeldete Zustand des Kartenhintergrunds.
   *
   * `null`, solange die Karte nichts gesagt hat — das ist nicht dasselbe wie „kein
   * Hintergrund" und wird auch nicht so angezeigt. Eine Prüfseite, die einen
   * Startwert als Messung ausgibt, lügt beim ersten Blick.
   */
  let kachel = $state<Kachelzustand | null>(null);

  /*
   * Die Texte sagen, was der Zustand **belegt** — nicht, was er nahelegt.
   *
   * Hier stand bei `vektor` „Vektorkarte, lateinisch beschriftet". Das war
   * falsch, und zwar auf die unangenehme Art: Genau als auf dem Telefon kein
   * einziger Name auf der Karte stand, hat diese Seite grün gemeldet, die
   * Beschriftung laufe. Der Zustand `vektor` bedeutete nämlich nur „die Ebene
   * wurde angehängt und hat nicht gemeckert". Die Beschriftung selbst hat nie
   * jemand gezählt.
   *
   * Jetzt zählt `MapView` sie (`queryRenderedFeatures`), und der Text hier nennt
   * nur noch, was die Quelle sagt. Was gezeichnet wurde, steht als Zahl darunter.
   */
  const KARTE_TEXT: Record<Kachelzustand['art'], { ton: string; titel: string; was: string }> = {
    vektor: {
      ton: 'gut',
      titel: 'Vektorkarte von OpenFreeMap',
      was: 'Der Stil ist geladen und die Beschriftung auf name_de / name_en / name:latin umgestellt. Ob wirklich etwas gezeichnet wird, steht in den Zahlen darunter.',
    },
    raster: {
      ton: 'warn',
      titel: 'Rasterrückfall — japanisch beschriftet',
      was: 'Die Karte funktioniert, aber die Namen stehen auf Japanisch: Bei Rasterkacheln entscheidet der Server über die Sprache, nicht die App.',
    },
    fehler: {
      ton: 'fehler',
      titel: 'Kein Kartenhintergrund',
      was: 'Marker, Popups und die Ortsliste arbeiten weiter — es fehlt nur das Bild.',
    },
  };

  // Ein Ort mit einer Koordinate, damit die Probekarte etwas anzuzeigen hat.
  let probeOrte = $derived(alleOrte.slice(0, 1));

  // ========================================================= 3) Der Abgleich ===

  let erstabgleich = $state<string | null>(null);
  let speicher = $state<{ ok: boolean; warum: string }>({ ok: true, warum: '' });

  /**
   * Der Schreibversuch auf den localStorage.
   *
   * Im privaten Fenster wirft `setItem` — und dann ist **jede** Planänderung nach
   * dem Schließen weg, ohne dass irgendetwas anderes in dieser App das bemerkt.
   * Das ist ein echter Reisefehlerfall: Man plant abends einen Tag durch, schließt
   * den Tab, und morgens ist der Tag leer.
   *
   * Geprüft wird mit Schreiben **und** Zurücklesen: Ein Speicher, der still
   * verwirft, käme sonst als in Ordnung durch.
   */
  $effect(() => {
    try {
      const probe = 'japan2026:wache-probe';
      localStorage.setItem(probe, 'ja');
      const zurueck = localStorage.getItem(probe);
      localStorage.removeItem(probe);
      speicher =
        zurueck === 'ja'
          ? { ok: true, warum: '' }
          : { ok: false, warum: 'Geschrieben, aber nicht zurückgelesen.' };
      erstabgleich = localStorage.getItem(ERSTABGLEICH);
    } catch (e) {
      speicher = { ok: false, warum: e instanceof Error ? e.message : String(e) };
    }
  });

  const ABGLEICH_TEXT: Record<string, string> = {
    aus: 'kein Abgleich eingerichtet',
    abgemeldet: 'nicht angemeldet',
    lädt: 'gleicht gerade ab',
    bereit: 'abgeglichen',
    wartet: 'wartet auf Netz',
    entscheidung: 'Entscheidung nötig',
    fehler: 'gestört',
  };

  let plandaten = $derived(kennzahlen(plan));

  const zeit = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  /**
   * `abgleichen()` gibt **still** auf, wenn `auth.userId` fehlt oder Supabase nicht
   * eingerichtet ist (`sync.svelte.ts:749-751`). Ein Knopf, der dann nichts tut,
   * sieht wie ein Fehler aus — deshalb ist er in diesem Fall abgeschaltet und sagt,
   * woran es liegt.
   */
  let kannAbgleichen = $derived(supabaseConfigured && !!auth.userId);
</script>

<section class="wache">
  <!-- ======================================================== 1) Die Orte -->
  <div class="block" class:gut={!befunde.length}>
    <h2>Orte</h2>
    <p class="fazit" class:gut={!befunde.length} class:schlecht={befunde.length > 0}>
      {befundZusammenfassung(befunde)}
    </p>

    {#if befunde.length}
      <ul class="befunde">
        {#each befunde as b (`${b.schwere}-${b.nr}-${b.titel}`)}
          <li class={b.schwere}>
            <b>{SCHWERE_TEXT[b.schwere]}</b>
            <span class="btitel">{b.titel}</span>
            <span class="bwas">{b.was}</span>
            {#if b.nr !== undefined}
              <!-- Von hier direkt zum Ort. Ein Befund ohne Weg dorthin kostet
                   unterwegs eine Minute Suchen, und die hat man nicht. -->
              <a class="btn small ghost" href={`${url('orte')}?nr=${b.nr}`}>Ort öffnen</a>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="klein">
        Alle Koordinaten liegen im Reiserahmen, jeder Ort passt zu seiner Station, keine
        Dubletten. Geprüft sind <b>{zahlen.geprueft}</b> Orte — die aus dem Reiseband
        <b>mit</b> euren Korrekturen und die {zahlen.eigen} selbst angelegten.
      </p>
    {/if}

    <dl class="zahlen">
      <div><dt>geprüft</dt><dd>{zahlen.geprueft}</dd></div>
      <div><dt>selbst angelegt</dt><dd>{zahlen.eigen}</dd></div>
      <div><dt>korrigiert</dt><dd>{zahlen.korrigiert}</dd></div>
      <div><dt>ausgeblendet</dt><dd>{zahlen.versteckt}</dd></div>
    </dl>
  </div>

  <!-- ======================================================= 2) Die Karte -->
  <div class="block">
    <h2>Karte</h2>
    {#if kachel === null}
      <p class="fazit">Die Karte hat noch nichts gemeldet.</p>
    {:else}
      {@const t = KARTE_TEXT[kachel.art]}
      <p class="fazit" class:gut={t.ton === 'gut'} class:mittel={t.ton === 'warn'} class:schlecht={t.ton === 'fehler'}>
        {t.titel}
      </p>
      <p class="klein">{t.was}</p>
      {#if kachel.host}
        <p class="klein"><b>{kachel.host}</b> antwortet nicht.</p>
      {/if}
      {#if kachel.warum}
        <p class="klein">Grund: {kachel.warum}</p>
      {/if}

      <!--
        Die Zahlen, die aus einer Behauptung eine Messung machen.

        `-1` heißt „noch nicht gemessen" und wird ausdrücklich **nicht** als 0
        angezeigt: Eine Seite, die eine fehlende Messung als „nichts da" ausgibt,
        schlägt beim ersten Blick Alarm und wird danach nicht mehr gelesen.
      -->
      {#if kachel.gezeichnet >= 0}
        <dl class="zahlen">
          <div><dt>gezeichnet</dt><dd>{kachel.gezeichnet}</dd></div>
          <div><dt>davon Namen</dt><dd>{kachel.beschriftet}</dd></div>
        </dl>
        {#if kachel.gezeichnet === 0}
          <p class="klein schlecht">
            Die Vektorquelle hat <b>nichts</b> geliefert. Genau dieser Fall sah auf dem Telefon
            aus wie eine Karte: Der Stil bringt ein Natural-Earth-Reliefbild als eigene
            Rasterquelle mit, und das kam an — Wasser, Straßen und Namen nicht.
          </p>
        {:else if kachel.beschriftet === 0}
          <p class="klein mittel">
            Es wird etwas gezeichnet, aber <b>kein einziger Name</b>. Bei einem kleinen
            Ausschnitt über dem Meer ist das in Ordnung, sonst fehlen die Schriftzeichen
            (Glyphen) des Kartendienstes.
          </p>
        {/if}
      {:else if kachel.art === 'vektor'}
        <p class="klein">Wird gerade gemessen …</p>
      {/if}

      {#if kachel.meldungen.length}
        <p class="klein">Meldungen von maplibre, die neuesten zuletzt:</p>
        <ul class="meldungen">
          {#each kachel.meldungen as m}<li>{m}</li>{/each}
        </ul>
      {/if}
    {/if}

    <!--
      Eine echte Karte, klein. Nicht ein nachgestellter Diensttest:
      Gemeldet werden soll, was die App **erlebt** — mit demselben Leaflet,
      demselben maplibre und derselben Rückfallkette. Ein eigener `fetch` auf den
      Stil würde etwas anderes messen und könnte „alles gut" sagen, während die
      Karte grau ist (etwa wenn WebGL fehlt).
    -->
    <div class="probekarte">
      <MapView
        places={probeOrte}
        center={[34.6873, 135.5259]}
        zoom={11}
        onkachelzustand={(z) => (kachel = z)}
      />
    </div>
  </div>

  <!-- ==================================================== 3) Der Abgleich -->
  <div class="block">
    <h2>Abgleich</h2>
    {#if !supabaseConfigured}
      <p class="fazit mittel">Kein Abgleich eingerichtet</p>
      <p class="klein">
        Diese Fassung wurde ohne Zugangsdaten gebaut. Der Plan liegt nur auf diesem Gerät —
        die anderen zwei Telefone sehen ihn nicht.
      </p>
    {:else}
      <p
        class="fazit"
        class:gut={sync.status === 'bereit' && !sync.offen}
        class:mittel={sync.status === 'wartet' || sync.status === 'abgemeldet' || !!sync.offen}
        class:schlecht={sync.status === 'fehler' || !!sync.verworfen}
      >
        {ABGLEICH_TEXT[sync.status] ?? sync.status}{sync.offen ? ` · ${sync.offen} offen` : ''}
      </p>
      <dl class="zahlen">
        <div><dt>angemeldet als</dt><dd>{auth.name ?? '—'}</dd></div>
        <div><dt>letzter Abgleich</dt><dd>{zeit(sync.letzterAbgleich)}</dd></div>
        <div><dt>erstmals</dt><dd>{zeit(erstabgleich)}</dd></div>
        <div><dt>offen</dt><dd>{sync.offen}</dd></div>
      </dl>
      {#if !erstabgleich}
        <p class="klein schlecht">
          Dieses Gerät hat <b>noch nie</b> abgeglichen. Was hier geplant ist, steht auf keinem
          anderen Telefon.
        </p>
      {/if}
      {#if sync.fehler}<p class="klein schlecht">Fehler: {sync.fehler}</p>{/if}
      {#if sync.verworfen}
        <p class="klein schlecht">Eine Änderung ist verloren gegangen: {sync.verworfen}</p>
      {/if}
      <p>
        <button class="btn small" disabled={!kannAbgleichen} onclick={() => void abgleichen()}>
          jetzt abgleichen
        </button>
        {#if !kannAbgleichen}
          <span class="klein">— erst anmelden, sonst tut der Knopf nichts.</span>
        {/if}
      </p>
    {/if}

    <dl class="zahlen">
      <div><dt>eingeplante Orte</dt><dd>{plandaten.orte}</dd></div>
      <div><dt>belegte Tage</dt><dd>{plandaten.tage}</dd></div>
      <div><dt>besucht</dt><dd>{plandaten.besucht}</dd></div>
      <div><dt>Ausgaben</dt><dd>{plandaten.ausgaben}</dd></div>
    </dl>
  </div>

  <!-- ==================================================== 4) Der Speicher -->
  <div class="block">
    <h2>Speicher</h2>
    <p class="fazit" class:gut={speicher.ok} class:schlecht={!speicher.ok}>
      {speicher.ok ? 'Der Plan lässt sich speichern' : 'Der Plan lässt sich NICHT speichern'}
    </p>
    {#if !speicher.ok}
      <p class="klein schlecht">
        {speicher.warum} — vermutlich ein privates Fenster. Alles, was ihr hier plant, ist
        nach dem Schließen weg. Die Seite im normalen Fenster öffnen.
      </p>
    {:else}
      <p class="klein">Geschrieben und zurückgelesen. {zahlen.vorlaeufig
          ? `${zahlen.vorlaeufig} eigene Ort(e) warten noch auf eine endgültige Nummer.`
          : ''}</p>
    {/if}
  </div>

  <!-- ============================================ 5) Grenzen dieser Seite -->
  <div class="block grenzen">
    <h2>Was diese Seite nicht weiß</h2>
    <ul>
      <li>
        <b>Die {zahlen.imBuch - (zahlen.geprueft - zahlen.eigen)} erledigten
        Unterkunftsvorschläge.</b> Von den {zahlen.imBuch} Nummern des Reisebands sind sie
        aus der Arbeitsliste genommen, weil die Unterkünfte gebucht sind — sie stehen in
        keiner Ansicht und werden hier deshalb auch nicht geprüft.
      </li>
      <li>
        <b>Ob eine Koordinate den richtigen Ort trifft.</b> Geprüft ist, dass sie plausibel
        liegt — im Reiserahmen und bei der passenden Station. Ob der Punkt vor dem Lokal oder
        vor dem Parkhaus daneben sitzt, sagt nur ein Blick auf die Karte.
      </li>
      <li>
        <b>In welcher Schrift die Namen dastehen.</b> Gezählt wird, <i>wie viele</i>
        Beschriftungen die Karte zeichnet — das ist seit dem Bildschirmfoto vom Telefon eine
        Messung und keine Annahme mehr. Ob dort „Kyoto" oder „京都" steht, sagt weiter nur ein
        Blick: Die Sprachfolge ist eine Einstellung, und welche Namensfelder in den Kacheln
        stehen, entscheidet der Kartendienst.
      </li>
      <li>
        <b>Ob Google die Maps-Links annimmt.</b> Die Tagesroute und die KML sind nie gegen
        Google geprüft worden — der Egress-Proxy der Entwicklungsumgebung sperrt es.
      </li>
      <li>
        <b>Ob der Abgleich gegen die echte Datenbank funktioniert.</b> Er läuft in den
        Prüfungen nur gegen eine Attrappe. Was hier „abgeglichen" sagt, ist der Zustand, den
        die App führt — kein Beweis, dass die Zeile in der Ablage steht.
      </li>
    </ul>
  </div>
</section>

<style>
  .wache {
    display: grid;
    gap: 14px;
  }

  .block {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 14px 16px;
  }

  h2 {
    font-family: var(--util);
    font-size: 0.74rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ai-40);
    margin: 0 0 8px;
  }

  /* Die eine Zeile, die man liest, wenn man es eilig hat. Deshalb groß.
     Statustoken gibt es im Projekt nicht; die Zuordnung folgt dem Hausgebrauch:
     --matcha gut, --kin Achtung, --shu Fehler. */
  .fazit {
    font-family: var(--disp);
    font-size: 1.25rem;
    line-height: 1.25;
    margin: 0 0 8px;
  }
  .fazit.gut,
  .klein.gut {
    color: var(--matcha);
  }
  .fazit.mittel {
    color: var(--kin);
  }
  .fazit.schlecht,
  .klein.schlecht {
    color: var(--shu);
  }

  .klein {
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--ai-60);
    margin: 0 0 8px;
  }

  /* ------------------------------------------------------------- Befunde */

  .befunde {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .befunde li {
    display: grid;
    gap: 3px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border-left: 4px solid var(--line);
    background: var(--washi-2);
  }
  .befunde li.fehler {
    border-left-color: var(--shu);
    background: rgba(198, 64, 43, 0.08);
  }
  .befunde li.warnung {
    border-left-color: var(--kin);
    background: rgba(166, 124, 51, 0.1);
  }

  .befunde b {
    font-family: var(--util);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ai-40);
  }
  .btitel {
    font-weight: 600;
    line-height: 1.35;
  }
  .bwas {
    font-size: 0.86rem;
    color: var(--ai-60);
    line-height: 1.45;
  }
  .befunde a {
    /* Ein eigener Platz in der Zeile, damit der Daumen ihn trifft. */
    justify-self: start;
    margin-top: 4px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }

  /* -------------------------------------------------------------- Zahlen */

  .zahlen {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px 12px;
    margin: 10px 0 0;
  }
  .zahlen div {
    border-top: 1px solid var(--line-soft);
    padding-top: 6px;
  }
  .zahlen dt {
    font-family: var(--util);
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ai-40);
  }
  .zahlen dd {
    margin: 2px 0 0;
    font-family: var(--disp);
    font-size: 1.1rem;
  }

  /* ---------------------------------------------------------- Probekarte */

  .meldungen {
    margin: 4px 0 0;
    padding-left: 18px;
    font-family: var(--util);
    font-size: 0.78rem;
    color: var(--ai-40);
    word-break: break-word;
  }

  .probekarte {
    /* Klein: Sie ist der Messfühler, nicht die Hauptsache. Groß genug, dass
       Leaflet Kacheln anfragt — unter etwa 100 px tut es das nicht. */
    height: 180px;
    margin-top: 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  /* ------------------------------------------------------------- Grenzen */

  .grenzen ul {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 8px;
  }
  .grenzen li {
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--ai-60);
  }
  .grenzen b {
    color: var(--ai);
  }
</style>
