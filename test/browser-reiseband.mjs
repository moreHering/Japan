/**
 * Prüft, dass der Reiseband auf der Startseite steht, lesbar ist — und dass sein
 * Stylesheet die App nicht umlackiert hat.
 *
 * Der zweite Teil ist der wichtigere. Das CSS des Bandes führt `:root`, `html`,
 * `body`, `.eyebrow` und `.wrap`, also Namen, die die App selbst benutzt. Beim
 * Einbetten wird es an `.bandtext` gebunden; greift die Bindung an einer Stelle
 * nicht, verändert sich die ganze Anwendung — und das fällt im Build nicht auf.
 *
 *   node test/browser-reiseband.mjs
 */

import { chromium, devices } from 'playwright';
import { readFileSync } from 'node:fs';

import { BASIS, START } from './browserlauf.mjs';
const iPhone = devices['iPhone 13'];

let fehler = 0;
const pruefe = (bedingung, text, zusatz = '') => {
  if (bedingung) {
    console.log(`  ok    ${text}`);
  } else {
    fehler += 1;
    console.log(`  FEHL  ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  }
};

const kapitel = JSON.parse(readFileSync('src/data/chapters.json', 'utf8'));
/*
 * Die Projektdaten, gegen die der Deckel, die Leiste und die Planer-Knöpfe
 * geprüft werden. Abgeleitet statt getippt: Eine Prüfung, die „19 Nächte" im
 * Quelltext stehen hat, ist nach der ersten Planänderung falsch — und zwar
 * gleichzeitig mit der Seite, sodass sie grün bleibt.
 */
const trip = JSON.parse(readFileSync('src/data/trip.json', 'utf8'));
// Die sechs Stationen des Bandes — die Zwischennacht in Kawaguchiko steht in
// stations.json, ist aber ausdrücklich keine Station des Bandes.
const stationen = JSON.parse(readFileSync('src/data/stations.json', 'utf8')).filter(
  (s) => !s.zwischennacht,
);
const orte = JSON.parse(readFileSync('src/data/places.json', 'utf8'));

const browser = await chromium.launch({
  ...START,
});
const ctx = await browser.newContext({ ...iPhone });
const seite = await ctx.newPage();

const meldungen = [];
seite.on('console', (m) => {
  if (m.type() === 'error') meldungen.push(m.text());
});
seite.on('pageerror', (e) => meldungen.push(`pageerror: ${e.message}`));

// ============================================ 1) Der Text liegt vorn und liest ===

console.log('\nDer Band auf der Startseite:');
await seite.goto(`${BASIS}/`, { waitUntil: 'networkidle' });
await seite.waitForTimeout(700);

const mass = await seite.evaluate(() => {
  const bt = document.querySelector('.bandtext');
  if (!bt) return null;
  const p = [...bt.querySelectorAll('p')].find((e) => (e.textContent ?? '').length > 120);
  const cs = p ? getComputedStyle(p) : null;
  return {
    absaetze: bt.querySelectorAll('p').length,
    /*
     * `details.kap[id]` und nicht mehr `section[id]`: Seit der Band ein Akkordeon
     * ist, trägt die Klappe den Anker. **Gezählt wird bewusst innerhalb von
     * `.bandtext`** — das ist die Zusicherung, die einen Fehler gefunden hat, den
     * keine Zählung fand: Ein Schnitt mitten durch ein `<div>` ließ den
     * HTML-Parser den Behälter vorzeitig schließen, und ab Kyoto standen sechs von
     * elf Kapiteln daneben statt darin. Die Bilanz der Datei war dabei
     * ausgeglichen, `document.querySelectorAll('details.kap')` hätte elf gemeldet.
     */
    kapitel: bt.querySelectorAll('details.kap[id]').length,
    kapitelImDokument: document.querySelectorAll('details.kap[id]').length,
    teile: bt.querySelectorAll('details.teil').length,
    offen: bt.querySelectorAll('details.kap[open]').length,
    zeichen: (bt.textContent ?? '').length,
    schriftgroesse: cs ? parseFloat(cs.fontSize) : 0,
    zeilenhoehe: cs ? parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) : 0,
    schrift: cs ? cs.fontFamily.split(',')[0].replace(/["']/g, '') : '',
    // Erstes Kapitel möglichst früh: Der Text ist die Hauptsache.
    ersterKapitelY: Math.round(
      (bt.querySelector('details.kap[id]')?.getBoundingClientRect().top ?? 0) + window.scrollY,
    ),
    /*
     * `.m-cover` zuerst: Seit dem 22.09.2026 heißt der Deckel so. Die alte Liste
     * fiel auf `.wrap` zurück, und `.wrap` beginnt **hinter** Deckel und Leiste —
     * gemessen wurden 810 px, also der Textanfang, und die Zusicherung „die
     * Titelseite steht im ersten Bildschirm" prüfte etwas anderes als ihr Name.
     */
    deckelY: Math.round(
      (bt.querySelector('.m-cover, .cover2, .wrap')?.getBoundingClientRect().top ?? 9999) +
        window.scrollY,
    ),
  };
});

pruefe(mass !== null, 'der Bandtext steht auf der Seite');
if (!mass) {
  await browser.close();
  process.exit(1);
}

pruefe(mass.kapitel === kapitel.length, `alle ${kapitel.length} Kapitel sind da`, String(mass.kapitel));
pruefe(
  mass.kapitel === mass.kapitelImDokument,
  'und alle liegen **in** .bandtext, keines daneben',
  `${mass.kapitel} drin von ${mass.kapitelImDokument} im Dokument`,
);
// Sechs Stationen à drei Abschnitte plus Osakas Tagesausflug.
pruefe(mass.teile === 19, 'die sechs Stationen sind in 19 Abschnitte geteilt', String(mass.teile));
pruefe(
  mass.offen === 1,
  'genau ein Kapitel steht offen — elf zugeklappte Zeilen sähen nach Ladefehler aus',
  String(mass.offen),
);
pruefe(mass.absaetze > 100, 'der Text ist vollständig, nicht angerissen', `${mass.absaetze} Absätze`);
// 90.000, nicht 100.000: Die „137 kB" aus der Skriptausgabe sind Markup. Der
// reine Text hat 99.046 Zeichen — meine erste Schwelle war schlicht falsch
// gesetzt und hätte bei jedem Textumbau grundlos angeschlagen.
pruefe(mass.zeichen > 90000, 'über 90.000 Zeichen reiner Text', String(mass.zeichen));

// Lesbarkeit: unter 16 px zoomt iOS beim Antippen und es liest sich schlecht.
pruefe(
  mass.schriftgroesse >= 16,
  'die Schrift ist mindestens 16 px groß',
  `${mass.schriftgroesse} px`,
);
pruefe(
  mass.zeilenhoehe >= 1.5,
  'der Zeilenabstand taugt zum Lesen',
  String(Math.round(mass.zeilenhoehe * 100) / 100),
);
pruefe(
  mass.schrift === 'Spectral',
  'die Leseschrift des Bandes ist angekommen, nicht die der App',
  mass.schrift,
);
pruefe(
  mass.ersterKapitelY < 1400,
  'das erste Kapitel beginnt weit oben, ohne Umweg',
  `${mass.ersterKapitelY} px`,
);
// Das ist die eigentliche Forderung: Der Band liegt vorne. Seine Titelseite muss
// im ersten Bildschirm stehen, nicht hinter Vorgeplänkel der App.
pruefe(
  mass.deckelY < 360,
  'die Titelseite des Bandes steht im ersten Bildschirm',
  `${mass.deckelY} px`,
);

// Kein Umweg über Kacheln.
pruefe(
  (await seite.locator('.leseband .kap').count()) === 0,
  'die anklickbaren Kapitelkacheln sind weg',
);

// ============================== Der mobile Deckel und die Stationsleiste ===

/*
 * Die drei Formen, die am 22.09.2026 aus der gesendeten Vorlage übernommen
 * wurden. Geprüft wird jede an dem, was sie leisten soll — nicht daran, dass sie
 * existiert.
 */
console.log('\nDer Deckel im mobilen Format:');
{
  const deckel = await seite.evaluate(() => {
    const d = document.querySelector('.bandtext .m-cover');
    if (!d) return null;
    const s = getComputedStyle(d);
    const bt = document.querySelector('.bandtext');
    const r = d.getBoundingClientRect();
    return {
      /*
       * **Echt breiter, nicht gleich breit.**
       *
       * Erste Fassung verlangte `>=`. Damit bestand die Prüfung auch ohne den
       * randlosen Rand — der Deckel war dann genau so breit wie der Textbereich,
       * und `>=` ist dafür wahr. Die Gegenprobe hat es gezeigt: Regel entfernt,
       * Prüfung weiter grün. Verlangt wird jetzt, dass er über den Textbereich
       * hinausragt und links am Schirmrand steht.
       */
      breiter: r.width > bt.clientWidth,
      breite: Math.round(r.width),
      textbreite: bt.clientWidth,
      linksAmRand: Math.round(r.left) <= 0,
      dunkel: s.backgroundImage.includes('gradient'),
      kpi: [...d.querySelectorAll('.kpi b')].map((b) => b.textContent.trim()),
      zeichen: (d.querySelector('.bigk') || {}).textContent,
      akzent: !!d.querySelector('h1 em'),
    };
  });
  pruefe(deckel !== null, 'der Deckel steht als .m-cover auf der Seite');
  if (deckel) {
    /*
     * Randlos, und das ist keine Kosmetik: In der Quelle steckt der Deckel in
     * `.wrap` mit 26 px Innenabstand. Dort gelassen wäre die dunkle Fläche eine
     * Karte mit hellem Rand ringsum statt einer Titelseite. `mobilerDeckel()`
     * holt ihn heraus, und das ist die Zusicherung darauf.
     */
    pruefe(
      deckel.breiter && deckel.linksAmRand,
      'er läuft über die volle Breite, ist keine Karte im Text',
      `${deckel.breite} px bei ${deckel.textbreite} px Textbreite, linke Kante ${deckel.linksAmRand ? 'am Rand' : 'eingerückt'}`,
    );
    pruefe(deckel.dunkel, 'und trägt den dunklen Verlauf der Vorlage');
    pruefe(deckel.zeichen === '旅', 'das große 旅 steht darin', String(deckel.zeichen));
    pruefe(deckel.akzent, 'und der Titel hat seinen goldenen Akzent');
    /*
     * **Die Kennzahlen gegen die Daten, nicht gegen getippte Zahlen.**
     *
     * In der Vorlage stehen „3 · 19 · 6 · 164" als Text im Deckel. Hier baut
     * `mobilerDeckel()` sie aus `trip.json`, `stations.json` und `places.json`.
     * Diese Prüfung vergleicht mit denselben Dateien — schreibt also niemand die
     * Zahl 19 in den Test, und eine Planänderung macht beides zugleich richtig.
     */
    const soll = [
      String(trip.travellers.length),
      String(trip.nights),
      String(stationen.length),
      String(orte.length),
    ];
    pruefe(
      soll.every((z) => deckel.kpi.includes(z)),
      'die Kennzahlen stimmen mit den Projektdaten überein',
      `${deckel.kpi.join(' · ')} — erwartet ${soll.join(' · ')}`,
    );
  }
}

console.log('\nDie Stationsleiste klebt und markiert:');
{
  const chips = seite.locator('.bandtext .m-nav a');
  const anzahl = await chips.count();
  pruefe(anzahl === stationen.length, `sie führt die ${stationen.length} Stationen`, String(anzahl));

  if (anzahl === stationen.length) {
    /*
     * Kanji aus `stations.json`, **abgeleitet statt getippt**. Die Vorlage hält
     * für Kyoto 雅 („Eleganz"), die Projektdaten 形 („Die Schule der Form").
     * Getippt im Test wäre die Prüfung eine Kopie der Vorlage und würde die
     * Abweichung gerade nicht melden.
     */
    const gelesen = await chips.evaluateAll((ns) =>
      ns.map((n) => ({
        ziel: n.getAttribute('href'),
        kanji: (n.querySelector('.k') || {}).textContent,
        hoehe: Math.round(n.getBoundingClientRect().height),
      })),
    );
    pruefe(
      gelesen.every((g, i) => g.kanji === stationen[i].kanji),
      'jeder Chip trägt das Kanji aus stations.json',
      gelesen.map((g) => g.kanji).join(' '),
    );
    pruefe(
      gelesen.every((g, i) => g.ziel === `#${stationen[i].slug}`),
      'und führt zum Kapitel derselben Station',
      gelesen.map((g) => g.ziel).join(' '),
    );
    pruefe(
      gelesen.every((g) => g.hoehe >= 44),
      'jeder Chip ist mindestens 44 px hoch — er wird mit dem Daumen getroffen',
      `${Math.min(...gelesen.map((g) => g.hoehe))} px im kleinsten Fall`,
    );

    /*
     * **Die Zusicherung gegen die Kollision mit der App-Kopfzeile.**
     *
     * `.topbar` ist selbst `sticky; top: 0; z-index: 100`. Bei `top: 0` — wie in
     * der Vorlage, die keine App um sich hat — verschwindet die Leiste hinter
     * ihr, und das sieht man nur auf dem Gerät. Deshalb wird nach echtem Scrollen
     * gemessen, ob sie **unter** der Kopfzeile steht und nicht darunter
     * verschwindet.
     */
    /*
     * **`behavior: 'instant'`, und das ist kein Detail.**
     *
     * `tokens.css:63` setzt `scroll-behavior: smooth` für die ganze App. Ein
     * `window.scrollTo(0, n)` ist damit eine **Animation**: Der Aufruf kehrt
     * sofort zurück, die Seite steht noch am alten Platz, und die Messung
     * dahinter misst den Zustand von vorher. Genau daran sind zwei Prüfungen
     * dieses Blocks gefallen — nicht am Code, den sie prüfen.
     */
    await seite.evaluate(() => window.scrollTo({ top: 1800, behavior: 'instant' }));
    await seite.waitForTimeout(400);
    const lage = await seite.evaluate(() => {
      const nav = document.querySelector('.bandtext .m-nav');
      const bar = document.querySelector('.topbar');
      const n = nav.getBoundingClientRect();
      const b = bar ? bar.getBoundingClientRect() : { bottom: 0, height: 0 };
      return { navTop: Math.round(n.top), navHoehe: Math.round(n.height), barUnten: Math.round(b.bottom) };
    });
    pruefe(
      lage.navTop > 0 && Math.abs(lage.navTop - lage.barUnten) <= 2,
      'nach 1800 px Scrollen klebt sie genau unter der Kopfzeile der App',
      JSON.stringify(lage),
    );
    pruefe(
      lage.navTop + lage.navHoehe > lage.barUnten,
      'und ist dabei sichtbar, nicht hinter ihr verschwunden',
      JSON.stringify(lage),
    );

    /*
     * **Die Markierung wird am Kapitel gemessen, nicht an einer Scrollhöhe.**
     *
     * Erste Fassung prüfte bei 1800 px „genau ein Chip ist markiert" und fiel —
     * zu Recht: Bei elf zugeklappten Kapiteln steht dort noch die Einladung, und
     * die ist keine Station. Kein markierter Chip war die **richtige** Antwort,
     * die Prüfung war falsch. Jetzt wird eine Station gezielt angefahren und
     * verlangt, dass genau ihr Chip anspringt.
     */
    const zweite = stationen[1];
    await seite.evaluate((slug) => {
      const el = document.getElementById(slug);
      let k = el;
      while (k) {
        if (k.tagName === 'DETAILS') k.open = true;
        k = k.parentElement;
      }
      // Erst nach dem Aufklappen rechnen — ein offenes Kapitel verschiebt alles
      // darunter — und hart scrollen, nicht über `scrollIntoView`: Das wäre wegen
      // `scroll-behavior: smooth` eine Animation, und 60 px unter dem Kapitelkopf
      // trifft es ohnehin genauer als die Vorgabe von `scrollIntoView`.
      const y = el.getBoundingClientRect().top + window.scrollY - 60;
      window.scrollTo({ top: y, behavior: 'instant' });
    }, zweite.slug);
    await seite.waitForTimeout(500);
    const markiert = await chips.evaluateAll((ns) =>
      ns.filter((n) => n.classList.contains('on')).map((n) => n.getAttribute('href')),
    );
    pruefe(
      markiert.length === 1 && markiert[0] === `#${zweite.slug}`,
      `im Kapitel ${zweite.name} springt genau dessen Chip an`,
      markiert.length ? markiert.join(' ') : 'keiner markiert',
    );
    await seite.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await seite.waitForTimeout(400);
  }
}

