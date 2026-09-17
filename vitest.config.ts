/**
 * Prüfstand für die Abgleich-Logik.
 *
 * `.svelte.ts`-Dateien enthalten Runen ($state, $derived) und müssen durch den
 * Svelte-Compiler, bevor Node sie ausführen kann — dafür sorgt das Plugin.
 */
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // Der Client baut sich nur, wenn er Zugangsdaten sieht. Die hier sind
    // erfunden — die Anfragen fängt der Prüfserver ab, bevor Netz ins Spiel kommt.
    env: {
      PUBLIC_SUPABASE_URL: 'http://ablage.test',
      PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
    },
  },
});
