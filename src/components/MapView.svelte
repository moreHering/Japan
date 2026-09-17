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
  import { CATEGORIES, plainText, type Category, type Place } from '../lib/places';
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
  }: Props = $props();

  let host: HTMLDivElement;
  let map: any = null;
  let L: any = null;
  let markers = new Map<number, any>();
  let routeLine: any = null;
  let ready = $state(false);

  const colorOf = (cat: Category) => CATEGORIES.find((c) => c.key === cat)!.color;

  /**
   * Marker als nummerierter Kreis. Orte, die auf genau derselben Koordinate
   * liegen (Nr. 95/96), werden minimal versetzt, sonst verdeckt einer den anderen.
   */
  function iconFor(place: Place) {
    const digits = String(place.nr).length;
    const size = digits > 2 ? 30 : 26;
    return L.divIcon({
      className: 'jp-marker',
      html: `<span style="background:${colorOf(place.category)}">${place.nr}</span>`,
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
    const flags = [
      place.isFriendTip ? '★ Freundestipp' : '',
      place.book ? `📖 Reiseführer ${place.book} · ${place.bookTitle}` : '',
      place.closedDay ? `${place.closedDay}. geschlossen` : '',
      place.needsBooking ? 'Reservierung' : '',
      place.cashOnly ? 'nur Bargeld' : '',
    ].filter(Boolean);

    return `
      <div class="jp-popup">
        <div class="jp-popup-head">
          <span class="jp-popup-nr" style="background:${cat.color}">${place.nr}</span>
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

      for (const place of places) {
        const marker = L.marker(offsetOf(place), {
          icon: iconFor(place),
          title: `${place.nr} · ${place.name}`,
          riseOnHover: true,
        });
        marker.bindPopup(popupHtml(place), { maxWidth: 300, minWidth: 220 });
        marker.on('click', () => onselect?.(place.nr));
        markers.set(place.nr, marker);
      }

      ready = true;
      applyVisible();
      applyRoute();
      applySelected();
    })();

    return () => {
      disposed = true;
      map?.remove();
      map = null;
      markers.clear();
    };
  });

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
    if (!shown.length) return;
    if (shown.length === 1) {
      map.setView(shown[0].getLatLng(), 14);
      return;
    }
    map.fitBounds(L.featureGroup(shown).getBounds(), { padding: [36, 36], maxZoom: 15 });
  }

  export function flyTo(target: [number, number], z = 12) {
    map?.setView(target, z, { animate: true });
  }

  // Auf Änderungen der Props reagieren, sobald die Karte steht.
  $effect(() => {
    void visible;
    if (ready) applyVisible();
  });

  $effect(() => {
    void route;
    if (ready) applyRoute();
  });

  $effect(() => {
    void selected;
    if (ready) applySelected();
  });
</script>

<div class="map" bind:this={host} role="application" aria-label="Karte der Reiseorte"></div>

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
