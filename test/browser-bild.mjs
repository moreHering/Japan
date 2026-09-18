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

const BASIS = process.env.DEV ?? 'http://localhost:4322/Japan';

let fehler = 0;
const pruefe = (bedingung, text, zusatz = '') => {
  if (bedingung) console.log(`  ok    ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  else {
    fehler += 1;
    console.log(`  FEHL  ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  }
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
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

  return {
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

pruefe(ergebnis.beispiel === '6,2 MB', 'Größenangabe deutsch formatiert', ergebnis.beispiel);

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
