// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// GitHub Pages Project Page: https://morehering.github.io/Japan
//
// trailingSlash ist bewusst auf 'always' gesetzt: nur dann ist der Wert von
// import.meta.env.BASE_URL laut Astro-Doku eindeutig ("/Japan/"), und alle
// Links lassen sich gefahrlos daran anhängen.
export default defineConfig({
  site: 'https://morehering.github.io',
  base: '/Japan',
  trailingSlash: 'always',
  output: 'static',
  integrations: [svelte()],
});
