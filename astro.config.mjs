// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// GitHub Pages Project Page: https://morehering.github.io/Japan
//
// trailingSlash ist bewusst auf 'always' gesetzt: nur dann ist der Wert von
// import.meta.env.BASE_URL laut Astro-Doku eindeutig ("/Japan/"), und alle
// Links lassen sich gefahrlos daran anhängen.
/** Einmal hier, weil Weiterleitungen den Basispfad selbst mitbringen müssen. */
const BASE = '/Japan';

export default defineConfig({
  site: 'https://morehering.github.io',
  base: BASE,
  trailingSlash: 'always',
  output: 'static',
  integrations: [svelte()],

  // Die Kartenseite ist in "Orte" aufgegangen. Der alte Pfad bleibt als
  // Weiterleitung bestehen: Er steht auf Lesezeichen und war der Startpunkt,
  // wenn jemand die Seite als App abgelegt hat.
  //
  // Das Ziel trägt den Basispfad ausdrücklich: Astro setzt ihn bei
  // Weiterleitungen **nicht** von selbst davor. Ohne ihn zeigt die erzeugte
  // Seite auf morehering.github.io/orte/ — und das gibt es nicht.
  redirects: {
    '/karte': `${BASE}/orte/`,
  },
});
