/**
 * Prüft das Verkleinern der Fotos im echten Browser.
 *
 * Warum nicht mit Vitest: `createImageBitmap`, `canvas` und `toBlob` gibt es in
 * Node nicht. Ein Nachbau würde nur beweisen, dass der Nachbau funktioniert —
 * und genau hier liegen die stillen Fehler (Drehung aus den EXIF-Daten,
 * durchsichtige Stellen, die im JPEG schwarz werden).
 *
 * Läuft gegen den Entwicklungsserver, weil der die Module einzeln ausliefert
 * und sich `src/lib/bild.ts` deshalb direkt importieren lässt.
 *
 *   npx astro dev --port 4322 &   und dann   node test/browser-bild.mjs
 */

import { chromium } from 'playwright';

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
const seite = await browser.newPage();
seite.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await seite.goto(`${BASIS}/freundebuch/`, { waitUntil: 'load' });

console.log('Verkleinern:');

const ergebnis = await seite.evaluate(async () => {
  const { verkleinern, groesse } = await import('/src/lib/bild.ts');

  /** Ein buntes PNG in der gewünschten Größe — steht für ein Handyfoto. */
  async function bild(breite, hoehe) {
    const c = document.createElement('canvas');
    c.width = breite;
    c.height = hoehe;
    const g = c.getContext('2d');
    // Rauschen statt Fläche: Eine einfarbige Fläche komprimiert so gut, dass
    // der Test nichts über die Wirkung des Verkleinerns aussagen würde.
    const bild = g.createImageData(breite, hoehe);
    for (let i = 0; i < bild.data.length; i += 4) {
      bild.data[i] = Math.random() * 255;
      bild.data[i + 1] = Math.random() * 255;
      bild.data[i + 2] = Math.random() * 255;
      bild.data[i + 3] = 255;
    }
    g.putImageData(bild, 0, 0);
    return new Promise((f) => c.toBlob(f, 'image/png'));
  }

  const gross = await bild(4032, 3024); // typisches Handyfoto, quer
  const quer = await verkleinern(gross);

  const hoch = await bild(3024, 4032); // hochkant
  const hochKlein = await verkleinern(hoch);

  const klein = await bild(800, 600); // schon klein genug
  const bleibt = await verkleinern(klein);

  // Durchsichtiges PNG: Ohne weißen Grund wird das im JPEG schwarz.
  const durchsichtig = await (async () => {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 200;
    return new Promise((f) => c.toBlob(f, 'image/png'));
  })();
  const aufWeiss = await verkleinern(durchsichtig);
  const pixel = await (async () => {
    const bmp = await createImageBitmap(aufWeiss.blob);
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    c.getContext('2d').drawImage(bmp, 0, 0, 1, 1);
    return [...c.getContext('2d').getImageData(0, 0, 1, 1).data];
  })();

  // Zuschnitt fürs Freundebuch: quer auf 8:5, hoch auf 4:5.
  const querZu = await verkleinern(gross, 1600, 0.82, true);
  const hochZu = await verkleinern(hoch, 1600, 0.82, true);
  const kleinZu = await verkleinern(klein, 1600, 0.82, true);
  // Mittig oder nicht: 400×300 mit einem roten Rand von 25 px oben und unten.
  // 8:5 lässt genau 250 px Höhe stehen — mittig geschnitten ist der Rand weg.
  const rand = await (async () => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 300;
    const g = c.getContext('2d');
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 400, 300);
    g.fillStyle = '#0000ff';
    g.fillRect(0, 25, 400, 250);
    return new Promise((f) => c.toBlob(f, 'image/png'));
  })();
  const randZu = await verkleinern(rand, 1600, 0.82, true);
  const kanten = await (async () => {
    const bmp = await createImageBitmap(randZu.blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    return [
      [...g.getImageData(200, 1, 1, 1).data],
      [...g.getImageData(200, bmp.height - 2, 1, 1).data],
    ];
  })();

  return {
    zu: {
      quer: [querZu.breite, querZu.hoehe, querZu.format],
      hoch: [hochZu.breite, hochZu.hoehe, hochZu.format],
      klein: [kleinZu.breite, kleinZu.hoehe, kleinZu.format],
      ohne: quer.format ?? null,
    },
    kanten,
    quer: { b: quer.breite, h: quer.hoehe, vorher: quer.vorher, nachher: quer.blob.size },
    hoch: { b: hochKlein.breite, h: hochKlein.hoehe },
    klein: { b: bleibt.breite, h: bleibt.hoehe },
    typ: quer.blob.type,
    pixel,
    beispiel: groesse(6_500_000),
  };
});

