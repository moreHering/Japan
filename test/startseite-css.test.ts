/**
 * Findet Regeln im `<style>`-Block der Startseite, die kein Element mehr treffen.
 *
 * Der Grund für diese Datei ist gemessen, nicht befürchtet: `src/pages/index.astro`
 * hat zwei Umbauten hinter sich — der App-Hero ist weg und die Kachelliste der
 * Kapitel auch —, und beide Male blieb ihr CSS liegen. Zusammen rund 160 Zeilen,
 * die aussehen wie benutzter Code. Wer als nächstes an der Datei arbeitet, hält sie
 * dafür und baut daneben, statt darauf.
 *
 * Im Build fällt das nicht auf: Astro und Vite entfernen unbenutzte CSS-Regeln
 * nicht, sie wissen nicht, welche Klassen zur Laufzeit entstehen. Svelte warnt bei
 * Komponenten über unbenutzte Selektoren — eine `.astro`-Datei nicht.
 *
 * Was die Prüfung **nicht** kann: Regeln beurteilen, deren Klassen über `set:html`
 * aus dem Reiseband kommen. Die stehen alle in `:global(…)` und sind deshalb
 * ausgenommen — das ist die Grenze, und sie ist hier absichtlich sichtbar.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const quelle = readFileSync('src/pages/index.astro', 'utf8');

/**
 * Der **lokale** Stilblock, nicht der globale mit dem Bandstylesheet.
 *
 * `<style is:global set:html={bandStil}></style>` steht davor und ist leer im
 * Quelltext — sein Inhalt kommt zur Bauzeit dazu. Gesucht ist der Block danach.
 */
function lokalerStil(text: string): string {
  const anfang = text.indexOf('\n  <style>');
  if (anfang === -1) throw new Error('kein lokaler <style>-Block gefunden');
  const ende = text.indexOf('</style>', anfang);
  return text.slice(anfang + '\n  <style>'.length, ende);
}

/** Kommentare weg, damit ein erklärter Klassenname nicht als Regel zählt. */
const ohneKommentare = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Selektoren des Stilblocks, flach.
 *
 * Bewusst kein Parser aus npm: Gebraucht wird genau eine Auskunft. Der Zähler
 * versteht keine Zeichenketten in Werten; `content: "{"` würde ihn zerreißen.
 * Dagegen steht die Prüfung „kommt ohne content: aus" weiter unten.
 */
function selektoren(css: string): string[] {
  const rein = ohneKommentare(css);
  const raus: string[] = [];
  let kopf = '';
  let tiefe = 0;

  for (const zeichen of rein) {
    if (zeichen === '{') {
      const text = kopf.trim().replace(/\s+/g, ' ');
      kopf = '';
      // Auf der obersten Ebene und in At-Regeln sind Selektoren interessant,
      // innerhalb eines Deklarationsblocks gibt es keine.
      if (tiefe === 0 && !text.startsWith('@')) raus.push(text);
      else if (tiefe === 1 && !text.startsWith('@')) raus.push(text);
      tiefe++;
    } else if (zeichen === '}') {
      tiefe--;
      kopf = '';
    } else {
      kopf += zeichen;
    }
  }
  if (tiefe !== 0) throw new Error(`unausgeglichene Klammern (${tiefe})`);
  return raus;
}

/** Klassennamen, die das Markup der Seite wirklich schreibt. */
function klassenImMarkup(text: string): Set<string> {
  // Alles vor dem ersten `<style` ist Frontmatter und Markup.
  const markup = text.slice(0, text.indexOf('\n  <style'));
  const gefunden = new Set<string>();
  // `class="a b"`, `class={`...`}`, `class:x={...}` — die letzten zwei kommen in
  // dieser Datei nicht vor, sind aber billig mitzunehmen.
  for (const m of markup.matchAll(/class(?::([\w-]+))?=(?:"([^"]*)"|\{([^}]*)\})/g)) {
    if (m[1]) gefunden.add(m[1]);
    for (const wort of (m[2] ?? m[3] ?? '').split(/[\s"'`]+/)) {
      // Aus `${...}`-Ausdrücken bleiben Bruchstücke übrig; nur saubere
      // Klassennamen zählen.
      if (/^[a-zA-Z][\w-]*$/.test(wort)) gefunden.add(wort);
    }
  }
  return gefunden;
}

/**
 * Klassen, die das Layout um die Seite herum mitbringt.
 *
 * `Base.astro` und `tokens.css` liefern sie; die Startseite darf sie stylen, ohne
 * sie selbst zu schreiben. Ohne diese Liste meldete die Prüfung sie als tot.
 */
const VOM_LAYOUT = new Set(['section', 'eyebrow', 'badge', 'inner', 'wrap']);

describe('Der Selektor-Zerleger', () => {
  it('geht in @media hinein', () => {
    expect(selektoren('@media (max-width: 720px) { .a { x: 1 } }')).toEqual(['.a']);
  });

  it('lässt sich von einer Klammer im Kommentar nicht zerreißen', () => {
    expect(selektoren('/* } */ .a { x: 1 }')).toEqual(['.a']);
  });

  it('liest Selektorlisten als eine Regel', () => {
    expect(selektoren('.a, .b { x: 1 }')).toEqual(['.a, .b']);
  });
});

describe('src/pages/index.astro', () => {
  const stil = lokalerStil(quelle);
  const benutzt = klassenImMarkup(quelle);

  it('findet Markup und Stilblock überhaupt', () => {
    // Ohne diese Prüfung wäre alles darunter grün, wenn die Zerlegung ins Leere
    // greift — der klassische Test, der nichts prüft und beruhigt.
    expect(stil.length).toBeGreaterThan(1000);
    expect(benutzt.size).toBeGreaterThan(10);
    expect(benutzt).toContain('bandtext');
    expect(benutzt).toContain('station');
  });

  it('hat keine Regel für eine Klasse, die es nicht mehr gibt', () => {
    const tot: string[] = [];
    for (const sel of selektoren(stil)) {
      for (const teil of sel.split(',')) {
        const t = teil.trim();
        // `:global(…)` bindet Klassen aus dem Reiseband, das über `set:html`
        // hereinkommt — die stehen nicht im Markup dieser Datei.
        if (!t || t.includes(':global(')) continue;
        const klassen = [...t.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
        if (!klassen.length) continue; // reine Elementselektoren
        for (const k of klassen) {
          if (!benutzt.has(k) && !VOM_LAYOUT.has(k)) tot.push(`${t}  →  .${k}`);
        }
      }
    }
    expect([...new Set(tot)], `Regeln ohne Element:\n${[...new Set(tot)].join('\n')}`).toEqual([]);
  });

  it('kommt im lokalen Stilblock ohne content: aus', () => {
    // Voraussetzung des Zerlegers: Er versteht keine Zeichenketten. Ein
    // `content: "{"` würde ihn zerreißen, und die Prüfung oben wäre ab dieser
    // Zeile blind.
    expect(ohneKommentare(stil)).not.toMatch(/(?:^|[\s;{])content\s*:/);
  });
});
