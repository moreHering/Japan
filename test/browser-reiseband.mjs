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
    deckelY: Math.round(
      (bt.querySelector('.cover2, .wrap')?.getBoundingClientRect().top ?? 9999) + window.scrollY,
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
    rahmen: bt.querySelectorAll('.bandtabelle').length,
    nurImBuch: (bt.textContent.match(/ohne Nummer, nur hier im Buch/g) ?? []).length,
    bilder: bt.querySelectorAll('img').length,
  };
});
pruefe(inhalt.tabellen === 19, 'die 19 Probier-Tabellen sind noch da', String(inhalt.tabellen));
pruefe(inhalt.rahmen === 19, 'und jede in ihrem Scrollrahmen', String(inhalt.rahmen));
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
await seite.waitForTimeout(800);
const sprung = await seite.evaluate(() => {
  const d = document.getElementById('kyoto');
  const r = d?.querySelector('summary')?.getBoundingClientRect();
  return { da: !!d, offen: !!d?.open, oben: r ? Math.round(r.top) : null };
});
pruefe(sprung.da, 'das Kapitel Kyoto trägt den Anker');
pruefe(sprung.offen, 'und der Sprung klappt es auf');
pruefe(
  sprung.oben !== null && sprung.oben < 200,
  'die Überschrift steht danach im Bild, nicht unter der Kopfzeile',
  `${sprung.oben} px`,
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
pruefe(druckfassung.kapitel === 11, 'die elf Kapitel stehen als <section>', String(druckfassung.kapitel));
pruefe(druckfassung.tabellen === 19, 'mit ihren 19 Tabellen', String(druckfassung.tabellen));
await seite.goto(`${BASIS}/`, { waitUntil: 'load' });
await seite.waitForTimeout(500);

// Die Tabellen scrollen für sich, nicht die Seite.
const tabellen = await seite.evaluate(() => {
  const r = [...document.querySelectorAll('.bandtext .bandtabelle')];
  return {
    rahmen: r.length,
    scrollbar: r.filter((e) => getComputedStyle(e).overflowX === 'auto').length,
    ueberstehend: r.filter((e) => e.scrollWidth > e.clientWidth + 1).length,
  };
});
pruefe(tabellen.rahmen > 0 && tabellen.rahmen === tabellen.scrollbar, 'jede Tabelle hat ihren eigenen Scrollrahmen', JSON.stringify(tabellen));
pruefe(tabellen.ueberstehend > 0, 'und mindestens eine ist tatsächlich breiter — der Rahmen wird gebraucht');

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

pruefe(
  (await seite.locator('.bandsprung a').count()) === kapitel.length,
  `${kapitel.length} Sprungmarken in einer Zeile`,
  String(await seite.locator('.bandsprung a').count()),
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
  (await seite.locator('.daytab.leg').count()) === 5,
  'der Tagesplan markiert fünf Umzugstage',
);
pruefe(
  (await seite.locator('.poolcats .chip b').count()) >= 5,
  'die Kategoriechips im Ortspool tragen Zahlen',
);

await seite.goto(`${BASIS}/orte/`, { waitUntil: 'load' });
await seite.waitForTimeout(700);
const kml = seite.locator('a[href$=".kml"][download]');
pruefe((await kml.count()) === 1, 'die statische KML steht genau einmal auf der Orte-Seite',
  `${await kml.count()}`);
// Er stand vorher **nur** in der entfernten Section — repoweit die einzige Stelle,
// die `trip.kmlFile` verlinkt. Ohne diese Prüfung wäre die Datei von nirgends mehr
// erreichbar gewesen, und kein Test hätte angeschlagen.

/*
 * Seit dem Google-Export gibt es **zwei** KML-Wege, und die Prüfung oben trifft nur
 * den einen: Der neue Knopf ist ein `<button>` mit Blob-URL und fällt nicht unter
 * `a[href$=".kml"][download]`. Dass die „genau einmal"-Zusicherung dadurch stehen
 * blieb, ist Glück und keine Absicht — also wird der zweite Weg hier ausdrücklich
 * mitgezählt, statt sich darauf zu verlassen.
 *
 * Die zwei sind nicht dasselbe: Der Link gibt den ursprünglichen My-Maps-Export
 * (bytegleich mit `data/source/`), der Knopf euren aktuellen Stand mit Korrekturen
 * und eigenen Orten. Was die Datei enthält, prüft `browser-maps.mjs`; hier geht es
 * nur darum, dass beide Wege da sind und man sie unterscheiden kann.
 */
pruefe(
  (await seite.locator('.kmlzeile button').count()) === 1,
  'und der Knopf für den Live-Stand steht als zweiter Weg daneben',
);
pruefe(
  (await seite.locator('.lesehinweis').count()) === 1,
  'und die zwei Erklärtexte sind dort gelandet',
);
// Zugeklappt kostet der Kasten eine Zeile — die Werkzeugleiste bleibt frei.
const zu = await seite.locator('.lesehinweis').evaluate((n) => Math.round(n.getBoundingClientRect().height));
pruefe(zu < 70, 'zugeklappt kostet er kaum Höhe', `${zu} px`);

// Aufklappen und erst dann lesen: `innerText` gibt bei zugeklapptem `<details>`
// nur die Zusammenfassung her, der Rest ist nicht gerendert. Damit ist gleich
// mitgeprüft, dass sich der Kasten überhaupt öffnen lässt.
await seite.locator('.lesehinweis summary').tap();
await seite.waitForTimeout(300);
const offen = (await seite.locator('.lesehinweis').innerText()).replace(/\s+/g, ' ');

/*
 * Der Unterschied zwischen den zwei KML-Wegen, und zwar **hier** geprüft und nicht
 * oben: Der Erklärtext steht im `<details>`, und `innerText` gibt bei zugeklapptem
 * Kasten nur die Zusammenfassung her. Die erste Fassung dieser Prüfung stand vor
 * dem `tap()` und hätte über einen leeren Text geurteilt — dieselbe Falle, die
 * weiter unten schon einen Kommentar hat.
 */
const kmlTexte = `${offen} ${(await seite.locator('.kmlzeile').innerText()).replace(/\s+/g, ' ')}`;
pruefe(
  /ursprünglich|unverändert/i.test(kmlTexte) && /aktuell/i.test(kmlTexte),
  'der Text sagt, welcher der zwei KML-Wege welcher ist',
);
pruefe(
  /Korrektur/i.test(kmlTexte) && /eigene/i.test(kmlTexte),
  'und woran man den Live-Stand erkennt',
);
// Groß-klein-unempfindlich: Die Überschrift trägt `text-transform: uppercase`,
// und `innerText` gibt den **gerenderten** Text — also „NUMMERN WIE IM BUCH".
pruefe(/nummern wie im buch/i.test(offen), 'aufgeklappt steht die Erklärung zu den Nummern da');
pruefe(/Ryokan/.test(offen), 'und die zu den erledigten Unterkunftsvorschlägen');
const auf = await seite.locator('.lesehinweis').evaluate((n) => Math.round(n.getBoundingClientRect().height));
pruefe(auf > zu + 40, 'und er wird dabei wirklich größer', `${zu} → ${auf} px`);

// ---------------------------------------------------------------- Aufräumen ---

console.log('\nFehlermeldungen der Seite:');
const echte = meldungen.filter(
  (m) => !/tile\.openstreetmap|fonts\.g|commons\.wikimedia|ERR_|Failed to load resource|supabase/i.test(m),
);
pruefe(echte.length === 0, 'keine Fehler in der Konsole', echte.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