pruefe(
  ergebnis.quer.b === 1600 && ergebnis.quer.h === 1200,
  'Querformat 4032×3024 wird auf 1600×1200 gebracht',
  `${ergebnis.quer.b}×${ergebnis.quer.h}`,
);
pruefe(
  ergebnis.hoch.b === 1200 && ergebnis.hoch.h === 1600,
  'Hochformat behält sein Seitenverhältnis',
  `${ergebnis.hoch.b}×${ergebnis.hoch.h}`,
);
pruefe(
  ergebnis.klein.b === 800 && ergebnis.klein.h === 600,
  'Ein kleines Bild wird nicht hochgerechnet',
  `${ergebnis.klein.b}×${ergebnis.klein.h}`,
);
pruefe(ergebnis.typ === 'image/jpeg', 'Das Ergebnis ist ein JPEG', ergebnis.typ);

const faktor = ergebnis.quer.vorher / ergebnis.quer.nachher;
pruefe(
  faktor > 5,
  'Die Datei wird deutlich kleiner',
  `${Math.round(ergebnis.quer.vorher / 1024)} kB → ${Math.round(
    ergebnis.quer.nachher / 1024,
  )} kB, Faktor ${faktor.toFixed(1)}`,
);

const [r, g, bl] = ergebnis.pixel;
pruefe(
  r > 240 && g > 240 && bl > 240,
  'Durchsichtige Stellen werden weiß, nicht schwarz',
  `rgb(${r}, ${g}, ${bl})`,
);

console.log('\nZuschnitt fürs Freundebuch:');
pruefe(ergebnis.zu.quer.join() === '1600,1000,quer', 'Querfoto 4:3 wird 8:5 — 1600×1000', ergebnis.zu.quer.join(' '));
pruefe(ergebnis.zu.hoch.join() === '1280,1600,hoch', 'Hochfoto 3:4 wird 4:5 — 1280×1600', ergebnis.zu.hoch.join(' '));
pruefe(ergebnis.zu.klein.join() === '800,500,quer', 'ein kleines Foto wird beschnitten, nicht hochgerechnet', ergebnis.zu.klein.join(' '));
pruefe(ergebnis.zu.ohne === null, 'ohne Zuschnitt bleibt alles wie vorher (Profilbild)', String(ergebnis.zu.ohne));
const [oben, unten] = ergebnis.kanten;
pruefe(
  oben[0] < 60 && oben[2] > 200 && unten[0] < 60 && unten[2] > 200,
  'beschnitten wird mittig — der rote Rand oben und unten ist weg',
  `oben rgb(${oben.slice(0, 3)}) · unten rgb(${unten.slice(0, 3)})`,
);

/*
 * Wie auf dem iPhone: `createImageBitmap` wirft („The source image cannot be
 * decoded", gemeldet am 25.09.2026). Der Upload muss trotzdem gehen.
 */
console.log('\nWenn createImageBitmap scheitert (Safari):');
const safari = await seite.evaluate(async () => {
  const { verkleinern } = await import('/src/lib/bild.ts');
  const echt = window.createImageBitmap;
  window.createImageBitmap = () =>
    Promise.reject(new DOMException('The source image cannot be decoded.', 'InvalidStateError'));
  try {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 900;
    c.getContext('2d').fillRect(0, 0, 1200, 900);
    const blob = await new Promise((f) => c.toBlob(f, 'image/jpeg'));
    const r = await verkleinern(blob, 1600, 0.82, true);
    let meldung = '';
    try {
      await verkleinern(new Blob(['kein Bild'], { type: 'image/jpeg' }));
    } catch (e) {
      meldung = String(e.message);
    }
    return { b: r.breite, h: r.hoehe, typ: r.blob.type, meldung };
  } catch (e) {
    return { fehler: String(e.message) };
  } finally {
    window.createImageBitmap = echt;
  }
});
pruefe(
  safari.b === 1200 && safari.h === 750 && safari.typ === 'image/jpeg',
  'das Bild wird trotzdem gelesen, beschnitten und als JPEG geliefert',
  safari.fehler ?? `${safari.b}×${safari.h} ${safari.typ}`,
);
pruefe(
  /kann der Browser nicht lesen/.test(safari.meldung ?? ''),
  'ein kaputtes Bild meldet sich auf Deutsch, statt mit der englischen Browsermeldung',
  safari.meldung ?? safari.fehler,
);

pruefe(ergebnis.beispiel === '6,2 MB', 'Größenangabe deutsch formatiert', ergebnis.beispiel);

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
