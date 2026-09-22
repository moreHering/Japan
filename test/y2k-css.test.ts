/**
 * Prüfstand für das gemeinsame Y2K-Stylesheet.
 *
 * `src/styles/y2k.css` ist die einzige CSS-Datei des Projekts, die ohne Svelte-Hash
 * und ohne Container-Bindung in die Seiten kommt — Freundebuch und öffentliche
 * Tagebuch-Ansicht teilen sie. Damit hängt alles an einer Bedingung: jede Regel steht
 * unter `.y2k`. Ein `h1 { … }` oder `img { … }` das durchrutscht, lackiert jede
 * Überschrift und jedes Bild der ganzen Anwendung um. Im Build sieht man das nicht,
 * sondern erst im Browser auf einer Seite, die mit dem Buch nichts zu tun hat, und
 * dann sucht man an der falschen Stelle.
 *
 * Zweite Falle: die drei Keyframes. Svelte benennt `@keyframes` im Komponenten-`<style>`
 * um und findet den Namen in einer externen Datei nicht mehr. Blieben sie dort, liefen
 * Lauftext, Glitzer und Blinken still nicht mehr — ohne Fehler, ohne Warnung.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { VORGABE, VORLAGEN } from '../src/lib/vorlagen';

/**
 * Über das Dateisystem und nicht als `?raw`-Import: Vitest behandelt CSS eigens und
 * liefert für `.css?raw` einen Leerstring — der Test wäre grün, ohne etwas geprüft
 * zu haben. Vgl. `test/css-scope.test.ts`, dieselbe Falle.
 */
const y2k = readFileSync('src/styles/y2k.css', 'utf8');
const komponente = readFileSync('src/components/Freundebuch.svelte', 'utf8');
const bildfeld = readFileSync('src/components/Bildfeld.svelte', 'utf8');

type Regel = {
  /** Selektorzeile, wie sie in der Datei steht, Leerraum zusammengezogen. */
  selektor: string;
  /** Kette der offenen At-Regeln, äußerste zuerst. Leer bei Regeln der obersten Ebene. */
  rahmen: string[];
};

/**
 * Zerlegt CSS in Regeln und merkt sich, in welchen At-Regeln sie stehen.
 *
 * Gebaut wird von Hand statt mit einem Parser aus npm: die Prüfung soll auch dann
 * noch laufen, wenn es an Abhängigkeiten fehlt, und sie braucht genau eine Auskunft
 * — Selektor plus Rahmen. Der Zähler versteht keine Zeichenketten; eine Klammer in
 * einem `content:`-Wert würde ihn zerreißen. Dagegen steht die Prüfung weiter unten.
 */
/**
 * Kommentare weg.
 *
 * Eigene Funktion und nicht nur inline in `regeln()`: Zwei Prüfungen weiter unten
 * suchen im Rohtext nach `:root` und `content:`. Beides steht in dieser Datei in
 * Kommentaren — die Prüfungen schlugen dort an, obwohl der wirksame CSS-Teil sauber
 * ist, und wären mit dem nächsten erklärenden Satz still zu Fehlalarmen geworden.
 */
const ohneKommentare = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function regeln(css: string): Regel[] {
  const rein = ohneKommentare(css);
  const gefunden: Regel[] = [];
  const rahmen: string[] = [];
  let kopf = '';
  let inDeklarationen = false;

  for (const zeichen of rein) {
    if (zeichen === '{') {
      const text = kopf.trim().replace(/\s+/g, ' ');
      kopf = '';
      // Verschachtelte Regeln (CSS-Nesting) gibt es in dieser Datei nicht. Käme eine
      // dazu, wäre die Auskunft des Zählers falsch — dann soll der Test brechen und
      // nicht stillschweigend die Hälfte prüfen.
      if (inDeklarationen) throw new Error(`verschachtelter Block bei: ${text}`);
      if (text.startsWith('@')) rahmen.push(text);
      else {
        gefunden.push({ selektor: text, rahmen: [...rahmen] });
        inDeklarationen = true;
      }
    } else if (zeichen === '}') {
      if (inDeklarationen) inDeklarationen = false;
      else rahmen.pop();
      kopf = '';
    } else if (zeichen === ';' && !inDeklarationen) {
      // Blocklose At-Regel (`@import …;`, `@charset …;`, `@layer a, b;`). Ohne
      // diesen Zweig landet sie im `kopf`-Puffer des **folgenden** Selektors; der
      // zusammengesetzte Text beginnt dann mit `@` und wird als Rahmen verbucht
      // statt als Regel. Die Klammerbilanz bleibt ausgeglichen, es fliegt keine
      // Ausnahme — der folgende Selektor verschwindet einfach aus der Prüfung.
      kopf = '';
    } else {
      kopf += zeichen;
    }
  }

  if (inDeklarationen || rahmen.length) throw new Error('unausgeglichene Klammern');
  return gefunden;
}

