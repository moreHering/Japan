/**
 * Prüft die öffentliche Gästeansicht unter /Japan/tagebuch/ im echten Browser.
 *
 * Supabase ist aus dieser Umgebung nicht erreichbar. Wie in
 * `browser-freundebuch.mjs` wird deshalb der Zustand des Moduls direkt gesetzt —
 * es ist dasselbe `buch`-Objekt, aus dem die Komponente liest. Geprüft wird damit
 * die **Darstellung** und die Zusicherung „Gäste ändern nichts"; dass die Daten
 * wirklich so aus der Datenbank kommen, prüft das nicht und behauptet es nicht.
 * Dafür steht `supabase/test/schema-test.sql`.
 *
 * Der Kern dieses Tests sind drei Zusicherungen, die keine Datenbank absichern
 * kann, weil sie im Auslieferungsartefakt stecken:
 *
 *   1. Auf der Seite gibt es kein `input`, `textarea`, `form` und keinen
 *      Löschknopf. Selbst wenn eine Policy morgen falsch gesetzt wäre, hätte ein
 *      Gast keine Oberfläche, um sie auszunutzen.
 *   2. Die Seite startet weder Anmeldung noch Abgleich. Ein Reisender, der sie im
 *      angemeldeten Browser öffnet, darf nicht seinen Plan hochschreiben.
 *   3. Die Navigation der App fehlt vollständig — sonst hebelt ein Klick die
 *      Entscheidung „nicht verlinkt" aus.
 *
 *   npx astro dev --port 4322 &   und dann   node test/browser-tagebuch.mjs
 */

import { chromium, devices } from 'playwright';

import { BASIS, START, buchSchreiben } from './browserlauf.mjs';

let fehler = 0;
const pruefe = (bedingung, text, zusatz = '') => {
  if (bedingung) console.log(`  ok    ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  else {
    fehler += 1;
    console.log(`  FEHL  ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  }
};

const browser = await chromium.launch({
  ...START,
});
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const seite = await ctx.newPage();

const meldungen = [];
seite.on('pageerror', (e) => meldungen.push(`pageerror: ${e.message}`));
seite.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|openstreetmap/i.test(m.text())) {
    meldungen.push(m.text());
  }
});

// Welche Module die Seite überhaupt anfordert. Das ist die belastbare Form von
// „kein Import von store.svelte": im Bündel nachzusehen wäre hash-abhängig, hier
// zählt, was der Browser wirklich holt.
const geholt = [];
seite.on('request', (r) => geholt.push(r.url()));

await seite.goto(`${BASIS}/tagebuch/`, { waitUntil: 'load' });
await seite.waitForTimeout(900);

// ======================================================== 1) Kopf der Seite ===

console.log('Kopf und Rahmen:');
pruefe(
  (await seite.locator('meta[name=robots]').getAttribute('content'))?.includes('noindex'),
  'meta robots bittet um noindex',
);
pruefe((await seite.locator('link[rel=manifest]').count()) === 0, 'kein Manifest — die Seite ist keine App');
pruefe((await seite.locator('.topbar').count()) === 0, 'keine App-Titelzeile');
pruefe((await seite.locator('.tabbar').count()) === 0, 'keine App-Navigation unten');
pruefe((await seite.locator('footer.appfuss, .appfuss').count()) === 0, 'kein App-Fuß');
pruefe(
  (await seite.locator('a[href*="/plan/"], a[href*="/orte/"], a[href*="/organisation/"]').count()) === 0,
  'kein Weg von hier in den Planer',
);
pruefe((await seite.locator('.y2k.tagebuch').count()) === 1, 'die Y2K-Hülle steht');

// =========================================== 2) Die harte Zusicherung: lesen ===

console.log('\nGäste ändern nichts (unabhängig von der Datenbank):');
/*
 * Über `document.querySelectorAll` und **nicht** über Playwrights Selektoren:
 * Letztere durchstoßen Shadow-Grenzen. Der Entwicklungsserver hängt eine
 * `astro-dev-toolbar` in die Seite, und darin stecken zwei Checkboxen und eine
 * Auswahlliste — die erste Fassung dieses Tests hat dreimal Alarm geschlagen für
 * Knoten, die im Auslieferungsartefakt gar nicht vorkommen. Gesucht sind die
 * Knoten, die **diese Seite** rendert, also das Light DOM.
 */
