/**
 * Was im ausgelieferten Stand **nicht** stehen darf.
 *
 * Prüft `dist/` und nicht die Quellen — es geht um das, was auf
 * `morehering.github.io/Japan` landet. Die Datei setzt voraus, dass vorher
 * `npm run build` gelaufen ist; ohne `dist/` überspringt sie sich selbst, statt
 * rot zu werden. (Der Wächter im CI baut vor den Prüfungen, dort greift sie
 * immer.)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = 'dist';

/** Alle Dateien unterhalb eines Ordners, rekursiv. */
function dateien(ordner: string): string[] {
  const raus: string[] = [];
  for (const name of readdirSync(ordner)) {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) raus.push(...dateien(pfad));
    else raus.push(pfad);
  }
  return raus;
}

describe('Der ausgelieferte Stand', () => {
  it.skipIf(!existsSync(DIST))('trägt den Prüfhaken __buch nicht mit sich', () => {
    /*
     * `freundebuch.svelte.ts` hängt im Entwicklungsmodus seine Instanz von `buch`
     * an `globalThis`, damit die Browsersuiten den Zustand setzen können, ohne
     * das Modul ein zweites Mal zu importieren (Vites `?v=`-Falle, siehe
     * `buchSchreiben()` in `test/browserlauf.mjs`).
     *
     * Der Zweig steht hinter `import.meta.env.DEV` und fällt beim Bündeln weg.
     * **Diese Prüfung ist der Beweis dafür**, und sie ist nötig: Ein Prüfhaken,
     * der mitgeliefert wird, ist eine Hintertür — jeder Besucher könnte über
     * `window.__buch` den angezeigten Bilderstrom verändern. Harmlos, solange
     * niemand es merkt; peinlich, sobald es jemand merkt.
     *
     * Gesucht wird in **allen** Dateien und nicht nur im JavaScript: Ein
     * Inline-Skript in einer HTML-Datei wäre genauso ausgeliefert.
     */
    const treffer = dateien(DIST).filter((p) => readFileSync(p, 'utf8').includes('__buch'));
    expect(treffer, `__buch steht im ausgelieferten Stand:\n${treffer.join('\n')}`).toEqual([]);
  });

  it.skipIf(!existsSync(DIST))('liefert die Plan-Seiten ohne die Ortsdaten im HTML aus', () => {
    /*
     * Bis zum 23.09. bekamen `/plan/`, `/orte/` und `/organisation/` die ganze
     * Ortsliste als Astro-Prop mit — rund 115 kB je Seite, die keine Komponente
     * mehr las (alle nehmen `sichtbareOrte()` aus dem Store). Auf einer
     * Roaming-Verbindung ist das bei jedem Öffnen bezahlt. Gemessen danach:
     * ~12 kB. Die Grenze liegt mit Luft darüber und fällt, sobald die Liste
     * wieder hineinrutscht.
     */
    for (const seite of ['plan', 'orte', 'organisation']) {
      const groesse = statSync(join(DIST, seite, 'index.html')).size;
      expect(groesse, `${seite}/index.html ist ${groesse} Byte`).toBeLessThan(40_000);
    }
  });

  /*
   * **Hier stand eine Prüfung „das Anmeldepasswort kommt im Bündel nicht vor" —
   * sie ist wieder raus, und der Grund ist ein Befund.**
   *
   * Das gemeinsame Passwort ist ein gewöhnliches japanisches Gericht, und es
   * steht achtmal im Reiseband („Yakitori-Stände im Grillrauch",
   * „Yakitori-Gassen; früh am Abend") — also auf genau den Seiten, die öffentlich
   * erreichbar sind. Eine Textsuche darauf schlägt immer an, und eine Prüfung,
   * die immer anschlägt, wird abgeschaltet und schützt danach nichts.
   *
   * Der eigentliche Punkt ist kein Testproblem: Ein Passwort, das als Wort auf
   * der eigenen Seite steht, ist geraten, bevor jemand einen Angriff versucht.
   * Solange es so bleibt, gibt es hier nichts zu prüfen.
   */
});