console.log('\nDer Knopf nach oben:');
{
  const lies = () =>
    seite.evaluate(() => {
      const b = document.querySelector('.bandtext .m-top');
      if (!b) return null;
      const s = getComputedStyle(b);
      return { sichtbar: Number(s.opacity) > 0.5, tippbar: s.pointerEvents !== 'none' };
    });
  // Erst an den Seitenanfang, dann messen. Die Blöcke davor haben gescrollt, und
  // ein vorausgesetzter Ausgangszustand ist kein gemessener.
  await seite.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await seite.waitForTimeout(400);
  const oben = await lies();
  pruefe(oben !== null, 'der Knopf steht im Band');
  if (oben) {
    // Am Seitenanfang hat er nichts zu tun — und darf dann auch keine Tipps
    // abfangen. Deshalb wird `pointer-events` mitgeprüft und nicht nur die
    // Deckkraft: Ein durchsichtiger Knopf, der Tipps schluckt, ist schlimmer als
    // ein sichtbarer.
    pruefe(
      !oben.sichtbar && !oben.tippbar,
      'am Seitenanfang ist er unsichtbar und fängt nichts ab',
      JSON.stringify(oben),
    );
    await seite.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
    await seite.waitForTimeout(400);
    const unten = await lies();
    pruefe(unten.sichtbar && unten.tippbar, 'nach 1200 px ist er da und tippbar');
    await seite.locator('.bandtext .m-top').tap();
    await seite.waitForTimeout(900);
    const y = await seite.evaluate(() => window.scrollY);
    pruefe(y < 60, 'und ein Tipp bringt die Seite zurück nach oben', `${Math.round(y)} px`);
  }
}