for (const [wahl, name] of [
  ['input', 'Eingabefeld'],
  ['textarea', 'Textfeld'],
  ['form', 'Formular'],
  ['button.weg', 'Löschknopf'],
  ['input[type=file]', 'Dateiwahl'],
  ['select', 'Auswahlliste'],
  ['[contenteditable]', 'beschreibbarer Bereich'],
]) {
  const n = await seite.evaluate((w) => document.querySelectorAll(w).length, wahl);
  pruefe(n === 0, `kein ${name} auf der Seite`, n ? `${n} gefunden` : '');
}

console.log('\nKein Abgleich, keine Anmeldung:');
pruefe((await seite.locator('.syncbadge, .sync').count()) === 0, 'kein SyncBadge-Knoten');
pruefe(
  (await seite.evaluate(() => localStorage.getItem('japan2026:plan'))) === null,
  'der Plan im localStorage bleibt leer',
);
const storeGeholt = geholt.filter((u) => /\/lib\/(store|sync)\.svelte/.test(u));
pruefe(storeGeholt.length === 0, 'weder store.svelte noch sync.svelte werden geladen', storeGeholt.join(' '));

// ================================================== 3) Inhalt: Zustand setzen ===

console.log('\nMit Inhalt:');
/*
 * Über den Prüfhaken `window.__buch` und **nicht** über
 * `import('/src/lib/freundebuch.svelte.ts')`. Vite bedient dasselbe Modul unter
 * mehreren URLs; ein Import ohne das `?v=<hash>` der Insel ist eine zweite
 * Instanz mit eigenem `$state`, und der Zustand kommt nie in der Komponente an.
 * Gemessen: Die Suite lief, eine Änderung an einer **anderen** Datei genügte, und
 * sie fiel. Die ausführliche Begründung steht an `buchSchreiben()` in
 * `browserlauf.mjs`.
 */
{
  /** Ein 1×1-Pixel als Daten-URL — lädt ohne Netz und löst kein `onerror` aus. */
  const PIXEL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  const PERSONEN = [
    { id: 'aaaa', name: 'Paule', farbe: '#C6402B' },
    { id: 'bbbb', name: 'Deggel', farbe: '#3E6B5E' },
    { id: 'cccc', name: 'Baldes', farbe: '#A67C33' },
  ];
  const STECKBRIEFE = { bbbb: { essen: 'Okonomiyaki', ort: 'Kanazawa, der Garten' } };
  const b = (t) => ({
    ortNr: null, ortName: null, ortLat: null, ortLng: null,
    sticker: null, bildPfad: null, bildUrl: null,
    bildPfade: [], bildUrls: [], vorlage: null, ...t,
  });
  const BEITRAEGE = [
    // Vor der Reise — muss in einen eigenen Eimer und darf nicht verschwinden.
    b({ id: 'v1', text: 'Koffer steht.', datum: '2026-09-20', autorId: 'aaaa',
        erstellt: '2026-09-20T10:00:00Z' }),
    // Tag 1, mit Ort über die Nummer.
    b({ id: 'p1', text: 'Erster Abend in Osaka.', datum: '2026-09-26', ortNr: 8,
        sticker: 'ramen', autorId: 'aaaa', erstellt: '2026-09-26T20:00:00Z' }),
    /*
     * Zwei Beiträge am **selben** mitgeschriebenen Ort — daraus wird eine Marke mit
     * beiden im Popup, nicht zwei übereinanderliegende.
     *
     * Der Ortsname trägt absichtlich Markup: Bei selbst angelegten Orten kommt er
     * aus einem Eingabefeld, nicht aus places.json. Ohne das `<b>` war die
     * Maskierung des Ortsnamens im Browser ungeprüft — in vitest ist sie abgedeckt,
     * hier war sie es nicht, und die Gegenprobe hat es gezeigt.
     */
    b({ id: 'p2', text: 'Kuromon, erster Gang.', datum: '2026-09-27',
        ortName: 'Kuromon<b>-</b>Ichiba', ortLat: 34.6656, ortLng: 135.5061,
        // Absichtlich Paule und nicht Deggel: So hat **Deggel keinen einzigen
        // Beitrag**, und die Zusicherung „wer nichts geschrieben hat, steht mit
        // null da" wird wirklich geprüft. Vorher hatten alle drei Beiträge, und die
        // Prüfung war grün, auch wenn die Person weggefiltert worden wäre.
        sticker: 'sushi', autorId: 'aaaa', erstellt: '2026-09-27T09:00:00Z' }),
    /*
     * Rohes Markup im Text des **zweiten Kuromon-Beitrags**. Das ist der
     * wichtigste Datensatz hier: Ohne ihn war die Prüfung „im Popup steckt kein
     * rohes Markup" grün, auch als `escape()` in `popupHtml()` entfernt war — sie
     * prüfte nichts. Der Text kommt aus einem Eingabefeld, Leaflet nimmt
     * Popup-Inhalte als Zeichenkette, und die Seite ist öffentlich.
     *
     * Bewusst in einem Beitrag, dessen Popup der Test ohnehin öffnet, und nicht an
     * einem eigenen Ort: Bei Übersichtszoom liegen die Osaka-Marken so nah
     * beieinander, dass eine die andere für Klicks abfängt — ein Test, der einen
     * bestimmten Marker treffen muss, wird davon unzuverlässig.
     */
    b({ id: 'p3', text: 'Kuromon, zweiter Gang. <script>window.__geknackt=1;<\/script><img src=x onerror="window.__geknackt=2">',
        datum: '2026-09-27',
        ortName: 'Kuromon<b>-</b>Ichiba', ortLat: 34.6656, ortLng: 135.5061,
        sticker: 'sushi', autorId: 'cccc', erstellt: '2026-09-27T11:00:00Z' }),
    /*
     * Eine Collage — damit die Vorlagen **auch auf der Gästeseite** geprüft sind.
     *
     * Beide Ansichten benutzen `Bildfeld.svelte`, aber sie bauen das `<article>`
     * darum selbst. Eine Prüfung nur im Freundebuch hätte offengelassen, ob die
     * Gästeseite die Vorlagenklasse überhaupt setzt — und dort lesen die Freunde.
     *
     * Die Bilder sind Daten-URLs: Jeder fremde Host ist hier gesperrt, eine echte
     * Adresse löste `onerror` aus, und das markiert den Beitrag als „Bild lässt
     * sich nicht laden". Die Prüfung hätte den Fehlerfall gemessen.
     */
    b({ id: 'c1', text: 'Vier Ecken von Dotonbori.', datum: '2026-09-27',
        bildPfad: 'x/1.png', bildUrl: PIXEL,
        bildPfade: ['x/1.png', 'x/2.png', 'x/3.png'],
        bildUrls: [PIXEL, PIXEL, PIXEL], vorlage: 'collage',
        autorId: 'aaaa', erstellt: '2026-09-28T19:00:00Z' }),
    // Nach der Reise — der zweite Rand-Eimer.
    b({ id: 'n1', text: 'Wieder da.', datum: '2026-10-20', autorId: 'aaaa',
        erstellt: '2026-10-20T08:00:00Z' }),
  ];
  // Der Statuswert heißt `bereit` (siehe `BuchStatus` in freundebuch.svelte.ts) —
  // ein falscher Wert lässt die Komponente im Ladezustand stehen und alle
  // Inhaltsprüfungen unten schlagen an, ohne dass etwas kaputt ist.
  // Die `5` ist die Quittung: So viele Beiträge müssen danach stehen.
  await buchSchreiben(
    seite,
    { personen: PERSONEN, steckbriefe: STECKBRIEFE, beitraege: BEITRAEGE, status: 'bereit' },
    6,
  );
}
await seite.waitForTimeout(700);