/** Die Farbwerte, von denen auch die im Komponenten-Stil gebliebenen Regeln leben. */
const FARBEN = [
  '--pink', '--cyan', '--lila', '--limone', '--sonne', '--tinte', '--papier',
];

/** Schritte einer Animation (`from`, `to`, `50%`) sind keine Selektoren. */
const istKeyframeSchritt = (r: Regel) => r.rahmen.some((a) => a.startsWith('@keyframes'));

/**
 * Alle Selektoren, die aus dem Komponenten-Stil in die Datei gewandert sind —
 * abgeleitet, nicht getippt. Doppelte fallen weg, `@media`-Fassungen derselben
 * Klasse kommen so nur einmal vor.
 */
/**
 * Der `<style>`-Block der Komponente und die Selektoren darin.
 *
 * `lastIndexOf` und nicht `indexOf`: stünde das Wort `<style>` einmal in einem
 * Kommentar im `<script>`, käme hier der Skriptteil heraus.
 *
 * Zerlegt mit demselben `regeln()`: Nur so lässt sich exakt vergleichen, statt mit
 * einem Regex auf Zeilenanfänge zu raten.
 */
const stilblock = komponente.slice(komponente.lastIndexOf('<style>'));
const KOMPONENTENSELEKTOREN = new Set(
  regeln(stilblock.replace(/<\/?style>/g, ''))
    .flatMap((r) => r.selektor.split(','))
    .map((t) => t.trim())
    .filter(Boolean),
);

