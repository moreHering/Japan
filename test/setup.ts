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

const localStorage = new Speicher();
const sessionStorage = new Speicher();

const g = globalThis as Record<string, unknown>;
g.localStorage = localStorage;
g.sessionStorage = sessionStorage;
g.window = { localStorage, sessionStorage, addEventListener() {}, removeEventListener() {} };
g.document = {
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
};