pruefe((await seite.locator('.polaroid').count()) === 6, 'ein Polaroid je Beitrag',
  `${await seite.locator('.polaroid').count()}`);

/*
 * **Die Vorlage wirkt auch hier — und die Seite bleibt unbedienbar.**
 *
 * Beide Ansichten benutzen `Bildfeld.svelte`, bauen das `<article>` darum aber
 * selbst. Ohne diese Prüfung wäre offen, ob die Gästeseite die Vorlagenklasse
 * überhaupt setzt; dort lesen die Freunde.
 */
{
  const c = await seite.evaluate(() => {
    const art = [...document.querySelectorAll('.strom .polaroid')].find((n) =>
      (n.textContent ?? '').includes('Vier Ecken'),
    );
    if (!art) return null;
    const bild = art.querySelector('.bilder img');
    return {
      klassen: art.className,
      bilder: art.querySelectorAll('.bilder img').length,
      verhaeltnis: bild ? getComputedStyle(bild).aspectRatio : null,
      // Nichts Bedienbares in der gemeinsamen Komponente — sonst bricht das
      // Versprechen dieser Seite an einer Stelle, an der niemand danach sucht.
      bedienbar: art.querySelectorAll('input, button, form, select, textarea').length,
    };
  });
  pruefe(c !== null, 'der Collagen-Beitrag steht auf der Gästeseite');
  if (c) {
    pruefe(c.klassen.includes('collage'), 'er trägt die Vorlagenklasse', c.klassen);
    pruefe(c.bilder === 3, 'und zeigt seine drei Bilder', `${c.bilder}`);
    pruefe(
      c.verhaeltnis === '1 / 1',
      'im Quadrat der Collage, nicht im 4:3 des Polaroids',
      String(c.verhaeltnis),
    );
    pruefe(c.bedienbar === 0, 'und bringt nichts Bedienbares mit', `${c.bedienbar} Knoten`);
  }
}