console.log('\nDer Weg in den Planer:');
{
  const knoepfe = await seite.locator('.bandtext a.app-orte').evaluateAll((ns) =>
    ns.map((n) => ({
      ziel: n.getAttribute('href'),
      zahl: Number((n.querySelector('.ao-count') || {}).textContent),
      dunkel: getComputedStyle(n).backgroundColor,
      hoehe: Math.round(n.getBoundingClientRect().height),
    })),
  );
  pruefe(
    knoepfe.length === stationen.length,
    `je Station ein Weg in den Planer (${stationen.length})`,
    String(knoepfe.length),
  );
  /*
   * **Die Ortszahl gegen places.json, das Ziel gegen den Planer.**
   *
   * Sechs Knöpfe mit einer Zahl darauf sind eine Behauptung, solange niemand
   * nachzählt. Und `?station=` ist nur dann ein Filter, wenn die Ortsseite ihn
   * liest — `PlaceExplorer.svelte` tut das, und der letzte Block hier fährt es
   * nach.
   */
  const fehlZahl = knoepfe.filter((k) => {
    const slug = (k.ziel.match(/station=([a-z]+)/) || [])[1];
    return orte.filter((o) => o.station === slug).length !== k.zahl;
  });
  pruefe(
    fehlZahl.length === 0,
    'jede genannte Ortszahl stimmt mit places.json überein',
    fehlZahl.map((k) => `${k.ziel} sagt ${k.zahl}`).join(' | '),
  );
  pruefe(
    knoepfe.every((k) => /\/orte\/\?station=/.test(k.ziel)),
    'und jeder führt gefiltert in den Planer',
    knoepfe.map((k) => k.ziel).join(' '),
  );
  pruefe(
    knoepfe.every((k) => k.hoehe >= 48),
    'die Knöpfe sind mit dem Daumen zu treffen',
    `${Math.min(...knoepfe.map((k) => k.hoehe))} px im kleinsten Fall`,
  );

  // Der Filter wirkt wirklich — sonst ist der Knopf ein Link ins Ungefilterte.
  const ziel = knoepfe[0]?.ziel;
  if (ziel) {
    const slug = (ziel.match(/station=([a-z]+)/) || [])[1];
    await seite.goto(`${BASIS}/orte/?station=${slug}`, { waitUntil: 'load' });
    await seite.waitForTimeout(1200);
    const sichtbar = await seite.locator('article.place').count();
    const erwartet = orte.filter((o) => o.station === slug).length;
    pruefe(
      sichtbar > 0 && sichtbar <= erwartet,
      `?station=${slug} zeigt nur diese Station`,
      `${sichtbar} Einträge, ${erwartet} gehören zur Station`,
    );
    await seite.goto(`${BASIS}/`, { waitUntil: 'load' });
    await seite.waitForTimeout(600);
  }
}

