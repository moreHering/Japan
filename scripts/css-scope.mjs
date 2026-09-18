/**
 * Bindet ein fremdes Stylesheet an einen Container.
 *
 * Gebraucht, weil der Reiseband jetzt **im** Planer liegt, nicht nur daneben:
 * Sein CSS benutzt `:root`, `html`, `body` und Klassennamen wie `.eyebrow` und
 * `.wrap`, die die App selbst führt. Unverändert eingebunden würde es die
 * gesamte Anwendung umlackieren.
 *
 * Deshalb bekommt jeder Selektor den Container vorangestellt:
 *
 *     .chapter h2 { … }        →  .bandtext .chapter h2 { … }
 *     :root { --shu: … }       →  .bandtext { --shu: … }
 *     body { font-size: 18px } →  .bandtext { font-size: 18px }
 *
 * `:root`, `html` und `body` werden **ersetzt**, nicht erweitert: Sie meinen im
 * Originaldokument den Rahmen, und der Rahmen ist hier der Container. Als
 * `.bandtext html` wären sie wirkungslos, und die Schriftgröße des Bandes
 * käme nie an — der Text sähe aus wie der Rest der App.
 *
 * Nicht angefasst werden `@keyframes` (ihre `from`/`to` sind keine Selektoren,
 * ein Präfix macht die Animation kaputt) und `@font-face`. `@page` fällt weg:
 * Seitenränder für den Druck gehören dem eigenständigen Dokument, nicht einem
 * Abschnitt in einer größeren Seite.
 */

/** At-Regeln, deren Inhalt selbst wieder Selektoren enthält. */
const VERSCHACHTELT = /^@(media|supports|layer|container)\b/i;
/** At-Regeln, deren Inhalt keine Selektoren sind — Inhalt unverändert lassen. */
const ROH = /^@(keyframes|-webkit-keyframes|font-face|counter-style|property)\b/i;
/** At-Regeln, die in einem eingebetteten Abschnitt nichts zu suchen haben. */
const WEG = /^@page\b/i;

/**
 * Zerlegt CSS in Regeln auf oberster Ebene. Klammerbewusst, damit eine
 * geschweifte Klammer in einem `content:"{"` nichts zerreißt.
 */
function teile(css) {
  const regeln = [];
  let kopf = '';
  let i = 0;

  while (i < css.length) {
    const z = css[i];

    // Kommentare und Zeichenketten überspringen, damit Klammern darin zählen nicht.
    if (z === '/' && css[i + 1] === '*') {
      const ende = css.indexOf('*/', i + 2);
      i = ende === -1 ? css.length : ende + 2;
      continue;
    }
    if (z === '"' || z === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== z) j += css[j] === '\\' ? 2 : 1;
      kopf += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (z === ';' && !kopf.includes('{')) {
      // At-Regel ohne Rumpf, z. B. @import oder @charset.
      const text = (kopf + z).trim();
      if (text) regeln.push({ art: 'roh', text });
      kopf = '';
      i++;
      continue;
    }

    if (z === '{') {
      let tiefe = 1;
      let j = i + 1;
      while (j < css.length && tiefe > 0) {
        const c = css[j];
        if (c === '/' && css[j + 1] === '*') {
          const ende = css.indexOf('*/', j + 2);
          j = ende === -1 ? css.length : ende + 2;
          continue;
        }
        if (c === '"' || c === "'") {
          let k = j + 1;
          while (k < css.length && css[k] !== c) k += css[k] === '\\' ? 2 : 1;
          j = k + 1;
          continue;
        }
        if (c === '{') tiefe++;
        else if (c === '}') tiefe--;
        j++;
      }
      regeln.push({ art: 'block', selektor: kopf.trim(), rumpf: css.slice(i + 1, j - 1) });
      kopf = '';
      i = j;
      continue;
    }

    kopf += z;
    i++;
  }
  return regeln;
}

/** Einen einzelnen Selektor an den Container binden. */
function bindeSelektor(selektor, container) {
  return selektor
    .split(',')
    .map((teil) => {
      const s = teil.trim();
      if (!s) return '';

      // Der Rahmen des Originaldokuments **ist** hier der Container.
      if (s === ':root' || s === 'html' || s === 'body') return container;
      // Zusammensetzungen wie `body.print` oder `html:lang(de)`: den Rahmenteil
      // durch den Container ersetzen, den Rest behalten.
      const rahmen = s.match(/^(?::root|html|body)(?=[.:#[\s>+~]|$)(.*)$/s);
      if (rahmen) return `${container}${rahmen[1]}`;
      // `body .foo` oder `html > .foo`: der Rahmen fällt weg.
      const darin = s.match(/^(?::root|html|body)\s*(?:[>+~]\s*)?(.+)$/s);
      if (darin) return `${container} ${darin[1].trim()}`;

      return `${container} ${s}`;
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * @param {string} css    Das fremde Stylesheet.
 * @param {string} container Selektor des Containers, z. B. `.bandtext`.
 * @returns {string}
 */
export function scope(css, container) {
  return teile(css)
    .map((r) => {
      if (r.art === 'roh') return WEG.test(r.text) ? '' : r.text;
      const sel = r.selektor;

      if (WEG.test(sel)) return '';
      if (ROH.test(sel)) return `${sel}{${r.rumpf}}`;
      if (VERSCHACHTELT.test(sel)) return `${sel}{${scope(r.rumpf, container)}}`;
      if (sel.startsWith('@')) return `${sel}{${r.rumpf}}`;

      return `${bindeSelektor(sel, container)}{${r.rumpf}}`;
    })
    .filter(Boolean)
    .join('\n');
}