const koepfe = await seite.locator('.tagkopf').allInnerTexts();
pruefe(koepfe.length === 4, 'vier Gruppen: vor der Reise, Tag 1, Tag 2, danach', `${koepfe.length}`);
pruefe(/Vor der Reise/.test(koepfe[0] ?? ''), 'die Vorfreude steht oben und fällt nicht aus der Liste');
pruefe(/Nach der Reise/.test(koepfe.at(-1) ?? ''), 'der Nachklang steht unten');
pruefe(/Tag 1\b/.test(koepfe[1] ?? ''), 'danach Tag 1 — vorwärts, nicht rückwärts', koepfe[1]?.replace(/\s+/g, ' '));
pruefe(
  (await seite.locator('.tagkopf.rand').count()) === 2,
  'die zwei Rand-Eimer sind als solche gekennzeichnet',
);
pruefe((await seite.locator('.sprung a, .sprung').count()) >= 1, 'es gibt den Sprung zum Neuesten');

// Reihenfolge innerhalb eines Tages: nach Zeitstempel aufsteigend.
const tag2 = await seite.locator('.tag').nth(2).locator('.polaroid p').allInnerTexts();
pruefe(
  /erster Gang/.test(tag2[0] ?? '') && /zweiter Gang/.test(tag2[1] ?? ''),
  'innerhalb eines Tages aufsteigend nach Uhrzeit',
  tag2.join(' | '),
);

// ==================================================== 4) Kennzahlen mit Zahlen ===