/*
 * Der Inhalt ist noch vollständig — und das ist die Prüfung mit dem größten Wert
 * an dieser Umformung.
 *
 * Die Vorlage für das Akkordeon kam als fertige HTML-Datei. Hätte man sie
 * eingesetzt statt den Band daraus zu erzeugen, wären **19 Probier-Tabellen** und
 * die **fünf** Blöcke „Weitere Optionen — ohne Nummer, nur hier im Buch" weg
 * gewesen. Letztere haben keine Koordinaten, stehen deshalb nicht in
 * `places.json` und in keiner anderen Datei — sie wären ersatzlos verloren, ohne
 * dass etwas rot geworden wäre. Genau deshalb steht das hier.
 */
const inhalt = await seite.evaluate(() => {
  const bt = document.querySelector('.bandtext');
  return {
    tabellen: bt.querySelectorAll('table').length,
    karten: bt.querySelectorAll('.mcards').length,
    zeilen: bt.querySelectorAll('.mrow').length,
    werte: bt.querySelectorAll('.mval').length,
    etiketten: bt.querySelectorAll('.mlbl').length,
    sprache: bt.querySelectorAll('.mjp').length,
    rahmen: bt.querySelectorAll('.bandtabelle').length,
    nurImBuch: (bt.textContent.match(/ohne Nummer, nur hier im Buch/g) ?? []).length,
    bilder: bt.querySelectorAll('img').length,
  };
});
/*
 * **Keine Tabelle mehr, und der Inhalt trotzdem vollständig.**
 *
 * Bis zum 22.09.2026 stand hier „die 19 Probier-Tabellen sind noch da" und „jede
 * in ihrem Scrollrahmen". Der Rahmen war die Notlösung: Bei 390 px ist
 * `table.data` 532 px breit und schob die Seite zur Seite, also scrollte
 * stattdessen der Rahmen. Die gesendete Vorlage löst die Tabellen ganz auf, und
 * genau das prüft diese Stelle jetzt — **null**, nicht „weniger".
 *
 * Die Zahlen darunter sind die Gegenwache dazu: Eine Umformung, die Tabellen
 * verschwinden lässt, ohne Wertzeilen zu hinterlassen, wäre ein Inhaltsverlust,
 * und „0 Tabellen" allein wäre dafür grün. Erwartet sind 18 Kartenblöcke,
 * 77 Zeilen, 149 Etiketten und 191 Werte; geprüft wird mit Luft nach unten,
 * damit eine Textkorrektur im Band die Suite nicht rot macht.
 */
