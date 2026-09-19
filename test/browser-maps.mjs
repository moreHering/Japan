/**
 * Die Google-Anbindung im Browser: Tagesroute und KML-Download.
 *
 * Was diese Datei **nicht** kann, und das ist der Rahmen für alles darin: Der
 * Egress-Proxy dieser Umgebung sperrt Google vollständig — gemessen, dieselbe
 * Sperre wie bei den Kartenkacheln. Ob eine Maps-URL die App öffnet und die Route
 * richtig zeigt, sieht nur ein Telefon.
 *
 * Prüfbar ist dafür restlos, was **vor** dem Absenden passiert: dass die Links
 * überhaupt entstehen, wie viele es sind, welche Koordinaten in welcher
 * Reihenfolge darin stehen, und dass die erzeugte KML das enthält, was die
 * statische Datei nicht hat — eigene Orte und Korrekturen. Genau das ist der
 * Unterschied, um den es geht.
 *
 *   npx astro dev --port 4322 &   und dann   node test/browser-maps.mjs
 */

import { chromium, devices } from 'playwright';

import { BASIS, START } from './browserlauf.mjs';

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
const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
const seite = await ctx.newPage();

const meldungen = [];
seite.on('pageerror', (e) => meldungen.push(`pageerror: ${e.message}`));
seite.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|openstreetmap|openfreemap/i.test(m.text())) {
    meldungen.push(m.text());
  }
});

/** Setzt den Plan direkt — schneller und eindeutiger als Orte anzuklicken. */
async function planSetzen(p, datum, nummern) {
  await p.evaluate(
    async ([d, nrs]) => {
      const s = await import('/src/lib/store.svelte.ts');
      s.plan.days = { [d]: { placeNrs: nrs, note: '' } };
    },
    [datum, nummern],
  );
  await p.waitForTimeout(400);
}

/**
 * Die Halte einer Maps-URL in **Routenreihenfolge**: Start, Zwischenziele, Ziel.
 *
 * Die erste Fassung dieser Datei hat mit einem Regex über die rohe URL gesucht —
 * und damit die Reihenfolge der **Parameter** gelesen, nicht die der Route.
 * `URLSearchParams` schreibt `origin`, `destination`, `travelmode`, `waypoints`;
 * das Ziel stand also an zweiter Stelle und das letzte Zwischenziel am Ende. Die
 * Nahtprüfung verglich daraufhin Halt 10 mit Halt 11 und meldete eine Lücke, die
 * es nicht gab. Ein Test, der bei richtigem Verhalten anschlägt, kostet genauso
 * viel Zeit wie einer, der bei falschem schweigt — deshalb hier ausdrücklich über
 * die Parameternamen und nicht über die Textstelle.
 */
const halteAus = (href) => {
  const p = new URL(href).searchParams;
  const zwischen = p.get('waypoints');
  return [
    p.get('origin'),
    ...(zwischen ? zwischen.split('|') : []),
    p.get('destination'),
  ];
};

/** Index eines Reisetags im Tagesstreifen; Tag 1 ist der 26.09. */
const tagIndex = (iso) => {
  const start = Date.UTC(2026, 8, 26);
  const [j, m, t] = iso.split('-').map(Number);
  return Math.round((Date.UTC(j, m - 1, t) - start) / 86400000);
};

async function tagOeffnen(p, iso) {
  const tab = p.locator('.daytab').nth(tagIndex(iso));
  await tab.scrollIntoViewIfNeeded();
  await tab.tap();
  await p.waitForTimeout(400);
}

// ========================================== 1) Kein Tag ohne Orte, kein Link ===

console.log('Tagesplan, Tag ohne geplante Orte:');
await seite.goto(`${BASIS}/plan/`, { waitUntil: 'load' });
await seite.waitForSelector('.daybar .daytab', { timeout: 15000 });
await planSetzen(seite, '2026-09-28', []);
await tagOeffnen(seite, '2026-09-28');
pruefe(
  (await seite.locator('.mapsroute').count()) === 0,
  'ohne Orte erscheint keine Routenzeile — ein Knopf, der nichts tut, wäre schlimmer',
);