console.log('\nKennzahlen:');
const zahlen = (await seite.locator('.zahl').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const finde = (wort) => zahlen.find((t) => t.toLowerCase().includes(wort));
pruefe(zahlen.some((t) => /\b20\b/.test(t)), '20 Reisetage', finde('tage'));
pruefe(zahlen.some((t) => /\b19\b/.test(t)), '19 Nächte — nicht mit den 20 Tagen verwechselt', finde('nächte'));
pruefe(zahlen.some((t) => /\b6\b/.test(t)), '6 Stationen');
pruefe(zahlen.some((t) => /\b6\b/.test(t)), '6 Beiträge insgesamt');
const jePerson = await seite.locator('.jeperson li').allInnerTexts();
pruefe(jePerson.length === 3, 'alle drei Personen stehen da, auch ohne Beitrag',
  `${jePerson.length}`);
// Deggel hat in den Daten oben absichtlich keinen Beitrag — die Null muss
// sichtbar dastehen, nicht die Zeile fehlen.
pruefe(
  jePerson.some((t) => /Deggel/.test(t) && /\b0\b/.test(t)),
  'wer nichts geschrieben hat, steht mit null da',
  jePerson.map((t) => t.replace(/\s+/g, ' ')).join(' / '),
);
// Und absteigend sortiert: Paule (4) vor Baldes (1) vor Deggel (0).
pruefe(
  /Paule/.test(jePerson[0] ?? '') && /Deggel/.test(jePerson.at(-1) ?? ''),
  'absteigend nach Zahl der Beiträge',
);
pruefe(
  !(await seite.locator('.tagebuch').innerText()).match(/von 164 Orten|Kilometer|km gelaufen|Schritte/),
  'behauptet keine besuchten Orte, Kilometer oder Schritte',
);

// ========================================================== 5) Karte und Route ===

console.log('\nKarte:');
await seite.waitForSelector('.leaflet-container', { timeout: 8000 });
pruefe(true, 'Leaflet ist da');
pruefe((await seite.locator('.jp-marker').count()) === 0, 'kein einziger Reiseführer-Marker der 164');
const marken = await seite.locator('.jp-marke').count();
// Zwei, nicht drei: Die beiden Kuromon-Beiträge teilen eine Koordinate und
// bekommen eine gemeinsame Marke. Marken je Beitrag würden einander verdecken.
// Zwei Orte: Nr. 8 (einmal beschrieben) und Kuromon (zweimal, eine Marke) —
// die beiden Rand-Beiträge haben keinen Ort.
pruefe(marken === 2, 'eine Marke je Ort, nicht je Beitrag', `${marken}`);
const kreise = await seite.locator('.jp-marke').allInnerTexts();
pruefe(kreise.some((t) => t.trim() === '2·2'), 'der gebündelte Ort zeigt die Anzahl im Kreis',
  kreise.map((t) => t.trim()).join(' '));
pruefe((await seite.locator('path.leaflet-interactive').count()) >= 1, 'die Route ist als Linie gezeichnet');

/*
 * Die Zusicherung, um die es hier geht: Zwei Beiträge über dasselbe Lokal sind
 * **beide** erreichbar. Eine Marke je Beitrag wäre das nicht — Leaflet errechnet
 * den z-Index aus der Bildschirm-y-Position, bei gleicher Koordinate deckt der
 * später gebaute Marker den früheren ab und der untere nimmt keine Klicks an.
 *
 * Ein erster Anlauf hat das mit einem geografischen Versatz gelöst, und dieser
 * Test hat ihn widerlegt: `0.00016°` sind bei Zoomstufe 15 rund 3,7 Pixel bei 26
 * Pixel Markerbreite, in der Übersichtsansicht (ganz Japan) weit unter einem
 * Pixel. Dazu erfindet ein Versatz einen Ort, an dem nichts ist. `markenFuer()`
 * bündelt deshalb — hier wird geprüft, dass dabei kein Eintrag verloren geht.
 *
 * **Nur ein Klick.** Leaflet schaltet Popups um; ein zweiter Klick auf denselben
 * Marker schließt es wieder. Eine erste Fassung hat hier zweimal geklickt und
 * danach 30 Sekunden auf ein Popup gewartet, das sie selbst zugemacht hatte.
 */
await seite.locator('.jp-marke').filter({ hasText: '2·2' }).click({ timeout: 3000 });
await seite.waitForSelector('.leaflet-popup-content', { timeout: 5000 });
await seite.waitForTimeout(300);
const popup = (await seite.locator('.leaflet-popup-content').innerText()).replace(/\s+/g, ' ');
pruefe(/Tag 2 · 27\.09\.2026/.test(popup), 'das Popup nennt Reisetag und Datum', popup.slice(0, 60));
pruefe(/erster Gang/.test(popup), 'der erste Beitrag steht im Popup');
pruefe(/zweiter Gang/.test(popup), 'der zweite Beitrag steht im selben Popup — nichts verdeckt');
pruefe(
  popup.indexOf('erster Gang') < popup.indexOf('zweiter Gang'),
  'in der Reihenfolge des Schreibens',
);
pruefe(
  (popup.match(/Kuromon<b>-<\/b>Ichiba/g) ?? []).length === 1,
  'der Ortsname steht einmal, nicht je Eintrag — und maskiert, als Text',
);
pruefe(
  (await seite.locator('.leaflet-popup-content strong b').count()) === 0,
  'das <b> im Ortsnamen wurde kein Element',
);
pruefe(/Paule/.test(popup) && /Baldes/.test(popup),
  'beide Personen sind genannt — die Farbe des Kreises kann nur eine zeigen');
pruefe(
  (await seite.locator('.leaflet-popup-content .tb-popup-eintrag').count()) === 2,
  'zwei getrennte Einträge im Popup',
);
// Die Popup-Optik kommt über `:global()` aus Tagebuch.svelte. Ohne sie rendert
// Leaflet die Knoten unformatiert, und niemandem fällt es auf — beim
// Zusammenbauen der Seite hatte ich genau diese Regeln vergessen.
const trenner = await seite
  .locator('.leaflet-popup-content .tb-popup-eintrag')
  .nth(1)
  .evaluate((n) => getComputedStyle(n).borderTopStyle);
pruefe(trenner === 'dashed', 'die Einträge sind sichtbar getrennt', trenner);
/*
 * Die XSS-Zusicherung, und zwar an Daten, die sie auf die Probe stellen: Ein
 * Beitrag oben trägt `<script>` und ein `<img onerror=…>` im Text. Ohne diesen
 * Datensatz war diese Prüfung grün, auch als ich `escape()` in `popupHtml()`
 * entfernt hatte — sie prüfte nichts.
 *
 * Geprüft wird an drei Stellen, weil jede allein zu wenig ist: Das Markup steht
 * maskiert im Text, es gibt keinen entsprechenden Knoten im Popup, und die
 * globale Variable, die das eingeschmuggelte Skript setzen würde, ist nicht da.
 */
const roh = await seite.locator('.leaflet-popup-content').innerHTML();
pruefe(/&lt;script&gt;/.test(roh), 'das <script> im Beitragstext kommt maskiert an',
  roh.replace(/\s+/g, ' ').slice(0, 90));
pruefe(
  (await seite.locator('.leaflet-popup-content script, .leaflet-popup-content img').count()) === 0,
  'kein Skript- und kein Bildknoten aus dem Beitragstext im Popup',
);
pruefe(
  (await seite.evaluate(() => window.__geknackt)) === undefined,
  'das eingeschmuggelte Skript ist nicht gelaufen',
  String(await seite.evaluate(() => window.__geknackt)),
);
// Und derselbe Text im Bilderstrom: dort rendert Svelte ihn als Textknoten, was
// von sich aus sicher ist — geprüft, weil „von sich aus sicher" eine Annahme ist.
pruefe(
  (await seite.locator('.strom script, .strom img[src="x"]').count()) === 0,
  'auch im Bilderstrom wird der Text nicht zu Markup',
);

// ======================================================= 6) Steckbriefe, lesend ===

console.log('\nSteckbriefe:');
pruefe((await seite.locator('.brief').count()) === 3, 'drei Steckbriefe');
pruefe((await seite.locator('.brief input, .brief textarea, .brief button').count()) === 0,
  'keiner davon ist bearbeitbar');
pruefe((await seite.locator('.brief').first().innerText()).length > 0, 'sie zeigen Inhalt');


// ============================ 7) Das CSS-Leck: LoginPanel behält seine Optik ===

console.log('\nCSS-Grenze zu fremden Komponenten (/freundebuch/):');
const buch = await ctx.newPage();
await buch.goto(`${BASIS}/freundebuch/`, { waitUntil: 'load' });
await buch.waitForTimeout(900);
// Ohne Supabase steht dort der Kasten „keine Verbindung" und kein LoginPanel.
// Der Zustand lässt sich setzen — dieselbe Technik wie oben.
// Auch hier der Prüfhaken; ohne Quittung, weil dieser Zustand gerade **keine**
// Beiträge zeigen soll.
await buchSchreiben(buch, { status: 'abgemeldet' });
const lp = buch.locator('.loginbox .zeile').first();
if ((await lp.count()) === 0) {
  fehler += 1;
  console.log('  FEHL  LoginPanel rendert nicht — die CSS-Grenze bleibt ungeprüft');
} else {
  const stil = await lp.evaluate((n) => {
    const s = getComputedStyle(n);
    return { size: s.fontSize, align: s.textAlign, col: s.gridColumnStart };
  });
  // `.y2k .zeile` setzte 0.66rem ≈ 10.56px und `#6b5f78`; LoginPanel will 0.78rem.
  pruefe(parseFloat(stil.size) > 11, 'die LoginPanel-Zeile behält ihre eigene Schriftgröße', stil.size);
  pruefe(stil.align !== 'center', 'der Anmeldehinweis ist nicht zentriert', stil.align);
  const b = buch.locator('.loginbox b').first();
  if ((await b.count()) > 0) {
    pruefe(
      (await b.evaluate((n) => getComputedStyle(n).display)) !== 'block',
      'das <b> im LoginPanel wird nicht zum Block gemacht',
    );
  }
}
await buch.close();

// ================================================================ 8) Layout ===

console.log('\nLayout bei 390 px:');
const quer = await seite.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
pruefe(!quer, 'kein Querscrollen');

console.log('\nFehlermeldungen der Seite:');
pruefe(meldungen.length === 0, 'keine Fehler in der Konsole', meldungen.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
