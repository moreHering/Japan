<script lang="ts">
  /**
   * Leaflet-Karte mit nummerierten Markern.
   *
   * Die Marker tragen dieselben Nummern und Farben wie die Pins im Reiseband —
   * wer im Buch "Nr. 96" liest, findet hier denselben Punkt.
   *
   * Leaflet wird erst in onMount geladen, damit das Modul nie in einem
   * SSR-Kontext ausgewertet wird. Die Komponente wird ausschließlich mit
   * client:only eingebunden.
   */
  import { onMount } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import { CATEGORIES, istEigen, plainText, type Category, type Place } from '../lib/places';
  import { asset, maps } from '../lib/paths';
  /*
   * Beschriftungslogik und Hostauslesung stehen in `src/lib/karte.ts` und nicht
   * hier: Ohne DOM und ohne Leaflet sind sie in vitest beweisbar. Aus dieser
   * Umgebung ist kein Kachelhost erreichbar — was in der Komponente bleibt, kann
   * ich nur im Fehlerfall prüfen, was dort steht, auch im Gutfall.
   */
  import {
    ANBIETER,
    deutscheNamen,
    hostVon,
    kachelzustand,
    type Anbieter,
    type Kachelzustand,
  } from '../lib/karte';

  type Props = {
    /** Alle Orte, die die Karte kennen soll. */
    places: Place[];
    /**
     * Nummern der sichtbaren Orte. `null` heißt "kein Filter"; eine leere Liste
     * heißt "nichts anzeigen" — die Unterscheidung ist nötig, damit ein Tag ohne
     * geplante Orte eine leere Karte zeigt statt aller 164.
     */
    visible?: number[] | null;
    /** Hervorgehobener Ort. */
    selected?: number | null;
    /** Kartenmittelpunkt und Zoom beim ersten Zeichnen. */
    center?: [number, number];
    zoom?: number;
    /** Nummern, die eine Reihenfolge haben (Tagesplan) — verbindet sie mit einer Linie. */
    route?: number[];
    /** Vollbildkarte: reagiert sofort auf einen Finger, statt erst nach Antippen. */
    fullscreen?: boolean;
    onselect?: (nr: number) => void;
    /**
     * Koordinaten für einen neuen Ort abgreifen.
     *
     * Ist ein Handler gesetzt, liefert ein langer Druck (auf dem Rechner ein
     * Rechtsklick) die Stelle. `pickMode` macht daraus einen einfachen Tipp —
     * der lange Druck ist auf dem Handy nicht auffindbar, wenn man ihn nicht
     * kennt, deshalb gibt es zusätzlich den ausdrücklichen Modus.
     */
    onpick?: (lat: number, lng: number) => void;
    pickMode?: boolean;
    /** Vorschau-Pin während des Erfassens. */
    pin?: { lat: number; lng: number } | null;
    /**
     * Freie Linie aus Koordinaten — für Routen, deren Punkte keine Orte sind.
     *
     * `route` kann das nicht: Es schlägt jede Nummer in `places` nach. Die
     * Stationsmittelpunkte der Reise sind keine Orte und haben keine Nummer,
     * also gibt es dort nichts nachzuschlagen.
     */
    linie?: { punkte: [number, number][]; farbe?: string } | null;
    /**
     * Eigene Marker mit eigenem Popup. Unabhängig von `places`.
     *
     * Nötig, weil die Orts-Marker in einer `Map<number, …>` liegen — einer je
     * Ortsnummer. Mehrere Tagebuchbeiträge am selben Ort sind aber mehrere
     * Marken. Dazu hängt `baueMarker()` unbedingt das Reiseführer-Popup an;
     * hier bestimmt der Aufrufer den Inhalt.
     *
     * `popup` ist fertiges HTML und wird hier **nicht** maskiert, siehe
     * `applyMarken()`.
     */
    marken?: { lat: number; lng: number; text: string; farbe: string; popup?: string }[];
    /**
     * Meldet den Zustand des Kartenhintergrunds nach außen — für `/wache/`.
     *
     * Der Grund, warum das nötig ist: Zwei der drei Fälle sind im Kartenbild
     * **stumm**. Ob die deutsche Vektorkarte läuft oder der japanisch beschriftete
     * Rasterrückfall, sieht man der App nicht an — sichtbar wird nur der dritte
     * Fall, wenn gar kein Hintergrund kommt. Für die Selbstprüfseite ist genau der
     * Unterschied zwischen den ersten beiden die Auskunft: „Vektorkarte, deutsch"
     * gegen „Rasterrückfall — japanisch, weil WebGL fehlt".
     *
     * Rein additiv: Ohne diese Prop verhält sich die Komponente wie vorher.
     */
    onkachelzustand?: (z: Kachelzustand) => void;
    /**
     * Zeigt den Umschalter zwischen lateinischer Vektorkarte und OSM-Raster.
     *
     * Nur dort, wo die Karte groß genug ist, dass ein Knopf nicht stört — also
     * auf `/orte/`. Die Probekarte auf `/wache/` ist 180 px hoch, die im
     * Tagesplan 300; dort wäre er im Weg.
     *
     * Warum es ihn überhaupt gibt: Der Rasterrückfall war eine Einbahnstraße.
     * Fiel die Vektorquelle einmal aus, blieb die Karte japanisch beschriftet,
     * bis jemand die Seite neu lud — und dass Neuladen hilft, muss man erst
     * einmal wissen.
     */
    kartenwahl?: boolean;
  };


  let {
    places,
    visible = null,
    selected = null,
    center = [36.2, 137.5],
    zoom = 6,
    route = [],
    fullscreen = false,
    onselect,
    onpick,
    pickMode = false,
    pin = null,
    linie = null,
    marken = [],
    onkachelzustand,
    kartenwahl = false,
  }: Props = $props();

  let host: HTMLDivElement;
  let map: any = null;
  let L: any = null;
  let markers = new Map<number, any>();
  let routeLine: any = null;
  let pinMarker: any = null;
  // Freie Marken als Liste, nicht als Map: Zwei Beiträge am selben Ort haben
  // keinen unterscheidenden Schlüssel, unter dem sie in einer Map lägen.
  let linienZug: any = null;
  let markenLayer: any[] = [];
  let ready = $state(false);
  /** Hält Leaflets Größen-Cache aktuell. Begründung an der Anlagestelle in `onMount`. */
  let groessenWaechter: ResizeObserver | null = null;
  /**
   * Die Komponente ist abgeräumt.
   *
   * Auf Komponentenebene und nicht nur in `onMount`, weil die Anbieterkette
   * mehrere Sekunden läuft und zwischendurch prüfen muss, ob sie noch gebraucht
   * wird — sonst hängt sie Ebenen an eine Karte, die es nicht mehr gibt.
   */
  let disposed = false;

  /*
   * Die Kartenart als Gerätevorliebe.
   *
   * Nicht im Plan-Store: Der gehört der Reise und wird zwischen den drei
   * Telefonen abgeglichen. Ob auf **diesem** Gerät die Vektorkarte läuft, ist
   * eine Eigenschaft dieses Geräts und seiner Verbindung — es wäre störend, wenn
   * eine Notumstellung unterwegs auf den anderen beiden landete.
   *
   * `'auto'` heißt: Vektor versuchen, bei Ausfall Raster. `'raster'` heißt:
   * gar nicht erst versuchen — das spart die 273 KB gzip von maplibre und
   * bringt bei magerer Verbindung schneller ein Bild.
   */
  const ARTSCHLUESSEL = 'japan2026:kartenart';
  type Kartenart = 'auto' | 'raster';
  function gemerkteArt(): Kartenart {
    try {
      return localStorage.getItem(ARTSCHLUESSEL) === 'raster' ? 'raster' : 'auto';
    } catch {
      // Privates Fenster: Dann gilt die Vorgabe. Ein Wurf hier dürfte nie die
      // Karte verhindern.
      return 'auto';
    }
  }
  function merkeArt(a: Kartenart) {
    try {
      localStorage.setItem(ARTSCHLUESSEL, a);
    } catch {
      /* siehe oben */
    }
  }
  let kartenart = $state<Kartenart>('auto');
  /** Wann zuletzt eine Vektorkarte versucht wurde — gegen Dauerversuche. */
  let letzterVersuch = 0;
  /**
   * Mindestabstand zwischen zwei selbsttätigen Versuchen.
   *
   * Eine halbe Minute: lang genug, dass ein Hin und Her zwischen Liste und Karte
   * nicht jedes Mal den 273-KB-Brocken und einen Stilabruf auslöst, kurz genug,
   * dass man nach einer Funklochfahrt nicht ewig auf der Notkarte sitzt.
   */
  const VERSUCHSPAUSE = 30_000;

  /**
   * Was mit dem Kartenhintergrund gerade los ist.
   *
   * Der Grund, warum es diesen Zustand gibt: Vorher hing hier ein `L.tileLayer`
   * ohne `tileerror`-Zweig. Wenn Kacheln ausblieben, passierte **nichts** — kein
   * Hinweis, kein Wiederholen, nur die Hintergrundfarbe des Containers. Eine
   * Karte, die nicht sagt, dass ihr der Untergrund fehlt, ist von einer kaputten
   * Karte nicht zu unterscheiden, und genau so ist sie auf dem Telefon
   * angekommen.
   */
  let grund = $state<Kachelzustand>(kachelzustand('vektor'));
  /*
   * Der Melder nach außen.
   *
   * **Ein `$effect` über `grund` und nicht sechs Aufrufe an den sechs
   * Zuweisungsstellen** (115, 137, 153, 156, 208, 225). Der Unterschied ist nicht
   * Geschmack: Eine vergessene Zuweisung wäre ein Melder, der im seltensten Fall
   * schweigt — und das ist der Fall, in dem man ihn braucht. Ein Effekt kann nichts
   * vergessen, weil er an der Variablen hängt und nicht an ihren Schreibstellen.
   *
   * Svelte ruft ihn auch beim ersten Lauf, die Seite erfährt also den Startzustand
   * („vektor") und nicht erst die erste Änderung.
   */
  $effect(() => {
    onkachelzustand?.({ ...grund, meldungen: [...grund.meldungen] });
  });

  let rasterEbene: any = null;
  let vektorEbene: any = null;

  // Die Adressen stehen in `ANBIETER` (src/lib/karte.ts) — an einer Stelle,
  // weil sie auch die Prüfungen und `/wache/` betreffen.
  /**
   * Rasterkarte als Rückfall. Sichtbar, aber japanisch beschriftet.
   *
   * Die gemessenen Zahlen und die Meldungen werden **mitgenommen**: Sie sind der
   * Grund für den Rückfall, und ein Rückfall, der seinen Grund verliert, ist auf
   * `/wache/` nicht mehr von einem gewöhnlichen zu unterscheiden.
   */
  function rasterAnhaengen(warum: string, anbieter?: Anbieter) {
    const wer = anbieter ?? (ANBIETER.find((a) => a.art === 'raster') as Anbieter);
    const mitnehmen = {
      anbieter: wer.name,
      meldungen: grund.meldungen,
      gezeichnet: grund.gezeichnet,
      beschriftet: grund.beschriftet,
    };
    rasterEbene = L.tileLayer(wer.kacheln as string, {
      maxZoom: 19,
      // `maxNativeZoom` fehlte: Jenseits von 19 holte Leaflet Kacheln, die es
      // nicht gibt, und ein 404 ist von „kein Netz" nicht zu unterscheiden —
      // wieder grau. Mit dieser Grenze skaliert Leaflet die letzte vorhandene.
      maxNativeZoom: 19,
      attribution: wer.attribution,
    });
    // Erst die Zweige, dann anhängen — sonst entgeht der erste Fehlschlag.
    rasterEbene.on('tileerror', () => {
      grund = { ...kachelzustand('fehler', hostVon(wer.kacheln as string), warum), ...mitnehmen };
    });
    /*
     * `tileload` und **nicht** `load`.
     *
     * Gemessen, nicht vermutet: Leaflets `load` feuert, wenn keine Kachel mehr
     * *lädt* — auch dann, wenn jede einzelne gescheitert ist. Eine erste Fassung
     * hat damit den Hinweis zurückgesetzt, den `tileerror` einen Moment vorher
     * gesetzt hatte, und die Karte war wieder stumm grau. Die Spur im Browser
     * zeigte genau das: `tileerror gefeuert`, danach `load gefeuert, grund war
     * fehler`.
     *
     * `tileload` feuert je Kachel, die wirklich angekommen ist. Genau das ist die
     * Bedingung, unter der der Hinweis verschwinden darf.
     */
    rasterEbene.on('tileload', () => {
      if (grund.art === 'fehler') {
        grund = { ...kachelzustand('raster', '', warum), ...mitnehmen };
      }
    });
    rasterEbene.addTo(map);
    grund = { ...kachelzustand('raster', '', warum), ...mitnehmen };
  }

  /**
   * Grundkarte aufbauen: erst Vektor mit deutscher Beschriftung, bei jedem
   * Fehlschlag Raster.
   *
   * Drei Dinge können den Vektoruntergrund verhindern — kein WebGL, der Stil lädt
   * nicht, der Dienst ist aus. OpenFreeMap ist kostenlos und gibt keine Zusage;
   * für eine Reise, auf der die Karte zählt, wäre ein einzelner Anbieter ohne
   * Rückfall die falsche Wahl.
   */
  /**
   * Der Anbieter, der zuletzt wirklich gezeichnet hat.
   *
   * Gemerkt, damit der nächste Aufruf nicht wieder bei einem Dienst anfängt, der
   * gerade nicht liefert. Unterwegs zählt die erste Sekunde, nicht die Ordnung
   * der Liste.
   */
  const ANBIETERSCHLUESSEL = 'japan2026:kartenanbieter';
  function gemerkterAnbieter(): string | null {
    try {
      return localStorage.getItem(ANBIETERSCHLUESSEL);
    } catch {
      return null;
    }
  }
  function merkeAnbieter(id: string) {
    try {
      localStorage.setItem(ANBIETERSCHLUESSEL, id);
    } catch {
      /* privates Fenster */
    }
  }
  /** Die Anbieterliste, den zuletzt erfolgreichen vorangestellt. */
  function anbieterReihe(): Anbieter[] {
    const bevorzugt = gemerkterAnbieter();
    const i = ANBIETER.findIndex((a) => a.id === bevorzugt);
    if (i <= 0) return [...ANBIETER];
    return [ANBIETER[i], ...ANBIETER.filter((_, j) => j !== i)];
  }

  /**
   * Wie lange ein einzelner Anbieter Zeit bekommt, bevor der nächste drankommt.
   *
   * Zehn Sekunden: lang genug für eine magere Mobilverbindung, kurz genug, dass
   * eine Kette aus zwei Vektorversuchen plus Rasterrückfall nicht zur Geduldsprobe
   * wird. Ein Anbieter, der einen Fehler meldet, fällt sofort durch und wartet
   * die Frist gar nicht erst ab.
   */
  const PROBEFRIST = 10_000;

  /**
   * Was bei einem Vektorversuch herauskam.
   *
   * `warum === null` heißt bestanden. Alles andere ist der Grund, der auf
   * `/wache/` steht — und der Grund, warum der nächste Anbieter drankommt.
   */
  type Versuch = { warum: string | null; gezeichnet: number; beschriftet: number };

  /**
   * Einen Vektoranbieter anhängen und **nachmessen**, ob er wirklich zeichnet.
   *
   * Das Nachmessen ist der ganze Punkt. `isSourceLoaded()` taugt nicht: Es gibt
   * `true` zurück, wenn die Quelle **gescheitert** ist (maplibre-gl,
   * `tile/tile_manager.ts:155-157`), und eine 404-Kachel gilt als geladen
   * (`source/vector_tile_source.ts:253-256`). Ein Dienst, der auf alles mit 404
   * antwortet, ist von einem funktionierenden nur daran zu unterscheiden, dass
   * nichts auf dem Schirm steht.
   */
  async function vektorVersuch(a: Anbieter): Promise<Versuch> {
    const durchgefallen = (warum: string, gezeichnet = -1, beschriftet = -1): Versuch => {
      // Die Probe war erfolglos — die Ebene verschwindet vollständig, nicht nur
      // optisch. Eine durchsichtige Ebene, die liegen bleibt, fängt weiter
      // Berührungen ab.
      if (vektorEbene) {
        try {
          map.removeLayer(vektorEbene);
        } catch {
          /* schon abgeräumt */
        }
        vektorEbene = null;
      }
      return { warum, gezeichnet, beschriftet };
    };

    let fehlerTexte: string[] = [];
    try {
      /*
       * Stil und Paket **gleichzeitig** holen, nicht nacheinander: Der
       * maplibre-Brocken ist 273 KB gzip, und ihn erst nach dem Stil anzufordern
       * kostet unterwegs eine volle Rundreise Wartezeit, bevor der Download
       * überhaupt beginnt.
       */
      const quelle = a.vonHier ? asset(a.stil as string) : (a.stil as string);
      const [antwort] = await Promise.all([
        fetch(quelle),
        import('maplibre-gl'),
        import('@maplibre/maplibre-gl-leaflet'),
      ]);
      if (disposed) return durchgefallen('abgebrochen');
      if (!antwort.ok) return durchgefallen(`Stil ${antwort.status}`);
      const stil = deutscheNamen(await antwort.json());

      /*
       * Welche Quellen des Stils Vektorkacheln liefern.
       *
       * Der Liberty-Stil hat **zwei**: ein Natural-Earth-Raster mit inline
       * stehenden Kachel-URLs und die eigentliche Vektorquelle. Genau diese
       * Trennung war das Fehlerbild — das Raster kam an und sah aus wie eine
       * Karte, während die Vektorquelle schwieg.
       */
      const vektorQuellen = new Set(
        Object.entries((stil as { sources?: Record<string, { type?: string }> }).sources ?? {})
          .filter(([, q]) => q?.type === 'vector')
          .map(([id]) => id),
      );

      vektorEbene = (L as any).maplibreGL({ style: stil, attribution: a.attribution });
      vektorEbene.addTo(map);
      /*
       * **Unsichtbar, bis er sich bewiesen hat.**
       *
       * Die Vektorebene liegt in derselben Ebene wie die Rasterkacheln und würde
       * sie verdecken — samt ihrer eigenen leeren Hintergrundfarbe. Genau so kam
       * am 21.09.2026 eine **weiße Karte** auf dem Telefon an: Ein Anbieter, der
       * nichts zeichnet, hat trotzdem alles zugedeckt. Während der Probe bleibt
       * er deshalb durchsichtig; sichtbar wird er erst, wenn die Messung steht.
       */
      const behaelter = vektorEbene.getContainer?.();
      if (behaelter) behaelter.style.opacity = '0';

      const glKarte = vektorEbene.getMaplibreMap?.();
      if (!glKarte) return durchgefallen('keine maplibre-Instanz');
      /*
       * Jede Meldung wird mitgeschrieben, nicht nur die erste — die späteren
       * sind oft die aussagekräftigen. Abgeworfen wird hier **nicht**: Darüber
       * entscheidet die Kette, sonst räumt ein Handler mitten im Versuch auf.
       */
      glKarte.on('error', (e: any) => {
        const text = `${e?.sourceId ? `${e.sourceId}: ` : ''}${e?.error?.message ?? 'Fehler'}`;
        fehlerTexte = [...fehlerTexte, text].slice(-5);
        grund = { ...grund, meldungen: [...grund.meldungen, `${a.name}: ${text}`].slice(-5) };
      });

      /*
       * Warten, bis gemessen werden **darf** — und im Zweifel nicht urteilen.
       *
       * Zwei Fallen stecken hier, und die erste Fassung ist in beide getappt:
       *
       * 1. Symbolebenen kommen erst in den Merkmalsindex, wenn maplibre seine
       *    Platzierung festgeschrieben hat. Zu früh gefragt meldet
       *    `queryRenderedFeatures` **null** Beschriftungen, obwohl alle Kacheln
       *    da sind.
       * 2. `loaded()` wird nie wahr, solange irgendeine Quelle noch lädt. Wer
       *    daraus „durchgefallen" macht, wirft bei einer mageren Verbindung
       *    einen Anbieter weg, der gleich geliefert hätte. Gemessen in der
       *    Entwicklungsumgebung: Dort arbeitet maplibres Worker nicht, `loaded()`
       *    bleibt dauerhaft falsch — und ein **gültiger** Stil fiel durch.
       *
       * Deshalb gilt: **Verworfen wird nur bei Beweis, nicht bei fehlendem
       * Beweis.** Ein Anbieter scheitert, wenn er einen Fehler meldet oder wenn
       * nachweislich kein einziges Merkmal seiner Vektorquelle gezeichnet wurde.
       * Alles andere bleibt stehen — eine langsame Karte ist besser als ein
       * Wechsel weg von einer, die gleich da ist.
       */
      const bis = Date.now() + PROBEFRIST;
      while (Date.now() < bis) {
        if (disposed) return durchgefallen('abgebrochen');
        if (fehlerTexte.length) return durchgefallen(fehlerTexte[0]);
        if (glKarte.loaded?.()) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!glKarte.loaded?.()) {
        /*
         * Nicht fertig geworden — und damit **durchgefallen**.
         *
         * Gestern stand hier „im Zweifel behalten", damit eine magere Verbindung
         * keinen funktionierenden Anbieter verliert. Das Ergebnis war eine weiße
         * Karte: Wer nichts beweist, deckt trotzdem alles zu. Streng sein kostet
         * hier nichts mehr, weil die Rasterkarte schon darunter liegt und
         * liegen bleibt — schlimmstenfalls bleibt es bei ihr.
         */
        return durchgefallen(`antwortet seit ${Math.round(PROBEFRIST / 1000)} s nicht`);
      }

      let alle: any[];
      try {
        // **Ohne Ebenenliste.** Eine unbekannte Ebenen-ID lässt maplibre ein
        // Fehlerereignis feuern, und das wäre eine Messung, die ihr eigenes
        // Messobjekt beschädigt.
        alle = glKarte.queryRenderedFeatures();
      } catch {
        // Nicht messbar heißt nicht beweisbar, und ohne Beweis kein Wechsel —
        // die Rasterkarte darunter ist das sichere Ergebnis.
        return durchgefallen('nicht messbar');
      }
      /*
       * Nur Symbolebenen, **die auch Text tragen**. Eine reine Piktogrammebene
       * ist ebenfalls vom Typ `symbol`; zählte man sie mit, hieße „ein paar
       * Zeichen ohne einen einzigen Buchstaben" fälschlich „beschriftet".
       */
      const symbolEbenen = new Set(
        ((glKarte.getStyle()?.layers ?? []) as {
          id: string;
          type: string;
          layout?: Record<string, unknown>;
        }[])
          .filter((l) => l.type === 'symbol' && l.layout?.['text-field'] !== undefined)
          .map((l) => l.id),
      );
      const gezeichnet = alle.length;
      // Ohne festgeschriebene Platzierung ist die Beschriftungszahl bedeutungslos
      // — dann lieber −1 („nicht gemessen") als eine Null, die nach Ausfall aussieht.
      const beschriftet = glKarte.style?.placement
        ? alle.filter((f) => symbolEbenen.has(f?.layer?.id)).length
        : -1;

      if (vektorQuellen.size && !alle.some((f) => vektorQuellen.has(f?.source))) {
        return durchgefallen('liefert keine Kartendaten', gezeichnet, beschriftet);
      }
      return { warum: null, gezeichnet, beschriftet };
    } catch (e) {
      return durchgefallen((e as Error).message);
    }
  }

  /**
   * Grundkarte aufbauen: die Anbieter der Reihe nach, bis einer nachweislich
   * zeichnet.
   *
   * Kein `console.error` irgendwo darin — ein Anbieterwechsel ist der geplante
   * Weg und keine Panne.
   */
  async function grundkarte() {
    letzterVersuch = Date.now();

    /*
     * **Zuerst eine Karte, die da ist — und dann erst die schönere.**
     *
     * Das ist die Lehre aus dem 21.09.2026. Vorher lief die Anbieterkette, und
     * solange sie lief, war die Fläche leer; blieb sie erfolglos, blieb sie leer.
     * Eine Reiseapp, die eine halbe Minute nichts zeigt und im schlechten Fall
     * gar nichts, ist unterwegs wertlos.
     *
     * Jetzt hängt die OSM-Rasterkarte **sofort** unten drin. Sie ist japanisch
     * beschriftet, aber sie kommt an — das ist auf dem Gerät gemessen. Die
     * lateinischen Vektoranbieter werden darüber geprüft und nur dann
     * eingewechselt, wenn sie nachweislich zeichnen. Der schlechteste Fall ist
     * damit nicht mehr „weiß", sondern „japanisch".
     */
    const osm = ANBIETER.find((a) => a.art === 'raster') as Anbieter;
    rasterAnhaengen(
      kartenart === 'raster' ? 'OSM-Karte ausgewählt' : 'Grundkarte, bis eine lateinische steht',
      osm,
    );
    if (kartenart === 'raster') return;

    for (const a of anbieterReihe()) {
      if (disposed) return;
      if (a.art !== 'vektor') continue;
      const versuch = await vektorVersuch(a);
      if (!versuch.warum) {
        // Bewiesen: Die Vektorebene wird sichtbar, die Rasterkarte darunter
        // verschwindet. Erst jetzt — vorher wäre die Fläche kurz leer.
        vektorEbene?.getContainer?.()?.style?.setProperty('opacity', '1');
        if (rasterEbene) {
          map.removeLayer(rasterEbene);
          rasterEbene = null;
        }
        grund = {
          ...grund,
          art: 'vektor',
          host: '',
          warum: '',
          anbieter: a.name,
          gezeichnet: versuch.gezeichnet,
          beschriftet: versuch.beschriftet,
        };
        merkeAnbieter(a.id);
        return;
      }
      grund = {
        ...grund,
        meldungen: [...grund.meldungen, `${a.name}: ${versuch.warum}`].slice(-5),
      };
    }

    // Keiner hat sich bewiesen — die Rasterkarte von oben bleibt einfach liegen.
    grund = { ...grund, warum: 'Keine lateinische Karte erreichbar, OSM-Karte bleibt' };
  }

  /**
   * Zwischen lateinischer Vektorkarte und OSM-Raster umschalten.
   *
   * Die Wahl wird gemerkt, und zwar in beide Richtungen: Wer unterwegs auf die
   * OSM-Karte geht, weil die Vektorkarte hakt, will nicht bei jedem Seitenwechsel
   * wieder zwölf Sekunden auf den Rückfall warten.
   */
  async function artWaehlen(a: Kartenart) {
    kartenart = a;
    merkeArt(a);
    await nochmal();
  }

  /** Von Hand noch einmal versuchen, wenn das Netz zurück ist. */
  async function nochmal() {
    if (rasterEbene) {
      map.removeLayer(rasterEbene);
      rasterEbene = null;
    }
    if (vektorEbene) {
      map.removeLayer(vektorEbene);
      vektorEbene = null;
    }
    grund = kachelzustand('vektor');
    await grundkarte();
  }

  const colorOf = (cat: Category) => CATEGORIES.find((c) => c.key === cat)!.color;

  /**
   * HTML-Maskierung für die Schnipsel, die als `divIcon`-Markup in die Karte
   * gehen. Leaflet nimmt für ein `divIcon` nur HTML, keinen Textknoten — ohne
   * das hier würde ein Anführungszeichen in `farbe` oder `text` das
   * style-Attribut schließen und der Rest als Markup gelten.
   *
   * Das Apostroph ist mit dabei, obwohl die Vorlage unten doppelte
   * Anführungszeichen benutzt: Sonst hängt die Dichtheit der Funktion daran,
   * welche Anführungszeichen jemand später in der Vorlage schreibt. Vier Zeichen
   * mehr, dafür trägt sie unabhängig davon. Numerisch als `&#39;`, weil `&apos;`
   * erst HTML5 kennt — gleiche Wahl wie in `escape()` in `src/lib/tagebuch.ts`.
   */
  const maskiere = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  /**
   * Marker als nummerierter Kreis. Orte, die auf genau derselben Koordinate
   * liegen (Nr. 95/96), werden minimal versetzt, sonst verdeckt einer den anderen.
   */
  function iconFor(place: Place) {
    // Ein Ort ohne endgültige Nummer zeigt keine an — eine negative Zahl wäre
    // schlicht falsch, und "neu" ist die Wahrheit.
    const eigen = istEigen(place);
    const text = eigen && place.vorlaeufig ? 'neu' : String(place.nr);
    const size = text.length > 2 ? 30 : 26;
    return L.divIcon({
      className: eigen ? 'jp-marker jp-eigen' : 'jp-marker',
      html: `<span style="background:${colorOf(place.category)}">${text}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -(size / 2)],
    });
  }

  function offsetOf(place: Place): [number, number] {
    if (!place.sameSpotAs?.length) return [place.lat, place.lng];
    // Reihenfolge innerhalb der Gruppe bestimmt die Richtung des Versatzes.
    const group = [place.nr, ...place.sameSpotAs].sort((a, b) => a - b);
    const i = group.indexOf(place.nr);
    const step = 0.00016;
    return [place.lat + (i === 0 ? step : -step), place.lng + (i === 0 ? -step : step)];
  }

  function popupHtml(place: Place) {
    const cat = CATEGORIES.find((c) => c.key === place.category)!;
    const eigen = istEigen(place);
    const flags = [
      eigen ? (place.vorlaeufig ? 'selbst ergänzt — Nummer folgt' : 'selbst ergänzt') : '',
      place.isFriendTip ? '★ Freundestipp' : '',
      place.book ? `📖 Reiseführer ${place.book} · ${place.bookTitle}` : '',
      place.closedDay ? `${place.closedDay}. geschlossen` : '',
      place.needsBooking ? 'Reservierung' : '',
      place.cashOnly ? 'nur Bargeld' : '',
    ].filter(Boolean);

    return `
      <div class="jp-popup">
        <div class="jp-popup-head">
          <span class="jp-popup-nr" style="background:${cat.color}">${
            eigen && place.vorlaeufig ? 'neu' : place.nr
          }</span>
          <strong>${place.name}</strong>
        </div>
        <div class="jp-popup-cat">${cat.label} · ${place.stationLabel}</div>
        <p>${plainText(place.descriptionHtml).slice(0, 260)}</p>
        ${flags.length ? `<div class="jp-popup-flags">${flags.join(' · ')}</div>` : ''}
        <a href="${maps(place)}" target="_blank" rel="noopener">In Google Maps öffnen</a>
      </div>`;
  }

  onMount(() => {
    disposed = false;

    (async () => {
      const leaflet = await import('leaflet');
      if (disposed) return;
      L = leaflet.default ?? leaflet;

      map = L.map(host, {
        center,
        zoom,
        dragging: true,
        tap: false,
        // Auf dem Handy wird mit zwei Fingern gezoomt; die Knöpfe verdecken
        // dort nur Karte.
        zoomControl: !L.Browser.mobile,
      });

      /*
       * Die Größe der Karte im Auge behalten — der Fehler, der auf dem Telefon
       * alle 141 Marker in die linke obere Ecke geschoben hat.
       *
       * Gemessen, nicht vermutet: `/orte/` startet auf dem Reiter „Liste", und
       * `.split[data-view='liste'] .mapwrap` steht dort auf `display: none`.
       * Die Karte entsteht trotzdem — ihr Markup steht unbedingt da, ohne
       * `{#if}`. Leaflet merkt sich die Größe beim ersten `getSize()` und löst
       * den Cache nur bei `invalidateSize()` oder einem `window`-`resize`; ein
       * Reiterwechsel per CSS ist keines von beidem. Bei Größe 0 zieht Leaflet
       * beim Pixelursprung keinen halben Viewport ab, und alles rutscht um
       * 191/325 px nach links oben auf einen Haufen. Dazu fällt maplibre für
       * seine Leinwand auf 400 × 300 px zurück — das war die zu kleine gemalte
       * Fläche im Kartenrahmen.
       *
       * Warum ein Beobachter und nicht ein Aufruf beim Reiterwechsel: Der
       * Reiterwechsel ist nur *ein* Weg zu einer neuen Größe. Die anderen sind
       * das Drehen des Telefons, die ein- und ausfahrende Browserleiste
       * (`--app-h` hängt an `100dvh`) und das Erfassungsformular. Ein Aufruf an
       * einer Stelle fängt eine Ursache, ein Beobachter fängt alle — und er
       * steht hier in `MapView` und nicht im Ortsbrowser, damit alle vier
       * Karten der App ihn haben.
       *
       * Größe 0 wird übersprungen: Sonst friert der Cache wieder auf 0 ein,
       * sobald die Karte weggeblendet wird.
       */
      let warVerborgen = false;
      groessenWaechter = new ResizeObserver((eintraege) => {
        for (const eintrag of eintraege) {
          const { width, height } = eintrag.contentRect;
          if (width <= 0 || height <= 0) {
            warVerborgen = true;
            continue;
          }
          map?.invalidateSize();

          /*
           * Beim Wiedersichtbarwerden die Vektorkarte noch einmal versuchen.
           *
           * Der Grund: OpenFreeMap betreibt zwei Server im Round-Robin. Ein
           * Ausfall kann den einen treffen und den anderen nicht — dann hilft
           * schon der nächste Versuch. Ohne das bliebe die Karte bis zum
           * Neuladen japanisch beschriftet, und dass Neuladen hilft, muss man
           * erst einmal wissen.
           *
           * Drei Bedingungen, damit daraus kein Dauerversuch wird: Der Container
           * war wirklich verborgen (ein Reiterwechsel, nicht die ein- und
           * ausfahrende Browserleiste), wir sind auf dem Rückfall gelandet statt
           * ihn gewählt zu haben, und der letzte Versuch ist eine Weile her.
           */
          if (
            warVerborgen &&
            kartenart === 'auto' &&
            grund.art !== 'vektor' &&
            Date.now() - letzterVersuch > VERSUCHSPAUSE
          ) {
            warVerborgen = false;
            void nochmal();
          }
          warVerborgen = false;
        }
      });
      groessenWaechter.observe(host);

      // Erst die gemerkte Wahl, dann die Karte — sonst lädt bei „Raster
      // ausgewählt" trotzdem einmal maplibre, und genau das soll sie sparen.
      kartenart = gemerkteArt();

      /*
       * Die Grundkarte läuft **nebenher**, ohne `await`.
       *
       * Seit sie mehrere Anbieter durchprobiert, kann sie zwanzig Sekunden
       * brauchen. Marker, Popups, Antippen und der lange Druck hängen an nichts
       * davon — sie warten nur auf `map`, und das steht schon. Eine Karte, die
       * erst nach zwanzig Sekunden auf einen Finger reagiert, ist unterwegs
       * unbrauchbar; gefunden hat es die Prüfung, die nach 700 ms keinen
       * einzigen Marker mehr fand.
       */
      void grundkarte();

      /*
       * Eingebettete Karten (Tagesplan, Ortsbrowser) dürfen den Seitenscroll
       * nicht schlucken: Dort bleibt der erste Finger für die Seite, bis die
       * Karte einmal angetippt wurde. Eine Vollbildkarte braucht das nicht.
       */
      if (L.Browser.mobile && !fullscreen) {
        map.dragging.disable();
        const enable = () => {
          map.dragging.enable();
          host.classList.remove('locked');
        };
        host.classList.add('locked');
        host.addEventListener('click', enable, { once: true });
        host.addEventListener('touchstart', (e) => {
          if (e.touches.length > 1) enable();   // zwei Finger = bewusste Geste
        }, { passive: true });
      }

      /*
       * Koordinaten abgreifen — bewusst am Container statt über Leaflets
       * `click`:
       *
       * Gemessen, nicht vermutet: Leaflets `click` erreicht bei einem
       * Fingertipp den Handler nicht (mit `tap: false` verlässt sich Leaflet auf
       * den nativen Klick und unterdrückt ihn nach Berührungen). Am Container
       * kommt er verlässlich an, bei Maus und Finger gleichermaßen. Die
       * Umrechnung in Koordinaten macht Leaflet trotzdem.
       */
      const zuKoordinate = (clientX: number, clientY: number) => {
        const r = host.getBoundingClientRect();
        const ll = map.containerPointToLatLng(L.point(clientX - r.left, clientY - r.top));
        onpick?.(ll.lat, ll.lng);
      };

      host.addEventListener(
        'click',
        (e: MouseEvent) => {
          if (pickMode) zuKoordinate(e.clientX, e.clientY);
        },
        true,
      );

      // Rechtsklick am Rechner.
      map.on('contextmenu', (e: any) => {
        onpick?.(e.latlng.lat, e.latlng.lng);
      });

      /*
       * Langer Druck auf dem Handy. Auch das selbst gebaut: iOS erzeugt bei
       * einem langen Druck kein `contextmenu`, und Leaflets alter Tap-Handler
       * greift auf heutigen Geräten nicht mehr. Abgebrochen wird, sobald der
       * Finger wandert — sonst löst jedes Verschieben der Karte aus.
       */
      let druck: ReturnType<typeof setTimeout> | undefined;
      let start: { x: number; y: number } | null = null;

      host.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
          if (!onpick || e.touches.length !== 1) return;
          const t = e.touches[0];
          start = { x: t.clientX, y: t.clientY };
          clearTimeout(druck);
          druck = setTimeout(() => {
            if (!start) return;
            zuKoordinate(start.x, start.y);
            start = null;
          }, 550);
        },
        { passive: true },
      );

      const druckAbbrechen = (e?: TouchEvent) => {
        if (e && start && e.touches.length === 1) {
          const t = e.touches[0];
          // Kleine Wackler sind kein Verschieben.
          if (Math.abs(t.clientX - start.x) < 12 && Math.abs(t.clientY - start.y) < 12) return;
        }
        clearTimeout(druck);
        start = null;
      };

      host.addEventListener('touchmove', druckAbbrechen, { passive: true });
      host.addEventListener('touchend', () => druckAbbrechen(), { passive: true });
      host.addEventListener('touchcancel', () => druckAbbrechen(), { passive: true });

      baueMarker();
      applyMarken();
      ready = true;
      applyVisible();
      applyRoute();
      applyLinie();
      applySelected();
      applyPin();
    })();

    return () => {
      disposed = true;
      groessenWaechter?.disconnect();
      groessenWaechter = null;
      map?.remove();
      map = null;
      markers.clear();
      // `map.remove()` nimmt die Ebenen mit; die Listen hier halten sonst
      // Marker fest, die an einer nicht mehr existierenden Karte hängen.
      markenLayer = [];
      linienZug = null;
    };
  });

  /**
   * Marker zur Ortsliste aufbauen. Läuft erneut, wenn Orte dazukommen oder
   * sich ändern — eigene Orte entstehen erst zur Laufzeit.
   */
  function baueMarker() {
    if (!map || !L) return;
    const gewuenscht = new Set(places.map((p) => p.nr));

    for (const [nr, marker] of markers) {
      if (gewuenscht.has(nr)) continue;
      if (map.hasLayer(marker)) map.removeLayer(marker);
      markers.delete(nr);
    }

    for (const place of places) {
      const vorhanden = markers.get(place.nr);
      if (vorhanden) {
        // Name, Kategorie oder Koordinate können sich geändert haben.
        vorhanden.setLatLng(offsetOf(place));
        vorhanden.setIcon(iconFor(place));
        vorhanden.setPopupContent(popupHtml(place));
        continue;
      }
      const marker = L.marker(offsetOf(place), {
        icon: iconFor(place),
        title: `${place.nr} · ${place.name}`,
        riseOnHover: true,
      });
      marker.bindPopup(popupHtml(place), { maxWidth: 300, minWidth: 220 });
      marker.on('click', () => onselect?.(place.nr));
      markers.set(place.nr, marker);
    }
  }

  /** Vorschau-Pin für einen Ort, der gerade erfasst wird. */
  function applyPin() {
    if (!map || !L) return;
    if (pinMarker) {
      map.removeLayer(pinMarker);
      pinMarker = null;
    }
    if (!pin) return;
    pinMarker = L.marker([pin.lat, pin.lng], {
      icon: L.divIcon({
        className: 'jp-pin-neu',
        html: '<span>+</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
      zIndexOffset: 1000,
      interactive: false,
    }).addTo(map);
  }

  /** Nur die Marker anzeigen, die aktuell gefiltert sind. */
  function applyVisible() {
    if (!map) return;
    const show = visible === null ? null : new Set(visible);
    for (const [nr, marker] of markers) {
      const wanted = show === null || show.has(nr);
      const on = map.hasLayer(marker);
      if (wanted && !on) marker.addTo(map);
      else if (!wanted && on) map.removeLayer(marker);
    }
  }

  /** Verbindungslinie für die Reihenfolge eines Tages. */
  function applyRoute() {
    if (!map) return;
    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
    if (route.length < 2) return;
    const pts = route
      .map((nr) => places.find((p) => p.nr === nr))
      .filter(Boolean)
      .map((p) => [p!.lat, p!.lng] as [number, number]);
    if (pts.length < 2) return;
    routeLine = L.polyline(pts, {
      color: '#16233C',
      weight: 2,
      opacity: 0.55,
      dashArray: '5 6',
    }).addTo(map);
  }

  /**
   * Linie aus fertigen Koordinaten. Gleiche Strichstärke und Strichelung wie
   * `applyRoute()`, damit ein Aufruf ohne `farbe` aussieht wie der Tagesplan;
   * `farbe` ist der einzige Unterschied, den ein Aufrufer setzen kann.
   */
  function applyLinie() {
    if (!map || !L) return;
    if (linienZug) {
      map.removeLayer(linienZug);
      linienZug = null;
    }
    // Ein einzelner Punkt ist keine Linie — Leaflet zeichnete dafür nichts,
    // legte aber eine Ebene an, die beim nächsten Lauf wieder abzuräumen wäre.
    if (!linie || linie.punkte.length < 2) return;
    linienZug = L.polyline(linie.punkte, {
      color: linie.farbe ?? '#16233C',
      weight: 2,
      opacity: 0.55,
      dashArray: '5 6',
    }).addTo(map);
  }

  /**
   * Freie Marken aufbauen — alle weg, alle neu, ohne Abgleich wie in
   * `baueMarker()`. Der Abgleich dort lebt von der Ortsnummer als Schlüssel;
   * hier gibt es keinen, und die Listen sind Tagebuchbeiträge, keine 164 Orte.
   *
   * **Kein `offsetOf()` hier**, und das ist gemessen entschieden: Deckungsgleiche
   * Marken verdeckten sich vollständig — Leaflet errechnet den z-Index aus der
   * Bildschirm-y-Position, die dann für beide gleich ist, und der untere Marker
   * bekommt keine Zeigerereignisse mehr. Ein geografischer Versatz löst das nicht:
   * die `0.00016°` von `offsetOf()` sind bei Zoomstufe 15 rund 3,7 Pixel bei 26
   * Pixel Markerbreite. Stattdessen bündelt `markenFuer()` in
   * `src/lib/tagebuch.ts` alle Beiträge eines Orts in **eine** Marke mit einem
   * Popup — hier kommen also nie zwei Marken auf derselben Koordinate an.
   */
  function applyMarken() {
    if (!map || !L) return;
    for (const marker of markenLayer) map.removeLayer(marker);
    markenLayer = [];

    for (const marke of marken) {
      const text = maskiere(marke.text);
      /*
       * `farbe` landet in einem style-Attribut, und `maskiere()` schützt nur die
       * Attributgrenze — innerhalb von `background:` nimmt CSS alles, auch
       * `url(…)`. Die Farbe kommt aus `profiles.farbe`, und dort steht laut
       * `0001_init.sql` nur `text not null`, ohne CHECK. Also wird hier geprüft
       * statt die Verantwortung weitergeschoben: kein Hex-Wert, dann die
       * Vorgabefarbe. Schreiben darf das Feld ohnehin nur die angemeldete Person
       * selbst (Policy `profile_aendern`), von außen ist nichts zu erreichen —
       * eine Prüfung, die von genau einer Policy abhängt, ist aber keine.
       */
      const farbe = /^#[0-9a-fA-F]{3,8}$/.test(marke.farbe) ? marke.farbe : '#7b5cff';
      const size = marke.text.length > 2 ? 30 : 26;
      const marker = L.marker([marke.lat, marke.lng], {
        icon: L.divIcon({
          /*
           * Eigene Klasse, bewusst nicht `jp-marker`: Der Browsertest der
           * Gästeseite prüft über diese Klasse, dass dort kein einziger
           * Reiseführer-Marker steht.
           */
          className: 'jp-marke',
          html: `<span style="background:${farbe}">${text}</span>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          popupAnchor: [0, -(size / 2)],
        }),
        /*
         * Kein `title`: Der einzige Text, den die Marke kennt, ist die
         * Reisetagnummer oder `?`. Als Browser-Sprechblase sagt „7" ohne
         * Zusammenhang nichts, und das Popup nennt Tag, Datum, Ort und Person
         * vollständig. `baueMarker()` setzt dort Nummer **und** Namen — hier
         * gibt es keinen Namen zu setzen.
         */
        riseOnHover: true,
      });
      /*
       * `popup` geht unmaskiert in die Karte, und das ist die Absicht: Der
       * Aufrufer baut Absätze, Bild und Links selbst und maskiert die Anteile,
       * die von Menschen kommen (`escape()` in `src/lib/tagebuch.ts`). Würde
       * hier maskiert, käme sein Markup als sichtbarer Text an. Wer diese Prop
       * füllt, haftet für das HTML darin.
       */
      if (marke.popup) marker.bindPopup(marke.popup, { maxWidth: 300, minWidth: 220 });
      marker.addTo(map);
      markenLayer.push(marker);
    }
  }

  function applySelected() {
    if (!map || selected == null) return;
    const marker = markers.get(selected);
    if (!marker) return;
    if (!map.hasLayer(marker)) marker.addTo(map);
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14), { animate: true });
    marker.openPopup();
  }

  /** Karte auf die sichtbaren Orte einpassen. */
  export function fitVisible() {
    if (!map || !L) return;
    const shown = (visible ?? places.map((p) => p.nr))
      .map((nr) => markers.get(nr))
      .filter(Boolean);
    /*
     * Die Gästekarte läuft mit `places={[]} visible={[]}`; ohne die Marken
     * hätte sie nichts zum Einpassen und bliebe auf dem Startzoom über ganz
     * Japan stehen. Ist beides leer, bleibt der Ausschnitt wie er ist —
     * `fitBounds` auf einer leeren Menge wirft.
     *
     * Die Marken kommen aus der Prop, nicht aus `markenLayer`: Wer `marken`
     * setzt und im selben Zug `fitVisible()` ruft, wäre sonst eine Runde zu
     * früh — die Ebenen entstehen erst, wenn der `$effect` gelaufen ist.
     * Für die Orte bleibt es beim Marker, weil dessen Position bei Nr. 95/96
     * versetzt ist (`offsetOf`) und der Ausschnitt dem folgen soll.
     */
    const punkte = [
      ...shown.map((m) => m.getLatLng()),
      ...marken.map((m) => L.latLng(m.lat, m.lng)),
    ];
    if (!punkte.length) return;
    if (punkte.length === 1) {
      map.setView(punkte[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(punkte), { padding: [36, 36], maxZoom: 15 });
  }

  /**
   * Mittelpunkt und Maßstab der Karte — für den Sprung nach Google Maps.
   *
   * Gibt `null`, solange die Karte noch nicht steht. Der Aufrufer muss das
   * behandeln; ein erfundener Mittelpunkt wäre schlimmer als kein Sprung.
   */
  export function ansicht(): { lat: number; lng: number; zoom: number } | null {
    if (!map) return null;
    const m = map.getCenter();
    return { lat: m.lat, lng: m.lng, zoom: map.getZoom() };
  }

  export function flyTo(target: [number, number], z = 12) {
    map?.setView(target, z, { animate: true });
  }

  // Auf Änderungen der Props reagieren, sobald die Karte steht.
  $effect(() => {
    // Auf die Liste selbst und auf die Felder horchen, die den Marker prägen:
    // Ein umbenannter Ort soll auch umbenannt auf der Karte stehen.
    void places.map((p) => `${p.nr}|${p.name}|${p.category}|${p.lat}|${p.lng}`).join();
    if (ready) {
      baueMarker();
      applyVisible();
    }
  });

  $effect(() => {
    void visible;
    if (ready) applyVisible();
  });

  $effect(() => {
    void pin;
    if (ready) applyPin();
  });

  $effect(() => {
    if (!host) return;
    host.classList.toggle('picking', pickMode);
  });

  $effect(() => {
    void route;
    if (ready) applyRoute();
  });

  $effect(() => {
    void selected;
    if (ready) applySelected();
  });

  $effect(() => {
    // Der Effekt läuft, wenn der Aufrufer ein neues `linie`-Objekt liefert. Er
    // läuft **nicht**, wenn jemand die Punkte in einer weitergegebenen Liste
    // austauscht: Ein gewöhnliches Array ist kein `$state`, das Lesen von
    // `.length` legt keine Abhängigkeit an. Heute trägt das, weil
    // `stationsRoute()` neue Tupel aus `stations.json` baut und sich nie ändert.
    // Wer die Linie bewegen will, muss ein neues Objekt übergeben.
    void linie;
    if (ready) applyLinie();
  });

  $effect(() => {
    // Gelesen wird die Prop selbst, und das genügt: Svelte übersetzt
    // `marken={markenFuer(…)}` beim Aufrufer zu einem Getter über dessen
    // reaktiven Zustand — ändert sich `buch.beitraege`, läuft dieser Effekt und
    // baut alle Marken neu. Ein Schlüsselstring über die Felder wäre hier
    // wirkungslos: `marken` ist ein gewöhnliches Array, das Lesen von `m.lat`
    // legt keine Abhängigkeit an. Er stand hier und wurde verworfen, weil der
    // Kommentar daneben einen Schutz behauptete, den es nicht gab.
    void marken;
    if (ready) applyMarken();
  });
</script>

<div class="map" bind:this={host} role="application" aria-label="Karte der Reiseorte"></div>

{#if pickMode}
  <div class="pickhint">Auf die Karte tippen, um die Stelle zu setzen</div>
{/if}

{#if !ready}
  <div class="loading">Karte wird geladen …</div>
{/if}

<!--
  Der Hinweis bei fehlendem Kartenhintergrund.

  Zwei Dinge daran sind wichtiger als sein Aussehen:

  1. **Er nennt den Host.** Das ist die Diagnose, die sonst fehlt: Steht dort
     `tiles.openfreemap.org`, ist der Dienst aus; steht dort
     `tile.openstreetmap.org`, ist auch der Rückfall blockiert und die Ursache
     liegt im Netz oder an einem Inhaltsblocker im Browser.
  2. **Er blockiert nichts.** `pointer-events: none` am Überzug, nur der Knopf
     nimmt Tipps an. Marker, Popups und die Liste arbeiten ohne Untergrund
     weiter — und das steht auch da, damit man weiß, dass die Orte stimmen und
     bloß das Bild fehlt.
-->
<!--
  Der Umschalter.

  Nur wenn er etwas nützt: Bei `fehler` steht ohnehin der Hinweisbalken mit
  seinem eigenen Knopf da, und zwei Knöpfe übereinander wären eine Falle statt
  einer Hilfe.

  Die Beschriftung sagt, was ein Tipp **bewirkt**, nicht welcher Zustand gerade
  gilt — „Vektorkarte" und „Rasterkarte" sind Fachwörter, die unterwegs niemand
  gegeneinander abwägt. Was zählt, ist die Schrift auf der Karte.
-->
{#if kartenwahl && ready}
  <div class="kartenwahl">
    <!--
      Die Pille zeigt **deine Einstellung**, nicht den Momentzustand.

      Vorher hing sie an `grund.art`: Während die Anbieterkette lief, wechselte
      die Beschriftung unter dem Finger, und auf der OSM-Karte stand „Lateinische
      Karte", obwohl die Einstellung längst auf „automatisch" stand — ein Knopf,
      der nichts ändert. Jetzt sagt sie schlicht, was ein Tipp umstellt.
    -->
    {#if kartenart === 'auto'}
      <button
        type="button"
        onclick={() => artWaehlen('raster')}
        title="OpenStreetMap-Karte: japanisch beschriftet, lädt aber ohne den großen Kartenbaustein"
      >
        OSM-Karte
      </button>
    {:else}
      <button
        type="button"
        class="werben"
        onclick={() => artWaehlen('auto')}
        title="Noch einmal die Vektorkarte holen — die ist lateinisch beschriftet"
      >
        Lateinische Karte
      </button>
    {/if}
  </div>
{/if}

{#if grund.art === 'fehler'}
  <!-- Rückt nach unten, wo der Umschalter steht — sonst liegen beide übereinander. -->
  <div class="kachelfehler" class:mitwahl={kartenwahl} role="status">
    <b>Kartenhintergrund lädt nicht</b>
    <span>Die Orte und ihre Popups funktionieren weiter — nur das Kartenbild fehlt.</span>
    <span class="khost">{grund.host} antwortet nicht{grund.warum ? ` · ${grund.warum}` : ''}</span>
    <!--
      Setzt die gemerkte Kartenart mit zurück, und das ist kein Nebenher.
      Ohne das wäre „OSM-Karte gewählt, und OSM kommt auch nicht" eine
      Sackgasse: Der Umschalter ist in diesem Zustand ausgeblendet, damit er
      nicht über dem Hinweis liegt — es gäbe also keinen Weg zurück zur
      lateinischen Karte außer die Seite neu zu laden.
    -->
    <button type="button" onclick={() => artWaehlen('auto')}>nochmal versuchen</button>
  </div>
{/if}

<style>
  .map {
    width: 100%;
    height: 100%;
    min-height: 260px;
    background: var(--washi-2);
    z-index: 0;
  }

  .kartenwahl {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 600;
  }

  .kartenwahl button {
    /* 44 px, wie jedes Tippziel in dieser App — nicht die 36 px der kleinen
       Knöpfe: Dieser hier sitzt auf einer Karte, die man gleichzeitig schiebt. */
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    color: var(--ai);
    font-family: var(--util);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.16);
    cursor: pointer;
  }

  .kartenwahl button.werben {
    /* Der Weg zurück zur lesbaren Karte darf auffallen. Der Weg weg von ihr
       nicht — sonst tippt man ihn versehentlich an. */
    background: var(--shu);
    border-color: var(--shu);
    color: #fff;
  }

  .kachelfehler {
    position: absolute;
    left: 10px;
    right: 10px;
    top: 10px;
  }

  /*
   * Nicht nach unten schieben, sondern rechts Platz machen.
   *
   * Die erste Fassung setzte `top: 62px` — damit rutschte der Hinweis mitten in
   * die Karte und sein Knopf über eine Stelle, die man antippen will. Die
   * Browserprüfung, die genau das abfragt, ist prompt umgefallen. So bleibt er
   * oben und die Pille daneben.
   */
  .kachelfehler.mitwahl {
    padding-right: 136px;
    z-index: 600;
    /* Der Überzug darf die Karte nicht schlucken — sonst wäre die Reparatur
       schlimmer als der Fehler: Man sähe einen Hinweis und käme an keinen Marker
       mehr. Nur der Knopf nimmt Tipps an. */
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: var(--card);
    border: 1px solid var(--shu);
    border-left: 4px solid var(--shu);
    border-radius: var(--radius-sm);
    padding: 9px 12px;
    box-shadow: 0 2px 10px rgba(22, 35, 60, 0.12);
  }

  .kachelfehler b {
    font-family: var(--util);
    font-size: 0.78rem;
    letter-spacing: 0.03em;
    color: var(--shu-deep);
  }

  .kachelfehler span {
    font-size: 0.8rem;
    color: var(--ai-60);
  }

  .kachelfehler .khost {
    font-family: var(--util);
    font-size: 0.72rem;
    color: var(--ai-40);
    word-break: break-all;
  }

  .kachelfehler button {
    pointer-events: auto;
    align-self: flex-start;
    margin-top: 4px;
    /* 44 px wie überall — ein Knopf, den man bei schlechtem Netz dreimal
       verfehlt, macht es nicht besser. */
    min-height: 44px;
    padding: 0 14px;
    background: var(--shu);
    color: #fff;
    border: 0;
    border-radius: var(--radius-sm);
    font-family: var(--util);
    font-size: 0.78rem;
    cursor: pointer;
  }

  /* Im Erfassungsmodus soll klar sein, dass ein Tipp etwas anderes tut. */
  .map.picking {
    cursor: crosshair;
  }

  .pickhint {
    position: absolute;
    left: 50%;
    top: 12px;
    transform: translateX(-50%);
    z-index: 500;
    background: var(--shu);
    color: #fff;
    font-family: var(--util);
    font-size: 0.74rem;
    padding: 7px 13px;
    border-radius: 999px;
    pointer-events: none;
    box-shadow: 0 2px 10px rgba(22, 35, 60, 0.3);
  }

  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-family: var(--util);
    font-size: 0.8rem;
    color: var(--ai-40);
    pointer-events: none;
  }

  /*
   * Eine eingebettete Karte nimmt den Finger erst nach dem Antippen. Ohne
   * Hinweis wirkt sie in diesem Zustand kaputt — deshalb sagt sie es.
   */
  .map.locked::after {
    content: 'Zum Bewegen antippen';
    position: absolute;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    z-index: 400;
    background: rgba(22, 35, 60, 0.86);
    color: var(--washi);
    font-family: var(--util);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    padding: 7px 14px;
    border-radius: 999px;
    pointer-events: none;
    white-space: nowrap;
  }

  /* Leaflet erzeugt sein Markup selbst — deshalb global. */
  :global(.jp-marker) {
    background: none !important;
    border: none !important;
  }

  :global(.jp-marker span) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 999px;
    color: #fff;
    font-family: var(--util);
    font-weight: 700;
    font-size: 0.7rem;
    line-height: 1;
    border: 2px solid rgba(239, 231, 214, 0.92);
    box-shadow: 0 1px 4px rgba(13, 22, 38, 0.45);
    cursor: pointer;
  }

  /* Selbst ergänzte Orte tragen einen gestrichelten Ring — auf der Karte soll
     erkennbar sein, was aus dem Reiseband kommt und was von euch. */
  :global(.jp-eigen span) {
    border-style: dashed;
    border-color: #fff;
    box-shadow:
      0 0 0 2px rgba(198, 64, 43, 0.55),
      0 1px 4px rgba(13, 22, 38, 0.45);
  }

  /*
   * Freie Marken. Eigene Klasse statt `.jp-marker`, damit an der Gästeseite
   * nachweisbar kein Reiseführer-Marker hängt.
   *
   * `--util` kommt aus `tokens.css` und damit über `Base.astro`. Der Rückfall
   * steht trotzdem da: Eine Gästeseite mit eigenem Gerüst ohne diese Tokens
   * hätte hier eine ungültige Angabe, und die Beschriftung erbte die Schrift
   * der Seite — im 26 px kleinen Kreis ist das schnell unlesbar.
   */
  :global(.jp-marke) {
    background: none !important;
    border: none !important;
  }

  :global(.jp-marke span) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 999px;
    color: #fff;
    font-family: var(--util, 'Helvetica Neue', sans-serif);
    font-weight: 700;
    font-size: 0.7rem;
    line-height: 1;
    border: 2px solid #fff;
    box-shadow: 0 1px 4px rgba(13, 22, 38, 0.45);
    cursor: pointer;
  }

  :global(.jp-pin-neu) {
    background: none !important;
    border: none !important;
  }

  :global(.jp-pin-neu span) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: var(--shu);
    color: #fff;
    font-family: var(--util);
    font-size: 1.1rem;
    font-weight: 700;
    border: 3px solid #fff;
    box-shadow: 0 2px 8px rgba(13, 22, 38, 0.5);
    animation: jp-pin-puls 1.4s ease-in-out infinite;
  }

  @keyframes jp-pin-puls {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.12);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.jp-pin-neu span) {
      animation: none;
    }
  }

  :global(.leaflet-container) {
    font-family: var(--util);
    background: var(--washi-2);
  }

  :global(.leaflet-popup-content-wrapper) {
    border-radius: var(--radius-sm);
    background: var(--card);
    color: var(--ai);
    box-shadow: var(--shadow);
  }

  :global(.leaflet-popup-content) {
    margin: 12px 14px;
    line-height: 1.5;
  }

  :global(.jp-popup-head) {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  :global(.jp-popup-nr) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 5px;
    border-radius: 999px;
    color: #fff;
    font-weight: 700;
    font-size: 0.68rem;
    flex: none;
  }

  :global(.jp-popup-head strong) {
    font-family: var(--disp);
    font-size: 1rem;
    font-weight: 600;
  }

  :global(.jp-popup-cat) {
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ai-40);
    margin-bottom: 6px;
  }

  :global(.jp-popup p) {
    margin: 0 0 6px;
    font-family: var(--serif);
    font-size: 0.86rem;
  }

  :global(.jp-popup-flags) {
    font-size: 0.72rem;
    color: var(--shu-deep);
    margin-bottom: 6px;
  }

  :global(.jp-popup a) {
    font-size: 0.75rem;
    color: var(--shu-deep);
  }
</style>