console.log('\nTag mit einem einzigen Ort:');
await planSetzen(seite, '2026-09-28', [1]);
await tagOeffnen(seite, '2026-09-28');
pruefe(
  (await seite.locator('.mapsroute').count()) === 0,
  'auch bei einem Ort nicht — eine Route mit einem Punkt ist keine',
);

// ============================================= 2) Ein Link bis zur Grenze ======

console.log('\nTag mit drei Orten:');
await planSetzen(seite, '2026-09-28', [1, 3, 8]);
await tagOeffnen(seite, '2026-09-28');
const links3 = await seite.locator('.mapsroute a').evaluateAll((ns) =>
  ns.map((n) => ({ text: n.textContent.trim(), href: n.getAttribute('href') })),
);
pruefe(links3.length === 2, 'zwei Links: zu Fuß und ÖPNV', `${links3.length}`);
pruefe(
  links3.every((l) => l.href.startsWith('https://www.google.com/maps/dir/?api=1')),
  'beide zeigen auf Googles dir-Endpunkt',
);
pruefe(
  links3.some((l) => l.href.includes('travelmode=walking')) &&
    links3.some((l) => l.href.includes('travelmode=transit')),
  'einmal zu Fuß, einmal ÖPNV',
);
pruefe(
  links3.every((l) => !/Teil/.test(l.text)),
  'ohne Teilnummer, solange ein Link reicht',
  links3.map((l) => l.text).join(' / '),
);

/*
 * Die Koordinaten: drei Orte heißen Start, ein Zwischenziel, Ziel. Geprüft wird
 * die **Anzahl** der Paare und dass sie als `lat,lng` dastehen — Japan liegt bei
 * lat 34–36 und lng 135–140, verdrehte Paare fielen also sofort auf.
 */
const zuFuss = links3.find((l) => l.href.includes('walking')).href;
const halte3 = halteAus(zuFuss);
const paare = halte3.map((h) => h.split(',').map(Number));
pruefe(paare.length === 3, 'drei Halte für drei Orte', `${paare.length}`);
pruefe(
  paare.every(([lat, lng]) => lat > 30 && lat < 46 && lng > 128 && lng < 146),
  'alle Paare stehen als lat,lng — nicht verdreht',
  JSON.stringify(paare[0]),
);
pruefe(zuFuss.includes('waypoints='), 'das Zwischenziel steht als waypoints da');
pruefe(!zuFuss.includes('place_id'), 'keine place_id in der Route');

/*
 * Die Tippfläche — und zwar hier, wo sie wirklich zählt. Diese zwei Links drückt
 * man an einer Straßenecke, einhändig, oft mit Gepäck. Gemessen hatte ich zuerst
 * 38 px Höhe und **6 px** Abstand zwischen ihnen; ein Daumen ist rund 40 px breit,
 * ein Fehlgriff öffnet also die falsche Verkehrsart. Das ist kein Schaden, aber es
 * passiert genau im falschen Moment. Deshalb die Ausnahme von der projektweiten
 * 36-px-Vorgabe, und deshalb wird beides gemessen: Höhe **und** Abstand.
 */
const flaeche = await seite.locator('.mapsroute').evaluate((z) => {
  const r = [...z.querySelectorAll('a')].map((n) => n.getBoundingClientRect());
  return {
    hoehe: Math.min(...r.map((x) => Math.round(x.height))),
    abstand: Math.round(r[1].left - r[0].right),
  };
});
pruefe(flaeche.hoehe >= 44, 'die Routenlinks sind mindestens 44 px hoch', `${flaeche.hoehe} px`);
pruefe(
  flaeche.abstand >= 10,
  'und liegen mindestens 10 px auseinander — der Daumen trifft nicht beide',
  `${flaeche.abstand} px`,
);

// ================================== 3) Über der Grenze: geteilt und überlappend ===