pruefe(inhalt.tabellen === 0, 'keine Tabelle steht mehr im Bandtext', String(inhalt.tabellen));
pruefe(inhalt.rahmen === 0, 'und damit auch kein Scrollrahmen mehr', String(inhalt.rahmen));
pruefe(
  inhalt.karten >= 15 && inhalt.zeilen >= 60,
  'die Tabellen stehen als gestapelte Wertzeilen da',
  `${inhalt.karten} Kartenblöcke, ${inhalt.zeilen} Zeilen`,
);
pruefe(
  inhalt.werte >= 150 && inhalt.etiketten >= 120,
  'mit Spaltenkopf und Wert je Zelle — der Inhalt ist nicht verloren',
  `${inhalt.etiketten} Etiketten, ${inhalt.werte} Werte`,
);
pruefe(
  inhalt.sprache === 10,
  'die zehn Sprachzeilen tragen ihr Japanisch getrennt',
  String(inhalt.sprache),
);
pruefe(
  inhalt.nurImBuch === 5,
  'die fünf „nur hier im Buch"-Blöcke sind noch da — sie stehen nirgends sonst',
  String(inhalt.nurImBuch),
);
pruefe(inhalt.bilder === 9, 'und die neun Bilder', String(inhalt.bilder));

const quer = await seite.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
pruefe(!quer, 'kein Querscrollen');

/*
 * Ein Ankersprung muss die Klappe öffnen.
 *
 * `paths.ts:kapitel('kyoto')` gibt `/Japan/#kyoto`, und seit dem Umbau sitzt der
 * Anker an einem `<details>`. Ohne das Skript auf der Startseite landet man
 * richtig und sieht **nichts** — eine zugeklappte Zeile — und hält den Link für
 * kaputt. Das ist der einzige Grund für jenes Skript, also gehört es geprüft.
 */
console.log('\nAnkersprung in ein Kapitel:');
await seite.goto(`${BASIS}/#kyoto`, { waitUntil: 'load' });

/*
 * Erst warten, bis die Seite ruhig ist — dann messen.
 *
 * Die erste Fassung wartete 800 ms und verlangte „weniger als 200 px von oben".
 * Das ist hier durchgelaufen und auf dem Runner gefallen, und beides aus demselben
 * Grund: Die Zahl hängt an Dingen, die nichts mit der Zusicherung zu tun haben.
 * Der Band setzt `scroll-behavior: smooth`, also **animiert** der Sprung; und ein
 * Hashwechsel auf der schon geladenen Seite landet anders als ein frischer Aufruf
 * mit Anker. Isoliert nachgemessen waren es 260 px statt der behaupteten 200 —
 * eine Pixelzahl, wo eine Aussage gebraucht wurde.
 *
 * Gewartet wird deshalb, bis die Position **stehen bleibt**, und geprüft wird die
 * Sache selbst: Die Klappe ist offen, und ihre Überschrift steht im Bild statt
 * unter der festen Kopfzeile oder außerhalb des Fensters.
 */
const sprung = await seite.evaluate(async () => {
  const ruhig = async () => {
    let vorher = null;
    for (let i = 0; i < 40; i++) {
      const jetzt = document.getElementById('kyoto')?.querySelector('summary')?.getBoundingClientRect()
        .top;
      if (jetzt !== undefined && vorher !== null && Math.abs(jetzt - vorher) < 1) return jetzt;
      vorher = jetzt ?? null;
      await new Promise((r) => setTimeout(r, 100));
    }
    return vorher;
  };
  const oben = await ruhig();
  const d = document.getElementById('kyoto');
  return {
    da: !!d,
    offen: !!d?.open,
    oben: oben === null || oben === undefined ? null : Math.round(oben),
    fensterhoehe: window.innerHeight,
  };
});
pruefe(sprung.da, 'das Kapitel Kyoto trägt den Anker');
pruefe(sprung.offen, 'und der Sprung klappt es auf');
pruefe(
  sprung.oben !== null && sprung.oben >= 0 && sprung.oben < sprung.fensterhoehe,
  'die Überschrift steht danach im Bild',
  `${sprung.oben} px von oben, Fenster ${sprung.fensterhoehe} px`,
);

/*
 * Die Druckfassung bleibt durchlaufender Text.
 *
 * Ein zugeklapptes `<details>` druckt nicht: Wer `reiseband.html` aufs Papier
 * gibt, bekäme elf Überschriften und sonst nichts. Deshalb greift die Umformung
 * nur auf dem Weg zur Startseite, und deshalb wird hier nachgesehen.
 */
console.log('\nDie Druckfassung:');
await seite.goto(`${BASIS}/reiseband.html`, { waitUntil: 'load' });
await seite.waitForTimeout(500);
const druckfassung = await seite.evaluate(() => ({
  details: document.querySelectorAll('details').length,
  kapitel: document.querySelectorAll('section.chapter[id]').length,
  tabellen: document.querySelectorAll('table').length,
}));
pruefe(druckfassung.details === 0, 'sie enthält kein einziges <details>', String(druckfassung.details));
pruefe(druckfassung.kapitel === 12, 'die zwölf Kapitel stehen als <section> (mit „Die Straße")', String(druckfassung.kapitel));
pruefe(druckfassung.tabellen === 19, 'mit ihren 19 Tabellen', String(druckfassung.tabellen));
await seite.goto(`${BASIS}/`, { waitUntil: 'load' });
await seite.waitForTimeout(500);

/*
 * **Nichts im Band ist breiter als der Band.**
 *
 * Das ist die Nachfolgerin von „jede Tabelle hat ihren eigenen Scrollrahmen".
 * Die alte Prüfung sicherte zu, dass das Überstehen *eingefangen* ist; diese
 * sichert zu, dass es **keines gibt**. Gemessen wird jedes Element im Bandtext,
 * nicht nur die früheren Tabellen — sonst wäre die nächste zu breite Auszeichnung
 * wieder unsichtbar, bis jemand auf dem Telefon danebenwischt.
 *
 * Gemessen wird gegen die **Fensterbreite**, nicht gegen `.bandtext`: Deckel,
 * Leiste und seit dem 23.09. auch die Kapitel stehen auf dem Telefon absichtlich
 * randlos (`margin: 0 -16px`), sonst blieben dem Text 151 px. Breiter als das
 * Fenster darf trotzdem nichts sein.
 */
