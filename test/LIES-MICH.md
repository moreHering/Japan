# Prüfungen

| Befehl | Was es prüft | Braucht |
|---|---|---|
| `npm test` | Abgleich-Logik (33 Prüfungen) gegen einen strengen PostgREST-Ersatz | nichts |
| `npm run db:test` | Schema, Nummernvergabe und Zugriffsregeln gegen einen lokalen Postgres | `postgresql` installiert |
| `npm run test:browser` | Erfassung eigener Orte im iPhone-Format | `npm run preview` auf Port 4321 |
| `npm run test:bild` | Verkleinern der Fotos im echten Browser | `npm run dev` auf Port 4322 |
| `npm run test:buch` | Freundebuch mit Inhalt im iPhone-Format | `npm run dev` auf Port 4322 |

Die beiden letzten laufen gegen den **Entwicklungsserver**, weil der die Module
einzeln ausliefert: Nur so lässt sich `src/lib/bild.ts` direkt importieren und
der Zustand des Freundebuchs von außen setzen.

```sh
npm run build && npm run preview &      # Port 4321
npm run dev -- --port 4322 &            # Port 4322
npm test && npm run db:test && npm run test:browser && npm run test:bild && npm run test:buch
```

## Was hier nicht geprüft wird

- **Das echte Supabase.** Aus der Entwicklungsumgebung nicht erreichbar
  (API 403 am Proxy, Direktverbindung nur über IPv6, Pooler-Ports zu). Geprüft
  wird die Form der Anfragen und die Logik darüber — nicht, dass Supabase sich
  genauso verhält.
- **Die Bilderablage.** Das `storage`-Schema gehört Supabase und existiert
  lokal nicht. Die Zeilenebene (wer darf lesen, schreiben, löschen) wird
  geprüft, die Dateiebene nicht.
- **Kartenkacheln und Schriften.** Von OpenStreetMap und Google Fonts, beide
  in dieser Umgebung gesperrt. Die Karte bleibt in den Tests grau, die Schrift
  fällt auf die Ersatzschrift zurück.
