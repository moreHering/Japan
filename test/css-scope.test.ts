/**
 * Prüfstand für das Binden eines fremden Stylesheets an einen Container.
 *
 * Warum das eigene Prüfungen verdient: Der Reiseband liegt jetzt **im** Planer.
 * Sein CSS führt `:root`, `html`, `body`, `.eyebrow` und `.wrap` — Namen, die
 * die App selbst benutzt. Ein Präfix, das an einer Stelle nicht greift, lackiert
 * die ganze Anwendung um; eines, das zu viel greift, lässt den Text aussehen wie
 * den Rest der Seite. Beides sieht man nicht im Build, sondern erst im Browser,
 * und dann sucht man lange.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { scope } from '../scripts/css-scope.mjs';

/**
 * Bewusst über das Dateisystem und nicht als `?raw`-Import: Vitest behandelt
 * CSS eigens und liefert für `.css?raw` einen Leerstring — der Test wäre dann
 * grün, ohne etwas geprüft zu haben. Genau die Sorte Prüfung, die man sich
 * sparen kann.
 */
const bandStil = readFileSync('src/data/reiseband-stil.css', 'utf8');

const B = '.bandtext';

describe('Stylesheet an einen Container binden', () => {
  it('stellt gewöhnliche Selektoren voran', () => {
    expect(scope('.chapter h2{color:red}', B)).toBe('.bandtext .chapter h2{color:red}');
  });

  it('behandelt jede Selektorgruppe einzeln', () => {
    expect(scope('h1, h2 , .a>.b{x:1}', B)).toBe('.bandtext h1, .bandtext h2, .bandtext .a>.b{x:1}');
  });

  it('macht aus :root, html und body den Container selbst', () => {
    // Entscheidend: NICHT `.bandtext :root`. Als Nachfahre wäre die Regel
    // wirkungslos, und die Schriftgröße des Bandes käme nie an.
    expect(scope(':root{--shu:#C6402B}', B)).toBe('.bandtext{--shu:#C6402B}');
    expect(scope('html{scroll-behavior:smooth}', B)).toBe('.bandtext{scroll-behavior:smooth}');
    expect(scope('body{font-size:18px}', B)).toBe('.bandtext{font-size:18px}');
  });

  it('behält bei body.klasse den Zusatz', () => {
    expect(scope('body.gedruckt{margin:0}', B)).toBe('.bandtext.gedruckt{margin:0}');
  });

  it('lässt bei body .kind den Rahmen weg und behält die Kindbeziehung', () => {
    expect(scope('body .kind{margin:0}', B)).toBe('.bandtext .kind{margin:0}');
    // `html > .kind` wird `.bandtext > .kind`, nicht `.bandtext .kind`. Der
    // Inhalt hängt als unmittelbares Kind im Container, also bleibt die
    // Beziehung gültig — und sie fallen zu lassen würde die Regel auf beliebig
    // tief verschachtelte Elemente ausweiten. Im echten Stylesheet des Bandes
    // kommt dieser Fall nicht vor; geprüft wird er, damit er nicht beim
    // nächsten Textumbau zur Falle wird.
    expect(scope('html > .kind{margin:0}', B)).toBe('.bandtext > .kind{margin:0}');
  });

  it('geht in @media hinein', () => {
    expect(scope('@media (max-width:600px){body{font-size:16px}.a{x:1}}', B)).toBe(
      '@media (max-width:600px){.bandtext{font-size:16px}\n.bandtext .a{x:1}}',
    );
  });

  it('lässt @keyframes unangetastet', () => {
    // `from` und `to` sind keine Selektoren. Ein Präfix davor macht die
    // Animation still kaputt — sie läuft dann einfach nicht.
    const k = '@keyframes blink{from{opacity:0}to{opacity:1}}';
    expect(scope(k, B)).toBe(k);
  });

  it('lässt @font-face unangetastet', () => {
    const f = "@font-face{font-family:'X';src:url(a.woff2)}";
    expect(scope(f, B)).toBe(f);
  });

  it('wirft @page weg', () => {
    // Seitenränder für den Druck gehören dem eigenständigen Dokument. In einem
    // Abschnitt einer größeren Seite würden sie deren Druckbild verstellen.
    expect(scope('@page{margin:2cm}.a{x:1}', B)).toBe('.bandtext .a{x:1}');
  });

  it('lässt sich von einer Klammer in einer Zeichenkette nicht zerreißen', () => {
    // Genau hier scheitert jeder naive Ansatz mit einem einzigen Regex.
    const css = '.a::before{content:"{"}\n.b{x:1}';
    expect(scope(css, B)).toBe('.bandtext .a::before{content:"{"}\n.bandtext .b{x:1}');
  });

  it('lässt sich von einer Klammer in einem Kommentar nicht zerreißen', () => {
    const css = '/* } nicht zählen */\n.a{x:1}';
    expect(scope(css, B)).toBe('.bandtext .a{x:1}');
  });

  it('kommt mit verschachtelten Klammern in Werten zurecht', () => {
    const css = '.a{width:calc(100% - var(--x, 10px))}';
    expect(scope(css, B)).toBe('.bandtext .a{width:calc(100% - var(--x, 10px))}');
  });

  it('das ausgelieferte Stylesheet ist vollständig gebunden', () => {
    // Geprüft wird die **erzeugte** Datei, nicht nur die Funktion: Sie ist es,
    // die in die Seite kommt. Als `?raw` geladen, damit der Test keinen
    // Dateizugriff braucht — und damit er bricht, wenn `npm run data` die Datei
    // nicht mehr schreibt.
    const gebunden = bandStil;

    // Keine Regel darf ohne Container dastehen — sonst greift sie in die App.
    const ohne = [...gebunden.matchAll(/(?:^|\n)([^@\s][^{}\n]*)\{/g)]
      .map((m) => m[1].trim())
      .filter((s) => !s.startsWith(B));
    expect(ohne, `ungebundene Selektoren: ${ohne.slice(0, 5).join(' | ')}`).toEqual([]);

    // Und kein `:root`, `html` oder `body` darf übrig sein.
    expect(gebunden).not.toMatch(/(?:^|[\s,{])(?::root|html|body)[\s,{]/);

    // Die Tokens des Bandes müssen am Container hängen, sonst ist der Text farblos.
    expect(gebunden).toMatch(/\.bandtext\{[^}]*--washi/);
  });
});
