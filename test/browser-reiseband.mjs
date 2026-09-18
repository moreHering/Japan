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

const BASIS = process.env.BASIS ?? 'http://localhost:4322/Japan';
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
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
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
    kapitel: bt.querySelectorAll('section[id]').length,
    zeichen: (bt.textContent ?? '').length,
    schriftgroesse: cs ? parseFloat(cs.fontSize) : 0,
    zeilenhoehe: cs ? parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) : 0,
    schrift: cs ? cs.fontFamily.split(',')[0].replace(/["']/g, '') : '',
    // Erstes Kapitel möglichst früh: Der Text ist die Hauptsache.
    ersterKapitelY: Math.round(
      (bt.querySelector('section[id]')?.getBoundingClientRect().top ?? 0) + window.scrollY,
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

const quer = await seite.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
pruefe(!quer, 'kein Querscrollen');

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

// ---------------------------------------------------------------- Aufräumen ---

console.log('\nFehlermeldungen der Seite:');
const echte = meldungen.filter(
  (m) => !/tile\.openstreetmap|fonts\.g|commons\.wikimedia|ERR_|Failed to load resource|supabase/i.test(m),
);
pruefe(echte.length === 0, 'keine Fehler in der Konsole', echte.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
