/**
 * Die Layout-Vorlagen für Freundebuch-Beiträge.
 *
 * ## Warum es diese Datei gibt
 *
 * Bis zum 22.09.2026 sah jeder Beitrag gleich aus: ein Bild, 4:3, Text darunter.
 * Das ist die Form eines Polaroids und für ein Polaroid richtig — aber ein Torii
 * im Hochformat wird darin oben und unten abgeschnitten, eine Küstenlinie
 * seitlich, und vier Bilder von einem Abend wurden vier Beiträge.
 *
 * ## Reine Logik, kein Zustand
 *
 * Kein `$state`, kein DOM, kein Supabase — wie `src/lib/tagebuch.ts`. Alles hier
 * ist mit vitest prüfbar, und die Komponenten holen sich nur Antworten.
 *
 * ## Die Liste führt der Client
 *
 * In der Datenbank ist `vorlage` ein freies `text` ohne Enum — dasselbe Muster
 * wie `sticker` seit `0003_freundebuch.sql`. Eine neue Vorlage kostet damit
 * **keine** Migration. Der Preis ist, dass ein unbekannter Wert vorkommen kann;
 * `vorlageVon()` fängt das ab.
 */

import type { Format } from './bild';

/** Die Kennungen, wie sie in `guestbook_post.vorlage` stehen. */
export type VorlageName = 'polaroid' | 'hochkant' | 'panorama' | 'streifen' | 'collage';

export type Vorlage = {
  id: VorlageName;
  /** Der Name auf dem Knopf. */
  name: string;
  /** Ein Zeichen als Marke — dieselbe Sprache wie die Aufkleberwahl daneben. */
  zeichen: string;
  /** Wie viele Bilder die Vorlage sinnvoll zeigt. */
  min: number;
  max: number;
  /** Was die Maske unter dem Knopf sagt. */
  was: string;
};

/**
 * Höchstzahl Bilder je Beitrag.
 *
 * Vier, nicht mehr, und die Zahl hat zwei Gründe. Gestalterisch: Ein 2×2-Raster
 * ist auf 390 px die letzte Aufteilung, in der man noch etwas erkennt; bei neun
 * Feldern sind es Briefmarken. Und gerechnet: `verkleinern()` liefert rund 300 kB
 * je Foto, ein Beitrag mit vier Bildern ist also ~1,2 MB. Die Gästeseite lädt
 * acht Tagesgruppen auf einmal (`SCHRITT` in `Tagebuch.svelte`), und das
 * Freikontingent von Supabase sind 5 GB im Monat.
 */
export const BILDER_MAX = 4;

/**
 * Die fünf Vorlagen, in der Reihenfolge, in der sie in der Maske stehen: von
 * einem Bild bis zur Collage.
 *
 * `polaroid` steht vorn und ist die Vorgabe — es ist das, was alle bestehenden
 * Beiträge zeigen, und der Wechsel soll eine Entscheidung sein, kein Versehen.
 */
export const VORLAGEN: Vorlage[] = [
  {
    id: 'polaroid',
    name: 'Polaroid',
    zeichen: '▭',
    min: 1,
    max: 1,
    was: 'Ein Bild in seinem Format, Text darunter',
  },
  {
    id: 'hochkant',
    name: 'Hochkant',
    zeichen: '▯',
    min: 1,
    max: 1,
    was: 'Ein Bild im Hochformat, 4:5',
  },
  {
    id: 'panorama',
    name: 'Panorama',
    zeichen: '▬',
    min: 1,
    max: 1,
    was: 'Ein breites Bild, 8:5, über die ganze Breite',
  },
  {
    id: 'streifen',
    name: 'Filmstreifen',
    zeichen: '⦙',
    min: 2,
    max: 3,
    was: 'Zwei oder drei Bilder nebeneinander',
  },
  {
    id: 'collage',
    name: 'Collage',
    zeichen: '⊞',
    min: 2,
    max: BILDER_MAX,
    was: 'Bis zu vier Bilder, hoch und quer gemischt',
  },
];

/** Die Vorgabe — und das, was ein Beitrag ohne Angabe zeigt. */
export const VORGABE: VorlageName = 'polaroid';

/**
 * Die Vorlage zu einem gespeicherten Wert.
 *
 * Rückfall auf Polaroid bei `null` **und** bei einem unbekannten Wert. Das
 * Zweite ist der eigentliche Punkt: Legt ein Gerät mit neuerer App-Fassung einen
 * Beitrag mit `vorlage: 'raster'` an, soll er auf einem Gerät mit älterer Fassung
 * **wie ein Polaroid** erscheinen und nicht verschwinden. Unterwegs ist ein
 * Beitrag, den ein Telefon zeigt und ein anderes nicht, schlimmer als ein Beitrag
 * im falschen Layout.
 */
export function vorlageVon(wert: string | null | undefined): Vorlage {
  return VORLAGEN.find((v) => v.id === wert) ?? VORLAGEN.find((v) => v.id === VORGABE)!;
}

/** Passt die Bildzahl zur Vorlage? */
export function bilderPassen(v: Vorlage, anzahl: number): boolean {
  return anzahl >= v.min && anzahl <= v.max;
}

/**
 * Was in der Maske unter der Vorlagenwahl steht — oder `null`, wenn alles passt.
 *
 * **Ein Hinweis und keine Sperre.** Ein Formular, das auf dem Telefon das
 * Absenden verweigert, weil ein Bild fehlt, kostet den Beitrag: Man steht im
 * Regen, tippt zweimal und lässt es. Gerendert wird deshalb robust — eine Collage
 * mit zwei Bildern füllt zwei Felder — und hier steht nur, was zu erwarten ist.
 */