const VERSCHOBEN = [
  ...new Set(
    regeln(y2k)
      .filter((r) => !istKeyframeSchritt(r))
      .flatMap((r) => r.selektor.split(','))
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];

describe('Der CSS-Zerleger', () => {
  it('geht in @media hinein', () => {
    // Genau das war der Grund, überhaupt zu zerlegen: eine Regel in einer
    // Media-Query ist so global wie jede andere, ein Regex auf Zeilenanfänge
    // hätte sie übersehen.
    const rs = regeln('@media (max-width: 480px) { .y2k .a { x: 1 } }');
    expect(rs).toEqual([{ selektor: '.y2k .a', rahmen: ['@media (max-width: 480px)'] }]);
  });

  it('erkennt Keyframe-Schritte als solche', () => {
    const rs = regeln('@keyframes k { from { opacity: 0 } 50%, 100% { opacity: 1 } }');
    expect(rs.map((r) => r.selektor)).toEqual(['from', '50%, 100%']);
    expect(rs.every(istKeyframeSchritt)).toBe(true);
  });

  it('lässt sich von einer Klammer im Kommentar nicht zerreißen', () => {
    const rs = regeln('/* } */ .y2k .a { x: 1 }');
    expect(rs.map((r) => r.selektor)).toEqual(['.y2k .a']);
  });

  it('verschluckt keine Regel nach einer blocklosen At-Regel', () => {
    /*
     * `@import`, `@charset` und `@layer a, b;` haben keinen Block. Ohne einen
     * eigenen Zweig für `;` sammelt der Zähler sie im `kopf`-Puffer des
     * **folgenden** Selektors; der zusammengesetzte Text beginnt dann mit `@` und
     * wird als Rahmen verbucht statt als Regel — die Regel verschwindet aus der
     * Liste, ohne Ausnahme und mit ausgeglichener Klammerbilanz.
     *
     * Das ist die üble Sorte Fehler: Der Prüfstand bliebe grün und prüfte ab
     * dieser Zeile nichts mehr. In `y2k.css` steht heute keine blocklose
     * At-Regel — darum gehört die Zusicherung hierher, an den Zerleger, und nicht
     * an die Datei.
     */
    const rs = regeln('@charset "utf-8";\n@import url(a.css);\n.y2k .a { x: 1 }');
    expect(rs.map((r) => r.selektor)).toEqual(['.y2k .a']);
    // Und in einer At-Regel mit Block: der `;`-Zweig darf Deklarationen nicht
    // anfassen, sonst fiele jede zweite Regel weg.
    const rs2 = regeln('@media screen { .y2k .a { x: 1; y: 2 } .y2k .b { z: 3 } }');
    expect(rs2.map((r) => r.selektor)).toEqual(['.y2k .a', '.y2k .b']);
  });
});

describe('src/styles/y2k.css', () => {
  it('bindet jeden Selektor an .y2k', () => {
    const ungebunden = regeln(y2k)
      .filter((r) => !istKeyframeSchritt(r))
      .flatMap((r) => r.selektor.split(','))
      .map((s) => s.trim())
      // `.y2k` selbst trägt die Farbvariablen; `.y2k .kopf` und `.y2k.irgendwas`
      // sind gebunden. Alles andere greift in fremde Seiten.
      .filter((s) => !/^\.y2k($|[\s.:[>+~])/.test(s));
    expect(ungebunden, `ungebundene Selektoren: ${ungebunden.join(' | ')}`).toEqual([]);
  });

  it('führt kein :root, html oder body', () => {
    // Die Datei kommt global in die Seite. `:root` hier würde die Tokens des
    // Reiseplaners überschreiben, und zwar auf jeder Seite, die das Buch einbindet.
    //
    // Über die Selektoren und nicht über den Rohtext: Der Rohtext enthält
    // Kommentare, in denen `:root` als Erklärung vorkommt — und ein `body>div{…}`
    // rutschte durch, weil das alte Muster ein Leerzeichen, Komma oder `{` als
    // Folgezeichen verlangte.
    const verboten = regeln(y2k)
      .flatMap((r) => r.selektor.split(','))
      .map((s) => s.trim())
      .filter((s) => /(?:^|[\s>+~])(?::root|html|body)(?:$|[\s.:[>+~])/.test(s));
    expect(verboten, `greift auf das Dokument zu: ${verboten.join(' | ')}`).toEqual([]);
  });

  it('bringt die drei Keyframes mit', () => {
    // Ohne sie stehen Glitzer, Lauftext und Blinken still — sichtbar nur im Browser.
    for (const name of ['schweben', 'laufen', 'blinken']) {
      const da = new RegExp(`@keyframes\\s+${name}\\b`).test(y2k);
      expect(da, `@keyframes ${name} fehlt`).toBe(true);
    }
  });

  it('setzt die Farbvariablen auf .y2k selbst', () => {
    // Nicht auf einen Nachfahren: die Regeln, die im Komponenten-`<style>` geblieben
    // sind, erben `--lila` und Co. vom Wrapper. Hingen die Variablen tiefer, wären
    // die Steckbriefe farblos.
    const grundton = /(?:^|\n)\.y2k\s*\{([^}]*)\}/.exec(y2k);
    expect(grundton, 'die Regel `.y2k` fehlt').not.toBeNull();
    for (const v of FARBEN) {
      expect(grundton?.[1], `${v} fehlt in .y2k`).toContain(v);
    }
  });

  it('greift mit keiner Regel in eine fremde Komponente hinein', () => {
    /*
     * Die wichtigste Prüfung dieser Datei, und der Grund, warum es sie gibt.
     *
     * `.y2k` schützt vor fremden **Seiten** — nicht vor fremden **Komponenten** im
     * selben Baum. Solange die Regeln im `<style>` des Freundebuchs standen, endete
     * ihre Reichweite am Svelte-Hash: `LoginPanel` trägt den Hash von LoginPanel,
     * also traf `.zeile { font-size: 0.66rem }` dessen eigene `.zeile` nicht. Global
     * gilt das nicht mehr, und beide benutzen dieselben generischen Namen. Gefunden
     * wurde das bei vier Regeln (`.kasten b`, `.kasten p`, `.zeile`, `.hinweis`);
     * `grid-column` und `text-align: center` aus `.hinweis` hatten in LoginPanel
     * gar keinen Gegenspieler, die Anmeldehinweise wären also zentriert worden.
     *
     * Deshalb: Keine Regel darf eine Klasse einer eingebetteten Komponente als
     * **Nachfahre** treffen. Mit `>` gebunden ist es in Ordnung — dann muss das
     * Elternteil passen, und die Behälter der fremden Komponente heißen anders.
     */
    const fremd = new Map<string, string[]>();
    for (const datei of ['LoginPanel', 'Sticker', 'MapView']) {
      const quelle = readFileSync(`src/components/${datei}.svelte`, 'utf8');
      // Nur das Markup, nicht der `<style>`-Block: gesucht sind die Klassen, die
      // die Komponente an ihre Knoten schreibt.
      const markup = quelle.slice(0, quelle.lastIndexOf('<style>'));
      for (const m of markup.matchAll(/class="([^"{}]+)"/g)) {
        for (const k of m[1].split(/\s+/).filter(Boolean)) {
          fremd.set(k, [...(fremd.get(k) ?? []), datei]);
        }
      }
    }

    const treffer: string[] = [];
    for (const sel of VERSCHOBEN) {
      // Der letzte Verbinder und das letzte Glied. Nur ein Leerzeichen (Nachfahre)
      // ist gefährlich; `>`, `+` und `~` verlangen ein bestimmtes Elternteil oder
      // Geschwister und können die fremde Komponente nicht von innen treffen.
      const glieder = sel.split(/(?<=[^\s>+~])\s+(?![>+~])/);
      if (glieder.length < 2) continue;
      const letztes = glieder[glieder.length - 1];
      // Genau eine Klasse, nicht weiter eingeschränkt — `.zeile` ist gefährlich,
      // `.zeile.aktiv` oder `.zeile:hover` trifft nichts Fremdes.
      const nur = /^\.([A-Za-z_][\w-]*)$/.exec(letztes);
      if (!nur) continue;
      const woher = fremd.get(nur[1]);
      if (woher) treffer.push(`${sel}  →  .${nur[1]} in ${[...new Set(woher)].join(', ')}`);
    }
    expect(treffer, `Regeln greifen in fremde Komponenten:\n${treffer.join('\n')}`).toEqual([]);
  });

  it('kommt ohne content: aus', () => {
    // Nicht Geschmack, sondern Voraussetzung: der Zähler oben versteht keine
    // Zeichenketten. Ein `content: "{"` würde ihn zerreißen, und die Prüfung auf
    // gebundene Selektoren wäre ab dieser Zeile blind.
    // Auf dem kommentarfreien Text: `content:` steht in dieser Datei mehrfach in
    // erklärenden Kommentaren.
    expect(ohneKommentare(y2k)).not.toMatch(/(?:^|[\s;{])content\s*:/);
  });
});

describe('Freundebuch.svelte nach dem Herauslösen', () => {
  it('holt die gemeinsame Optik als Datei', () => {
    expect(komponente).toContain("import '../styles/y2k.css';");
  });

  it('führt die verschobenen Regeln nicht doppelt', () => {
    /*
     * Zwei Quellen für dieselbe Regel heißt: die nächste Änderung wirkt nur an
     * einer Stelle, und welche gewinnt, hängt an der Reihenfolge der Stylesheets.
     *
     * Die Liste der verschobenen Selektoren wird aus `y2k.css` **abgeleitet** und
     * nicht getippt. Vorher standen hier sieben Namen von Hand — genau die
     * riskanten fehlten (`h1`, `h2`, `.hinweis`, `.zeile`, `.teil`, `.jp`,
     * `.glitzer`, `.klebe`, `.kein`, `.wer`, `.ort`, `.bau`), und eine Doppelung
     * dort wäre unbemerkt geblieben. Abgeleitet wächst die Prüfung mit der Datei.
     *
     * `lastIndexOf` und nicht `indexOf`: stünde das Wort einmal in einem
     * Kommentar im `<script>`, prüfte die Regel unten den Skriptteil.
     */
    const doppelt = VERSCHOBEN
      // Der Selektor ohne das `.y2k`-Präfix ist genau der, der vorher im
      // Komponenten-Stil stand. Verglichen wird der **ganze** Selektor und nicht
      // sein erster Teil: `.y2k .briefe > .hinweis` und ein komponenteneigenes
      // `.briefe` sind verschiedene Regeln, keine Doppelung. Genau daran hat eine
      // erste Fassung dieser Prüfung falschen Alarm geschlagen.
      .map((sel) => sel.replace(/^\.y2k(?:\s+|(?=[.:[]))/, '').trim())
      .filter((sel) => sel && KOMPONENTENSELEKTOREN.has(sel));
    expect([...new Set(doppelt)], 'steht noch im Komponenten-Stil').toEqual([]);
    expect(stilblock).not.toContain('@keyframes');
  });

  it('enthält überhaupt die verschobenen Regeln', () => {
    // Die Prüfung oben ist einseitig: Wäre `y2k.css` leer, fände sie keine
    // Doppelung und wäre grün. Erst mit dieser Zusicherung heißt „nicht doppelt"
    // auch „genau einmal".
    expect(VERSCHOBEN.length).toBeGreaterThan(40);
    for (const erwartet of ['.y2k .polaroid', '.y2k .kopf', '.y2k .strom', '.y2k .laufband']) {
      expect(VERSCHOBEN, `${erwartet} fehlt in y2k.css`).toContain(erwartet);
    }
  });
});

/** Der Markupteil einer Svelte-Datei — alles hinter dem letzten `</script>`. */
const markupVon = (quelle: string) => quelle.slice(quelle.lastIndexOf('</script>'));

describe('Bildfeld.svelte — die gemeinsame Darstellung', () => {
  /*
   * Die Komponente, die beide Ansichten für die Bilder benutzen. Drei
   * Zusicherungen, und jede verteidigt eine Entscheidung, die man sonst
   * versehentlich zurücknimmt.
   */

  it('bringt keinen eigenen Stilblock mit', () => {
    /*
     * Ihre Regeln stehen in `y2k.css`. Ein `<style>` hier wäre eine zweite
     * Quelle für dieselbe Regel, und welche gewinnt, hinge an der Reihenfolge
     * der Stylesheets. Die Prüfung darüber (`führt die verschobenen Regeln nicht
     * doppelt`) sieht nur `Freundebuch.svelte` — eine Doppelung hier wäre ihr
     * entgangen.
     *
     * Geprüft wird das **Markup** und nicht die ganze Datei: Der Kopfkommentar der
     * Komponente erklärt, warum sie keinen Stilblock hat, und nennt dabei das Wort.
     * Eine Prüfung, die daran anschlägt, verbietet das Erklären.
     */
    expect(markupVon(bildfeld)).not.toContain('<style');
  });

  it('enthält nichts Bedienbares', () => {
    /*
     * Die Gästeansicht verspricht, kein `input`, `form` oder `button` zu tragen
     * (`browser-tagebuch.mjs` zählt genau diese Knoten). Sie benutzt diese
     * Komponente — also darf hier keines davon stehen. Sonst bricht das
     * Versprechen an einer Stelle, an der niemand danach sucht.
     */
    for (const tag of ['<input', '<form', '<button', '<select', '<textarea']) {
      expect(markupVon(bildfeld), `${tag} steht in Bildfeld.svelte`).not.toContain(tag);
    }
  });

  it('hat für jede Vorlage eine Regel in y2k.css', () => {
    /*
     * **Abgeleitet aus `VORLAGEN`, nicht getippt.** Eine sechste Vorlage in
     * `src/lib/vorlagen.ts` ohne Regel hier bekäme sonst still die Polaroid-Form:
     * Die Maske zeigte einen Knopf, der Beitrag speicherte eine Kennung, und
     * aussehen würde er wie jeder andere. Niemand sucht den Fehler im CSS.
     *
     * `polaroid` ist ausgenommen und das ist der Punkt seiner Existenz: Es **ist**
     * die Regel `.y2k .polaroid`, die es schon gibt, und braucht keine eigene.
     */
    const selektoren = VERSCHOBEN.join(' ');
    for (const v of VORLAGEN) {
      if (v.id === VORGABE) continue;
      expect(selektoren, `keine Regel für .${v.id} in y2k.css`).toContain(`.${v.id}`);
    }
  });
});
