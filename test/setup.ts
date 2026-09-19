/**
 * Kleinste Browserumgebung, die die Module zum Laufen brauchen.
 *
 * Kein jsdom: Gebraucht werden `localStorage` und je ein `addEventListener` an
 * `window` und `document`. Ein vollständiges DOM würde nichts zusätzlich
 * beweisen und den Prüfstand nur langsamer machen.
 */

class Speicher implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}

/*
 * Die zwei Instanzen tragen **nicht** die Namen `localStorage` und
 * `sessionStorage`, und das ist der Punkt dieser Zeilen.
 *
 * Diese Datei hat keinen `import` und kein `export` — TypeScript behandelt sie
 * deshalb als Skript und nicht als Modul, und ihre Deklarationen auf oberster Ebene
 * sind **globale**. Ein `const localStorage` kollidiert dann mit dem
 * `declare var localStorage` aus `lib.dom` — zwei Fehler TS2451, jedes Mal:
 *
 *     test/setup.ts(31,7): error TS2451: Cannot redeclare block-scoped variable
 *
 * Das ist lange niemandem aufgefallen, weil `npm test` davon nichts merkt (vitest
 * übersetzt ohne Typprüfung) und weil jeder Aufruf von `npx tsc --noEmit` hier mit
 * einem `grep -v test/setup.ts` endete. Erst als der Wächter `tsc` im CI ausführen
 * sollte, wurde daraus ein blockierter Deploy — an zwei Zeilen, die mit der
 * Anwendung nichts zu tun haben. Ein Wächter, der dauerhaft rot steht, ist kein
 * Wächter.
 */
const speicher = new Speicher();
const sitzungsSpeicher = new Speicher();

const g = globalThis as Record<string, unknown>;
g.localStorage = speicher;
g.sessionStorage = sitzungsSpeicher;
g.window = {
  localStorage: speicher,
  sessionStorage: sitzungsSpeicher,
  addEventListener() {},
  removeEventListener() {},
};
g.document = {
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
};