export function hinweis(v: Vorlage, anzahl: number): string | null {
  if (bilderPassen(v, anzahl)) return null;
  if (anzahl === 0) {
    return `${v.name} zeigt ${v.min === v.max ? 'ein Bild' : `${v.min} bis ${v.max} Bilder`} — ohne Bild wird es ein Textbeitrag.`;
  }
  if (anzahl < v.min) {
    return `${v.name} zeigt ${v.min} bis ${v.max} Bilder, du hast ${anzahl}. Geht trotzdem, es bleiben Felder leer.`;
  }
  return `${v.name} zeigt ${v.max === 1 ? 'ein Bild' : `höchstens ${v.max} Bilder`}, du hast ${anzahl}. Die übrigen erscheinen nicht.`;
}

/**
 * Wie viele Bilder die Vorlage zeigt — mehr werden nicht gerendert.
 *
 * Getrennt von `bilderPassen()`, weil das zwei Fragen sind: „passt es" ist für
 * den Hinweis, „wie viele zeige ich" für die Darstellung. Beide Stellen aus einer
 * Funktion zu bedienen hätte geheißen, dass ein Beitrag mit fünf Bildern in der
 * Collage fünf Felder bekommt.
 */
export function bilderZeigen<T>(v: Vorlage, bilder: T[]): T[] {
  return bilder.slice(0, v.max);
}

/**
 * Die Bildpfade einer Datenbankzeile — Array bevorzugt, `bild_pfad` als Rückfall.
 *
 * Beide Spalten stehen nebeneinander, und das ist Absicht: `bild_pfade` ist seit
 * Migration 0009 die Wahrheit, `bild_pfad` trägt weiter das **erste** Bild. Ein
 * Telefon mit zwischengespeichertem altem JavaScript liest nur die alte Spalte;
 * ohne sie zeigte es plötzlich bildlose Beiträge.
 *
 * Der Rückfall ist zugleich der Weg für eine Datenbank, in der 0009 **noch nicht**
 * eingespielt ist: Dann kommt das Array gar nicht mit, und hier steht trotzdem
 * der eine Pfad.
 */
export function pfadeVon(zeile: {
  bild_pfade?: string[] | null;
  bild_pfad?: string | null;
}): string[] {
  const reihe = zeile.bild_pfade;
  if (Array.isArray(reihe) && reihe.length) return reihe.filter((p): p is string => Boolean(p));
  return zeile.bild_pfad ? [zeile.bild_pfad] : [];
}

/**
 * Die Klassen für das `<article>` eines Beitrags.
 *
 * `polaroid` ist die Grundklasse **und** eine Vorlage. Naiv zusammengesetzt
 * (`polaroid ${id}`) stand bei der Vorgabe `class="polaroid polaroid"` im
 * Markup — wirkungslos im CSS, aber verwirrend in den Entwicklerwerkzeugen und in
 * der Ausgabe jeder Prüfung, die Klassen anzeigt. Die Vorgabe braucht keinen
 * Zusatz: Sie ist die Grundklasse.
 */
export function vorlagenklasse(wert: string | null | undefined): string {
  const v = vorlageVon(wert);
  return v.id === VORGABE ? 'polaroid' : `polaroid ${v.id}`;
}

/**
 * Das Format eines Bildes aus seinem Dateinamen (`…-hoch.jpg`, `…-quer.jpg`).
 *
 * Seit dem 24.09.2026 schneidet `verkleinern()` jedes Beitragsbild auf 4:5 oder
 * 8:5 zu und schreibt das Format in den Namen. Ältere Bilder tragen keins —
 * dann `null`, und `Bildfeld` misst nach dem Laden nach.
 */
export function formatAusPfad(pfad: string): Format | null {
  const m = /-(hoch|quer)\.jpg(?:[?#]|$)/.exec(pfad);
  return m ? (m[1] as Format) : null;
}

/**
 * Wie eine Collage ihre Bilder legt — die Klassen je Bild und für das Raster.
 *
 * Die Rechnung dahinter: Ein Querbild (8:5) ist so breit und hoch wie zwei
 * Hochbilder (4:5) nebeneinander. Das Raster hat zwei Spalten, ein Querbild nimmt
 * beide, zwei Hochbilder teilen sich eine Zeile — jede Zeile ist gleich hoch, und
 * mit `grid-auto-flow: dense` finden Hochbilder ihren Partner auch dann, wenn ein
 * Querbild zwischen ihnen steht.
 *
 * Zwei Sonderfälle:
 * - **Drei Hochbilder**: eins groß links, zwei klein rechts übereinander. Die
 *   Maße gehen auf (2 Teile breit × 2,5 hoch links = zwei 1 × 1,25 rechts).
 * - **Ein übriges Hochbild** bei ungerader Zahl: Es nimmt die ganze Zeile und
 *   wird dort im Querformat gezeigt — sonst stünde neben ihm ein Loch.
 */
export function collageAnordnung(formate: Format[]): { raster: string; bilder: string[] } {
  const hoch = formate.map((f, i) => (f === 'hoch' ? i : -1)).filter((i) => i >= 0);
  if (formate.length === 3 && hoch.length === 3) {
    return { raster: 'drei-hoch', bilder: ['hoch gross', 'hoch', 'hoch'] };
  }
  const allein = formate.length > 1 && hoch.length % 2 === 1 ? hoch[hoch.length - 1] : -1;
  return {
    raster: '',
    bilder: formate.map((f, i) => (i === allein ? 'hoch allein' : f)),
  };
}
