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
  import { maps } from '../lib/paths';

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
    let disposed = false;

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

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

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

<style>
  .map {
    width: 100%;
    height: 100%;
    min-height: 260px;
    background: var(--washi-2);
    z-index: 0;
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