const zuBreit = await seite.evaluate(() => {
  const bt = document.querySelector('.bandtext');
  const breite = document.documentElement.clientWidth;
  return [...bt.querySelectorAll('*')]
    .filter((e) => !e.closest('.m-cover') && !e.closest('.m-nav'))
    .filter((e) => e.scrollWidth > breite + 1)
    .slice(0, 5)
    .map((e) => `${e.tagName.toLowerCase()}.${e.className || '-'}: ${e.scrollWidth} px`);
});
pruefe(
  zuBreit.length === 0,
  `kein Element im Band ist breiter als das Fenster (${await seite.evaluate(() => document.documentElement.clientWidth)} px)`,
  zuBreit.join(' | '),
);

// ================================= 2) Die App sieht noch aus wie die App ===

console.log('\nDas Band-CSS greift nicht in die App:');

const app = await seite.evaluate(() => {
  const nav = document.querySelector('.bottomnav a, .topnav a');
  // Eine Überschrift der App **auf derselben Seite** wie der Bandtext — genau
  // dort ist das Risiko, dass sein Stylesheet durchschlägt. Der frühere Test sah
  // auf den Hero, und den gibt es nicht mehr: Er prüfte danach ein fehlendes
  // Element und meldete das als Fehler in der Sache.
  const appTitel = document.querySelector('.section h2');
  const bandTitel = document.querySelector('.bandtext h2');
  return {
    navSchrift: nav ? parseFloat(getComputedStyle(nav).fontSize) : 0,
    navFamilie: nav ? getComputedStyle(nav).fontFamily.split(',')[0].replace(/["']/g, '') : '',
    bodySchrift: parseFloat(getComputedStyle(document.body).fontSize),
    appTitel: appTitel ? Math.round(parseFloat(getComputedStyle(appTitel).fontSize)) : 0,
    bandTitel: bandTitel ? Math.round(parseFloat(getComputedStyle(bandTitel).fontSize)) : 0,
  };
});
/*
 * Die entscheidende Prüfung, und zwar am ausgelieferten Stylesheet statt an
 * berechneten Stilen.
 *
 * Erster Versuch war über `getComputedStyle`: Grundschriftgröße, Navigation,
 * Überschriftengrößen. Der Gegentest hat gezeigt, dass das **nichts** fängt —
 * die Regeln der App sind spezifischer (`.section h2` schlägt `h2`) und gewinnen
 * auch dann, wenn das Band-CSS völlig ungebunden in der Seite steht. Ein Test,
 * der bei abgeschalteter Reparatur grün bleibt, ist wertlos.
 *
 * Also direkt nachsehen: Jede Regel im eingebetteten Stylesheet muss an
 * `.bandtext` hängen. Das ist eindeutig, unabhängig von Spezifität und genau
 * die Eigenschaft, um die es geht.
 */
const eingebettet = await seite.evaluate(() => {
  // Nur der Block mit der Kennung. Ohne sie fischte diese Prüfung auch das
  // Stylesheet der App heraus — das führt `:root`, `html` und `body` selbst, und
  // 92 seiner Regeln wurden als „ungebunden" gemeldet, obwohl sie dorthin
  // gehören. Die Kennung setzt `npm run data` an den Anfang der Datei.
  const treffer = [...document.querySelectorAll('style')]
    .map((s) => s.textContent ?? '')
    .filter((c) => c.includes('/* reiseband-stil */'));
  const css = treffer.join('\n');
  // Selektoren am Anfang einer Regel, ohne At-Regeln und ohne Keyframe-Schritte.
  const ungebunden = [...css.matchAll(/(?:^|[}\n])\s*([^@{}\n][^{}\n]*?)\s*\{/g)]
    .map((m) => m[1].trim())
    .filter((s) => s && !/^(?:from|to|\d+%)$/.test(s))
    .filter((s) => !s.split(',').every((teil) => teil.trim().startsWith('.bandtext')));
  return { bloecke: treffer.length, ungebunden: [...new Set(ungebunden)] };
});
pruefe(eingebettet.bloecke > 0, 'das Stylesheet des Bandes steckt in der Seite');
pruefe(
  eingebettet.ungebunden.length === 0,
  'jede seiner Regeln hängt an .bandtext',
  `${eingebettet.ungebunden.length} ungebunden: ${eingebettet.ungebunden.slice(0, 4).join(' | ')}`,
);

// Der Band setzt `body{font-size:18px}` — gebunden an .bandtext darf das den
// Rest der Seite nicht erreichen. Schwache Prüfung (siehe oben), aber als
// Rauchmelder behalten: Schlägt sie an, ist etwas grundlegend schief.
pruefe(app.bodySchrift < 18, 'die Grundschriftgröße der App ist unverändert', `${app.bodySchrift} px`);
pruefe(app.navSchrift > 0 && app.navSchrift < 16, 'die Navigation hat ihre eigene Größe', `${app.navSchrift} px`);
pruefe(app.navFamilie !== 'Spectral', 'und ihre eigene Schrift', app.navFamilie);
pruefe(
  app.appTitel > 0 && app.bandTitel > 0,
  'beide Überschriftenarten stehen auf der Seite',
  JSON.stringify(app),
);
// Verschieden groß heißt: Die Bindung an .bandtext trennt wirklich.
pruefe(
  app.appTitel !== app.bandTitel,
  'die Überschriften der App behalten ihre eigene Größe',
  `App ${app.appTitel} px · Band ${app.bandTitel} px`,
);

// Die anderen Seiten dürfen von dem eingebetteten CSS nichts abbekommen.
for (const pfad of ['/orte/', '/plan/', '/organisation/']) {
  await seite.goto(`${BASIS}${pfad}`, { waitUntil: 'networkidle' });
  await seite.waitForTimeout(300);
  const fremd = await seite.evaluate(() => ({
    bandtext: document.querySelectorAll('.bandtext').length,
    body: parseFloat(getComputedStyle(document.body).fontSize),
    quer: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  pruefe(
    fremd.bandtext === 0 && fremd.body < 18 && !fremd.quer,
    `${pfad} ist unberührt`,
    JSON.stringify(fremd),
  );
}

// =========================================== 3) Die Sprungmarken kommen an ===

console.log('\nSprungmarken:');
await seite.goto(`${BASIS}/`, { waitUntil: 'networkidle' });
await seite.waitForTimeout(400);

/*
 * Hier stand „11 Sprungmarken in einer Zeile" und zählte `.bandsprung a`. Diese
 * Zeile ist weg: Der Band bringt seine klebende Stationsleiste selbst mit, und
 * die führt **sechs** Stationen statt elf Kapitel. Die fünf Kapitel ohne Station
 * sind damit nicht unerreichbar — ihre Sprungmarke sitzt am `<details>`, und die
 * Schleife unmittelbar darunter fährt jede einzeln an. Genau das ist der Grund,
 * warum diese Zusicherung ersetzt und nicht gestrichen wurde.
 */
pruefe(
  (await seite.locator('.bandtext .m-nav a').count()) === stationen.length,
  `die klebende Leiste führt ${stationen.length} Stationen`,
  String(await seite.locator('.bandtext .m-nav a').count()),
);

for (const k of kapitel) {
  const gefunden = await seite.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    el.scrollIntoView();
    return {
      h2: el.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      // Unter der festen Kopfzeile darf die Überschrift nicht verschwinden.
      obenSichtbar: el.getBoundingClientRect().top > -5,
    };
  }, k.id);
  if (!gefunden) {
    pruefe(false, `#${k.id} — Anker auf der Startseite vorhanden`);
    continue;
  }
  pruefe(
    gefunden.h2 === k.titel,
    `#${k.id} → „${k.titel.slice(0, 38)}"`,
    `dort steht: ${gefunden.h2.slice(0, 45)}`,
  );
}

// Der Verweis auf das eigenständige Dokument bleibt erreichbar.
const druck = await seite.locator('.banddruck a').getAttribute('href');
pruefe(
  Boolean(druck?.includes('reiseband.html')),
  'die Datei zum Ausdrucken ist weiter verlinkt',
  String(druck),
);

// Das Lesezeichen oben führt jetzt zum Text, nicht in die zweite Kopie.
const lesezeichen = await seite.locator('.bookmark').getAttribute('href');
pruefe(
  !lesezeichen?.includes('reiseband.html'),
  'das 📖 oben führt zur Startseite, nicht in die Datei',
  String(lesezeichen),
);

// ======================= 4) Was von der Startseite weggezogen ist ============

/*
 * Die Startseite hatte unter dem Reiseband zwei Zusammenfassungsblöcke, die jetzt
 * dort stehen, wo man sie beim Planen braucht: die fünf Etappen im Tagesplan (am
 * jeweiligen Umzugstag) und die Ortszahlen im Ortspool des Planers, die zwei
 * Erklärtexte auf der Orte-Seite.
 *
 * Geprüft wird **beides**: dass sie hier weg sind und dass sie dort angekommen
 * sind. Nur die erste Hälfte wäre auch grün, wenn der Inhalt einfach verloren
 * gegangen wäre — und niemand hätte es gemerkt, weil es für diese Blöcke vorher
 * gar keine Prüfung gab.
 */
console.log('\nWas weggezogen ist:');
for (const [wahl, was] of [
  ['.legs', 'die Etappenliste'],
  ['.cats', 'die Kategoriekacheln'],
  ['.notes', 'die Erklärkästen'],
]) {
  pruefe((await seite.locator(wahl).count()) === 0, `${was} steht nicht mehr auf der Startseite`);
}
// Die Stationen bleiben — und `test/browser-reiseband.mjs` selbst hängt daran:
// Die CSS-Trennungsprüfung oben greift `.section h2`, und das ist nach dem Umbau
// die Überschrift des Stationsblocks. Fällt der irgendwann auch weg, prüft sie ein
// fehlendes Element und meldet einen Fehler in der Sache — genau der Fall, den ihr
// eigener Kommentar für den entfernten Hero beschreibt.
pruefe((await seite.locator('.station').count()) === 6, 'die sechs Stationen stehen noch da');

console.log('\nUnd wo es angekommen ist:');
await seite.goto(`${BASIS}/plan/`, { waitUntil: 'load' });
await seite.waitForSelector('.daybar .daytab', { timeout: 10000 });
await seite.waitForTimeout(400);
pruefe(
  (await seite.locator('.daytab.leg').count()) === 6,
  'der Tagesplan markiert sechs Umzugstage',
);
pruefe(
  (await seite.locator('.poolcats .chip b').count()) >= 5,
  'die Kategoriechips im Ortspool tragen Zahlen',
);

/*
 * Hier stand bis zum 21.09.2026 ein knappes Dutzend Prüfungen zum Erklärkasten
 * „Woher die Zahlen kommen" auf der Orte-Seite: dass er da ist, wie hoch er
 * zugeklappt ist, was aufgeklappt darin steht, und dass er die statische
 * `Japan-Karte-2026.kml` verlinkt.
 *
 * Der Kasten ist weg, auf ausdrücklichen Wunsch: Nachschlagetext, den man einmal
 * liest und danach wegklickt, kostet auf einem 390-px-Schirm jeden Tag Platz.
 * Mit ihm ist der Verweis auf die alte KML verschwunden — und das ist kein
 * Verlust, den eine Prüfung einfangen müsste: Die Datei, die der Knopf erzeugt,
 * enthält alles, was die alte enthält, plus Korrekturen und eigene Orte. Die
 * alte liegt weiter unter `/Japan/Japan-Karte-2026.kml`.
 *
 * Was von den Prüfungen bleibt, steht in `browser-orte.mjs`: die drei Knöpfe und
 * wohin sie führen.
 */

// ============================================= Lesbarkeit auf dem Telefon ===
/*
 * Gemessen am 23.09. vor dem Umbau: 151 px Textspalte in Osaka, 185 px im Prolog,
 * rund 500 Stellen mit Schrift unter 12 px, die Rückseite hell auf Weiß. Diese
 * Prüfungen halten die Mobil-Schicht (`MOBIL_CSS` in `build-data.mjs`) fest.
 *
 * Gegenprobe: `MOBIL_CSS` aus dem `scope()`-Aufruf nehmen, neu erzeugen → die
 * Breiten-, Schrift- und Kontrastprüfungen fallen.
 */
console.log('\nLesbarkeit auf dem Telefon:');
await seite.setViewportSize({ width: 390, height: 844 });
await seite.goto(`${BASIS}/`, { waitUntil: 'load' });
await seite.waitForTimeout(500);
const lesbar = await seite.evaluate(() => {
  document.querySelectorAll('.bandtext details').forEach((d) => (d.open = true));
  const min = (sel) => {
    const w = [...document.querySelectorAll(sel)]
      .map((e) => e.getBoundingClientRect().width)
      .filter((x) => x > 0);
    return w.length ? Math.round(Math.min(...w)) : 0;
  };
  // Überstand: kein Element ragt über sein Kapitel hinaus — auch nicht versteckt
  // hinter `overflow: hidden`, was die Prüfung auf Querscrollen nicht sieht.
  const raus = [];
  for (const kap of document.querySelectorAll('.bandtext details.kap')) {
    const k = kap.getBoundingClientRect();
    for (const el of kap.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > k.right + 1 || r.left < k.left - 1)) raus.push(`${kap.id} ${el.className}`);
    }
  }
  let kleinste = 99;
  let wo = '';
  for (const el of document.querySelectorAll('.bandtext *')) {
    if (el.closest('.bigk, .kanji-mark, .m-cover, .m-nav')) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const f = parseFloat(cs.fontSize);
    if (f < kleinste) {
      kleinste = f;
      wo = `${el.tagName}.${el.className}`;
    }
  }
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((v) => {
      const x = Number(v) / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  // Kontrast der Rückseite: Text gegen den Grund, den er wirklich hat — die Karte
  // ist jetzt durchsichtig, also zählt der dunkle Grund von `.back`.
  const wert = document.querySelector('.back .mval');
  const back = document.querySelector('.back');
  let kontrast = 0;
  if (wert && back) {
    let grund = getComputedStyle(wert.closest('.mrow')).backgroundColor;
    if (/rgba\(.*, 0\)|transparent/.test(grund)) grund = getComputedStyle(back).backgroundColor;
    const a = lum(getComputedStyle(wert).color);
    const b = lum(grund);
    kontrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  return {
    lead: min('#osaka p.lead'),
    anker: min('.bandtext .anchor p'),
    prolog: min('#prolog .dbody > .wrap > p, #prolog p.lead'),
    raus: raus.slice(0, 5),
    kleinste,
    wo,
    kontrast: Math.round(kontrast * 10) / 10,
    tel: [...document.querySelectorAll('.bandtext a[href^="tel:"]')].map((a) => a.getAttribute('href')),
  };
});
pruefe(lesbar.lead >= 340, 'der Fließtext eines Stationskapitels ist mindestens 340 px breit', `${lesbar.lead} px (vorher 151)`);
pruefe(lesbar.prolog >= 340, 'auch im Prolog', `${lesbar.prolog} px (vorher 185)`);
pruefe(lesbar.anker >= 320, 'in einem Ankerkasten mindestens 320 px', `${lesbar.anker} px`);
pruefe(lesbar.raus.length === 0, 'nichts ragt über sein Kapitel hinaus', lesbar.raus.join(' | '));
pruefe(lesbar.kleinste >= 12, 'keine Schrift unter 12 px', `${lesbar.kleinste} px bei ${lesbar.wo}`);
pruefe(lesbar.kontrast >= 4.5, 'die Rückseite ist lesbar (Kontrast ≥ 4,5)', `${lesbar.kontrast} : 1`);
pruefe(
  JSON.stringify(lesbar.tel) === JSON.stringify(['tel:110', 'tel:119', 'tel:+81-50-3816-2787']),
  'die drei Notrufnummern sind antippbar, die Hotline in internationaler Form',
  lesbar.tel.join(', '),
);

console.log('\nImmer nur ein Kapitel offen:');
await seite.goto(`${BASIS}/`, { waitUntil: 'load' });
await seite.waitForTimeout(400);
await seite.locator('details.kap#osaka > summary').click();
await seite.waitForTimeout(300);
await seite.locator('details.kap#kyoto > summary').click();
await seite.waitForTimeout(400);
const offen = await seite.evaluate(() =>
  [...document.querySelectorAll('.bandtext details.kap')].filter((d) => d.open).map((d) => d.id),
);
pruefe(JSON.stringify(offen) === '["kyoto"]', 'nach Osaka und Kyoto ist nur Kyoto offen', offen.join(', '));
const kopf = await seite.evaluate(() => {
  const r = document.querySelector('details.kap#kyoto').getBoundingClientRect();
  const nav = document.querySelector('.m-nav').getBoundingClientRect();
  return { top: Math.round(r.top), nav: Math.round(nav.bottom) };
});
pruefe(
  kopf.top >= kopf.nav - 2 && kopf.top < 400,
  'das geöffnete Kapitel steht oben, direkt unter der Leiste',
  `Kopf bei ${kopf.top} px, Leiste endet bei ${kopf.nav} px`,
);

// ---------------------------------------------------------------- Aufräumen ---

console.log('\nFehlermeldungen der Seite:');
const echte = meldungen.filter(
  (m) => !/tile\.openstreetmap|fonts\.g|commons\.wikimedia|ERR_|Failed to load resource|supabase/i.test(m),
);
pruefe(echte.length === 0, 'keine Fehler in der Konsole', echte.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