console.log('\nTag mit vierzehn Orten (über Googles Grenze):');
await planSetzen(seite, '2026-09-28', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
await tagOeffnen(seite, '2026-09-28');
const links14 = await seite.locator('.mapsroute a').evaluateAll((ns) =>
  ns.map((n) => ({ text: n.textContent.trim(), href: n.getAttribute('href') })),
);
pruefe(links14.length === 4, 'vier Links: je zwei Teile für zu Fuß und ÖPNV', `${links14.length}`);
pruefe(
  links14.filter((l) => /Teil 1/.test(l.text)).length === 2 &&
    links14.filter((l) => /Teil 2/.test(l.text)).length === 2,
  'die Teile sind nummeriert',
  links14.map((l) => l.text).join(' / '),
);
pruefe(
  await seite.locator('.mrhinweis').isVisible(),
  'und der Grund für die Teilung steht dabei',
);
pruefe(
  /14 Orte/.test(await seite.locator('.mrhinweis').innerText()),
  'samt der Zahl der Orte',
);

/*
 * Die Überlappung im Browser nachgerechnet — die Zusicherung, an der wirklich
 * etwas hängt: Ohne sie fehlte das Wegstück zwischen Halt 11 und Halt 12, und man
 * merkt es erst, wenn man davorsteht.
 */
const teile = links14.filter((l) => l.href.includes('walking')).map((l) => halteAus(l.href));
pruefe(teile.length === 2, 'zwei Fußwegteile', `${teile.length}`);
pruefe(
  teile[0].at(-1) === teile[1][0],
  'der letzte Halt von Teil 1 ist der erste von Teil 2 — kein Wegstück fehlt',
  `${teile[0].at(-1)} vs. ${teile[1][0]}`,
);
pruefe(
  teile[0].length + teile[1].length === 15,
  'zusammen 15 Halte: 14 Orte plus der eine doppelte an der Naht',
  `${teile[0].length} + ${teile[1].length}`,
);

// ======================================================= 4) KML aus dem Stand ===

console.log('\nKML-Download auf /orte/:');
await seite.goto(`${BASIS}/orte/`, { waitUntil: 'load' });
await seite.waitForSelector('.kmlzeile', { timeout: 15000 });

// Einen eigenen Ort anlegen — er ist der ganze Unterschied zur statischen Datei.
await seite.evaluate(async () => {
  const s = await import('/src/lib/store.svelte.ts');
  s.plan.customPlaces = [
    {
      nr: 165,
      name: 'Testunterkunft Kanazawa',
      category: 'hotel',
      station: 'kanazawa',
      stationLabel: 'Kanazawa · Zentrum',
      area: 'zentrum',
      lat: 36.5613,
      lng: 136.6562,
      placeId: null,
      descriptionHtml: 'Von Hand ergänzt & mit <strong>Markup</strong>.',
      isFriendTip: false,
      needsBooking: false,
      closedDay: null,
      cashOnly: false,
      eigen: true,
      vorlaeufig: false,
      angelegtVon: null,
    },
  ];
  // Und eine Ausblendung, damit auch die geprüft ist.
  s.plan.korrekturen = { 1: { nr: 1, versteckt: true, schlagworte: [] } };
});
await seite.waitForTimeout(600);

const knopf = seite.locator('.kmlzeile button');
pruefe(await knopf.isVisible(), 'der Knopf ist da, auch bei 390 px mit zugeklappten Filtern');
/*
 * Die Höhe gegen die **Projektvorgabe**, nicht gegen Apples 44 pt: `tokens.css:318`
 * setzt für `.btn.small` auf schmalen Schirmen bewusst 36 px, und jeder Nachbar auf
 * dieser Seite ist 38 px. Die erste Fassung hier verlangte 44 px — eine Zahl, die
 * ich mir an dieser Stelle ausgedacht hatte und die der Entscheidung des Projekts
 * widerspricht. Ausgerechnet dieser Knopf sticht sonst aus seiner Zeile heraus.
 * (Für die Routenlinks im Planer gilt das Gegenteil, siehe dort — die werden
 * unterwegs gedrückt, dieser hier einmal am Schreibtisch.)
 */
const hoch = await knopf.evaluate((n) => Math.round(n.getBoundingClientRect().height));
pruefe(hoch >= 36, 'und nicht kleiner als die Projektvorgabe für .btn.small', `${hoch} px`);

const [download] = await Promise.all([seite.waitForEvent('download'), knopf.click()]);
pruefe(/\.kml$/.test(download.suggestedFilename()), 'die Datei endet auf .kml',
  download.suggestedFilename());
const pfad = await download.path();
const text = await (await import('node:fs/promises')).readFile(pfad, 'utf8');

pruefe(text.startsWith('<?xml version="1.0"'), 'sie beginnt mit der XML-Deklaration');
const placemarks = (text.match(/<Placemark>/g) ?? []).length;
const sichtbar = Number((await seite.locator('.count b').first().textContent()) ?? '0');
pruefe(placemarks === sichtbar, 'ein Placemark je sichtbarem Ort',
  `${placemarks} in der Datei, ${sichtbar} in der Liste`);

/*
 * Der Kern: Was die statische Datei **nicht** kann. Ohne diese drei Prüfungen
 * wäre der ganze Knopf eine aufwendige Kopie von `public/Japan-Karte-2026.kml`.
 */
pruefe(text.includes('165 · Testunterkunft Kanazawa'), 'der eigene Ort steht drin');
pruefe(!/>1 · /.test(text), 'der ausgeblendete Ort Nr. 1 steht nicht drin');
pruefe(
  text.includes('<Data name="reisetag">'),
  'der Reisetag ist als Feld dabei — damit lässt sich in My Maps danach gruppieren',
);

// Und das Escaping an echten Daten, nicht an erfundenen.
pruefe(
  text.includes('<strong>Markup</strong>'),
  'HTML im Beschreibungstext bleibt im CDATA erhalten',
);
const ohneCdata = text.replace(/<!\[CDATA\[[\s\S]*?]]>/g, '');
pruefe(
  !/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(ohneCdata),
  'außerhalb der CDATA-Abschnitte steht kein rohes &',
);

// Beide Wege sind da und unterscheidbar.
console.log('\nDie zwei KML-Wege:');
/*
 * Sie stehen **beieinander**, und das ist keine Kosmetik: Der Knopf stand eine
 * Fassung lang über der Liste und hat dort den ersten Ort unter die Falzkante
 * geschoben — `browser-orte.mjs` hat es gemeldet (y = 501 px statt 326 px). Seither
 * sitzt er direkt über dem `.lesehinweis`-Kasten, in dem die statische KML verlinkt
 * ist und der Unterschied erklärt wird.
 *
 * Der Erklärtext dort sagt „direkt über diesem Kasten". Diese Prüfung ist das, was
 * den Satz wahr hält: Zieht jemand eines der beiden weg, steht dort eine
 * Wegbeschreibung, die ins Leere zeigt — und das merkt unterwegs niemand, weil der
 * Kasten zugeklappt ist.
 */
const lage = await seite.evaluate(() => {
  const k = document.querySelector('.kmlzeile')?.getBoundingClientRect();
  const l = document.querySelector('.lesehinweis')?.getBoundingClientRect();
  return k && l ? { abstand: Math.round(l.top - k.bottom) } : null;
});
pruefe(lage !== null, 'Knopf und Erklärkasten sind beide da');
pruefe(
  lage !== null && lage.abstand >= 0 && lage.abstand < 80,
  'und der Knopf steht direkt über dem Kasten, wie der Text behauptet',
  lage ? `${lage.abstand} px` : '—',
);
pruefe(
  (await seite.locator('a[href$=".kml"][download]').count()) === 1,
  'die statische Datei ist weiter verlinkt',
);
await seite.locator('.lesehinweis summary').tap();
await seite.waitForTimeout(300);
const erklaerung = (await seite.locator('.lesehinweis').innerText()).replace(/\s+/g, ' ');
pruefe(/zwei wege/i.test(erklaerung), 'der Unterschied ist erklärt');
pruefe(
  /keine Schnittstelle|nicht/i.test(erklaerung) && /ergänzt/i.test(erklaerung),
  'und dass es keine automatische Anbindung gibt',
);

// ============================================================== 5) Layout ======

console.log('\nLayout bei 390 px:');
for (const pfadName of ['/plan/', '/orte/']) {
  await seite.goto(`${BASIS}${pfadName}`, { waitUntil: 'load' });
  await seite.waitForTimeout(800);
  const quer = await seite.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  pruefe(!quer, `${pfadName}: kein Querscrollen`);
}

console.log('\nFehlermeldungen der Seite:');
pruefe(meldungen.length === 0, 'keine Fehler in der Konsole', meldungen.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
