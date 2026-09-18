# Datenbank scharfschalten — Schritt für Schritt

Du brauchst **eine Sache**: das Datenbankpasswort deines Supabase-Projekts.
Alles andere — Adresse, Region, Benutzername — sucht der Workflow selbst.

Dauer: etwa drei Minuten.

> **Was hier absichtlich nicht steht:** das Anmeldepasswort und der
> Supabase-Schlüssel. Dieses Repository ist öffentlich; was hier steht, steht
> für immer im Git-Verlauf. Beide Werte hast du im Chat, sie gehören nur in die
> Secret-Felder.

---

## Teil 1 — Datenbankpasswort besorgen

Im Dashboard: https://supabase.com/dashboard/project/hfrvdbaiyeddeiyprwmw

Gesucht ist **nicht** dein Supabase-Login, sondern das Passwort der
Postgres-Datenbank. Wo es steht, hängt von der Fassung der Oberfläche ab —
deshalb hier kein Klickpfad, sondern wonach du suchst:

- Ein Bereich mit **Database** im Namen, in den Projekt-Einstellungen
  (Zahnrad-Symbol) oder im linken Menü.
- Darin ein Feld **Database password** mit einem Knopf zum **Zurücksetzen**
  (*Reset database password* / *Generate new password*).
- Alternativ ein Knopf **Connect** oben am Projekt — dahinter stehen die
  Verbindungsdaten, oft mit einem Link zum Passwort.

**Wenn du es nicht mehr weißt: setz es neu.** Es benutzt bisher nichts, du
machst nichts kaputt. Das neue wird **nur einmal angezeigt** — sofort kopieren.

Findest du nichts davon: schreib mir, was dein linkes Menü zeigt. Ich kann
`supabase.com` von hier nicht aufrufen und rate lieber nicht.

---

## Teil 2 — Als Secret hinterlegen

### 2.1 Die richtige Seite

https://github.com/moreHering/Japan/settings/secrets/actions

Oben drei Reiter: **Actions**, Codespaces, Dependabot. Es muss **Actions**
sein — der Link öffnet ihn direkt.

> Ein Secret unter *Codespaces* oder *Dependabot* sieht identisch aus, kommt
> beim Workflow aber nie an. Das ist die wahrscheinlichste Ursache dafür, dass
> beim letzten Mal alle vier leer ankamen.

### 2.2 Der richtige Block

Die Seite hat zwei Blöcke untereinander:

1. **Environment secrets** — oben, meist leer. **Nicht hier.**
2. **Repository secrets** — darunter, mit dem grünen Knopf
   **New repository secret**.

### 2.3 Anlegen

| Feld | Wert |
|---|---|
| **Name** | `SUPABASE_DB_PASSWORD` |
| **Secret** | das Passwort aus Teil 1, unverändert |

Sonderzeichen sind kein Problem — der Workflow kodiert sie selbst um. Nur
**keine Anführungszeichen drumherum** und keine Leerzeichen davor oder dahinter.

Dann **Add secret**. Danach steht in der Liste unter *Repository secrets*:

```
SUPABASE_DB_PASSWORD        Updated now
```

---

## Teil 3 — Die drei übrigen

Dieselbe Seite, derselbe Knopf:

| Name | Wert |
|---|---|
| `ACCOUNT_PW` | euer gemeinsames Anmeldepasswort (steht im Chat) |
| `PUBLIC_SUPABASE_URL` | `https://hfrvdbaiyeddeiyprwmw.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | der `sb_publishable_…`-Schlüssel |

Den Schlüssel findest du im Dashboard in einem Bereich mit **API** im Namen,
bei den **publishable** keys. Er darf öffentlich sein — geschützt wird über Row
Level Security, nicht über seine Geheimhaltung. Als Secret steht er trotzdem,
damit er sich austauschen lässt, ohne Code zu ändern.

Fehlt `ACCOUNT_PW`, läuft die Migration, legt aber die drei Konten nicht an.
Fehlen die beiden `PUBLIC_*`, baut die Seite durch, kann aber nicht abgleichen.

---

## Teil 4 — Fertig melden

Schreib „Secrets stehen". Dann:

1. Ich stoße den Workflow an.
2. Er sucht den Pooler des Projekts. Eine falsche Region antwortet sofort mit
   *Tenant or user not found* — das dauert keine Sekunde pro Versuch. Die
   gefundene Region meldet er, damit sie sich festschreiben lässt.
3. Er spielt die vier Migrationen ein und prüft das Ergebnis.
4. Erfolg heißt nicht „grün", sondern: **acht Tabellen, jede mit `rls = t` und
   mindestens einer Policy**, dazu Paule, Deggel und Baldes in `profiles` und
   die Bilderablage vorhanden.
5. Geht etwas schief, lese ich den Fehler und sage dir, woran es lag.

Ab da verwalte ich die Migrationen allein.

---

## Wenn es hakt

**Der Workflow sagt „kommt leer an".**
Mach ein Bildschirmfoto von `.../settings/secrets/actions`. Die **Namen** sind
darauf sichtbar, die **Werte nicht** — das kannst du gefahrlos schicken, und
ich sehe sofort, ob Name, Reiter oder Block nicht stimmen.

**„Region … ist richtig, das Passwort nicht."**
Dann hat der Workflow das Projekt gefunden, aber die Anmeldung scheitert.
Passwort neu setzen und das Secret ersetzen.

**„In keiner der geprüften Regionen antwortet das Projekt."**
Entweder ist das Projekt pausiert — Supabase pausiert kostenlose Projekte nach
einer Woche ohne Zugriff, dann steht im Dashboard ein Knopf zum Aufwecken —
oder die Projekt-Referenz stimmt nicht. Die steht in der Adresse des
Dashboards: `dashboard/project/<HIER>`.

**Du hast den vollständigen Connection String zur Hand.**
Dann geht es auch ohne Suche: als Secret `SUPABASE_DB_URL` hinterlegen. Gesucht
ist die Form

```
postgresql://postgres.<ref>:<passwort>@…pooler.supabase.com:5432/postgres
```

also der **Session-Pooler**, nicht die direkte Verbindung — die gibt es nur
über IPv6, und das haben GitHub-Runner nicht. Steht im String noch
`[YOUR-PASSWORD]`, muss der ganze Block samt eckiger Klammern durch das echte
Passwort ersetzt werden.

---

## Der Weg ganz ohne GitHub

`npm run db:dashboard` erzeugt aus den Migrationen eine Fassung ohne
psql-Befehle. Die vier Dateien fügst du im SQL-Editor des Dashboards
nacheinander ein und drückst **Run**:

```
0001_init.dashboard.sql
0002_accounts.dashboard.sql     ← hier vorher HIER-DAS-PASSWORT-EINSETZEN ersetzen
0003_freundebuch.dashboard.sql
0004_unterkunft.dashboard.sql
```

Damit steht die Datenbank. **Die beiden `PUBLIC_*`-Secrets brauchst du
trotzdem** — ohne sie kommen die Zugangsdaten nicht in die gebaute Seite, und
die App bleibt offline-only.
