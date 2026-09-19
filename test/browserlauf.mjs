/**
 * Gemeinsames für die Browsersuiten: wo der Dev-Server steht, welcher Browser
 * startet.
 *
 * Beides stand vorher in jeder der zehn Dateien einzeln, und beides war
 * uneinheitlich. Das ist keine Geschmacksfrage gewesen, sondern zwei Fehler:
 *
 * **1. Der falsche Port.** `browser-orte.mjs` fiel auf **4321** zurück, alle
 * anderen auf 4322. Ein `npm run test:all` schickte diese eine Suite also gegen
 * einen Port, an dem nichts horcht — sie meldete danach Fehler, die keine waren,
 * und man sucht sie im falschen Code. Dazu lasen manche Dateien nur `BASIS`,
 * andere nur `DEV`, drei beides.
 *
 * **2. Ein Browserpfad, der ins Nichts zeigt.** `executablePath` stand hart auf
 * `/opt/pw-browsers/chromium`. Das ist richtig für **diese** Umgebung, und der
 * Grund steht unten. Auf einem GitHub-Runner gibt es den Pfad nicht, und dort ist
 * ein gesetzter falscher Pfad schlechter als keiner: Playwright nimmt dann
 * **nicht** seinen eigenen installierten Browser, sondern scheitert am Start.
 *
 * Seit es den Wächter im CI gibt, laufen dieselben Suiten an zwei Orten mit
 * verschiedenen Voraussetzungen. Deshalb eine Stelle statt zehn.
 */

import { existsSync } from 'node:fs';

/**
 * Die Basis-URL des Dev-Servers, einschließlich `/Japan`.
 *
 * `BASIS` zuerst, `DEV` als Zweitname — beide Namen waren im Umlauf, und was in
 * Shell-Historien steht, soll weiter tun, was es getan hat.
 *
 * Es muss der **Dev**-Server sein und nicht `astro preview`: Sechs der Suiten
 * rufen im Browser `await import('/src/lib/store.svelte.ts')` auf, um den Plan
 * direkt zu setzen statt Orte anzuklicken. Diesen Pfad löst nur Vite im
 * Dev-Modus auf; im statischen Build gibt es ihn nicht. Der Preis ist benannt:
 * Die Suiten prüfen den Dev-Stand, nicht Byte für Byte das ausgelieferte Bundle.
 */
export const BASIS = process.env.BASIS ?? process.env.DEV ?? 'http://localhost:4322/Japan';

/**
 * Was `chromium.launch()` mitbekommt — entweder ein Pfad oder nichts.
 *
 * Warum hier überhaupt ein Pfad steht: Die installierte Playwright-Fassung
 * erwartet einen neueren Chromium als den, der im Bild dieser Umgebung liegt,
 * und nachladen lässt die Netzrichtlinie nicht zu. Ohne den ausdrücklichen Pfad
 * sucht Playwright eine Revision, die es hier nicht gibt.
 *
 * Auf einem GitHub-Runner holt `npx playwright install chromium` die **passende**
 * Revision. Dort ist `/opt/pw-browsers/chromium` nicht vorhanden, `START` bleibt
 * leer, und Playwright findet seinen eigenen Browser selbst — genau richtig.
 *
 * Geprüft wird die Existenz und nicht die Umgebung: Eine Abfrage auf
 * `process.env.CI` wäre eine Vermutung darüber, wo man ist; `existsSync` ist eine
 * Aussage darüber, was da ist.
 */
const browserPfad = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
export const START = existsSync(browserPfad) ? { executablePath: browserPfad } : {};

/**
 * Die Kachelhosts, die `browser-karte.mjs` abfängt.
 *
 * Steht hier, weil die Liste zur Umgebung gehört und nicht zur Prüfung: Sie muss
 * mit den Hosts in `MapView.svelte` und `karte.ts` übereinstimmen. Kommt dort
 * einer dazu, gehört er hierher — sonst prüft die Suite einen Fehlerfall, den sie
 * nur halb hergestellt hat.
 */
export const KACHELHOSTS = /tiles\.openfreemap\.org|tile\.openstreetmap\.org|basemaps\.cartocdn\.com/;
