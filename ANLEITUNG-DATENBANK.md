# Datenbank scharfschalten — Schritt für Schritt

Ziel: ein Secret in GitHub, danach übernehme ich den Rest.

Dauer: etwa fünf Minuten. Du brauchst zwei Browser-Tabs — Supabase und GitHub.

> **Was hier absichtlich nicht steht:** das Anmeldepasswort und der
> Supabase-Schlüssel. Dieses Repository ist öffentlich; was hier steht, steht
> für immer im Git-Verlauf. Beide Werte hast du im Chat, sie gehören nur in die
> Secret-Felder.

---

## Teil 1 — Connection String bei Supabase holen

### 1.1 Projekt öffnen

https://supabase.com/dashboard/project/hfrvdbaiyeddeiyprwmw

### 1.2 Datenbank-Passwort besorgen

Das brauchst du gleich. **Wenn du es nicht mehr weißt, setz es neu** — es
benutzt bisher nichts, du machst damit nichts kaputt:

1. Links unten **Project Settings** (Zahnrad) → **Database**
2. Abschnitt **Database password** → Knopf **Reset database password**
3. Supabase erzeugt ein neues. **Sofort kopieren und wegspeichern** — es wird
   nur dieses eine Mal angezeigt.

> **Falle:** Enthält das Passwort eines dieser Zeichen — `@ : / ? # [ ] %` —
> muss es im Connection String umkodiert werden, sonst bricht die Verbindung.
> Einfacher: Reset drücken, bis eines ohne diese Zeichen kommt. Oder du gibst
> es mir so, wie es ist, und ich sage dir, ob es umkodiert werden muss.

### 1.3 Den String kopieren

Auf derselben Seite (**Project Settings → Database**) gibt es den Abschnitt
**Connection string**. In neueren Oberflächen sitzt er stattdessen hinter dem
Knopf **Connect** ganz oben.

Dort zwei Dinge einstellen:

- Typ: **URI** (nicht PSQL, nicht JDBC, nicht Golang)
- Modus: **Session pooler** (nicht „Direct connection", nicht „Transaction
  pooler")

> Warum Session pooler: Die direkte Adresse `db.<projekt>.supabase.co` gibt es
> nur über IPv6. GitHub-Runner haben das nicht. Der Session-Pooler läuft über
> IPv4 und kann alles, was Migrationen brauchen.

Der String sieht so aus:

```
postgresql://postgres.hfrvdbaiyeddeiyprwmw:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

Die Region (`eu-central-1`) kann bei dir anders lauten — nimm, was dasteht.

### 1.4 Passwort einsetzen

`[YOUR-PASSWORD]` ist ein Platzhalter, **eckige Klammern inklusive**. Ersetz
den ganzen Block durch das Passwort aus Schritt 1.2.

Richtig:

```
postgresql://postgres.hfrvdbaiyeddeiyprwmw:GeheimesPasswort@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

Falsch — Klammern stehengelassen:

```
postgresql://postgres.hfrvdbaiyeddeiyprwmw:[GeheimesPasswort]@aws-0-…
```

**Prüf zum Schluss:** Kein `[` und kein `]` mehr im String, und er beginnt mit
`postgresql://`.

---

## Teil 2 — Secret in GitHub anlegen

### 2.1 Die richtige Seite

https://github.com/moreHering/Japan/settings/secrets/actions

Oben stehen drei Reiter: **Actions**, **Codespaces**, **Dependabot**. Du musst
auf **Actions** sein — das ist der Standard beim Öffnen des Links.

> **Das ist die wahrscheinlichste Ursache für das, was beim letzten Mal schief
> ging.** Ein Secret unter Codespaces oder Dependabot sieht genauso aus, kommt
> beim Workflow aber nie an.

### 2.2 Den richtigen Knopf

Die Seite hat zwei Blöcke untereinander:

1. **Environment secrets** — ganz oben, meist leer. **Nicht hier.**
2. **Repository secrets** — darunter, mit dem grünen Knopf
   **New repository secret** rechts.

Nimm den unteren Block, **Repository secrets**.

### 2.3 Anlegen

**Name** (exakt so, Großbuchstaben, Unterstriche):

```
SUPABASE_DB_URL
```

**Secret**: der String aus Schritt 1.4.

Dann **Add secret**.

### 2.4 Kontrolle

Danach steht in der Liste unter *Repository secrets*:

```
SUPABASE_DB_URL        Updated now
```

Steht es woanders oder heißt es anders, ist es falsch.

---

## Teil 3 — Die drei übrigen Secrets

Dieselbe Seite, derselbe Knopf, drei Mal:

| Name | Wert |
|---|---|
| `ACCOUNT_PW` | euer gemeinsames Anmeldepasswort (steht im Chat) |
| `PUBLIC_SUPABASE_URL` | `https://hfrvdbaiyeddeiyprwmw.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | der `sb_publishable_…`-Schlüssel |

Den Schlüssel findest du unter *Project Settings → API Keys* → **publishable**.
Er darf öffentlich sein — geschützt wird über Row Level Security, nicht über
seine Geheimhaltung. Als Secret steht er trotzdem, damit er sich austauschen
lässt, ohne Code zu ändern.

`ACCOUNT_PW` fehlt → die Migration läuft, legt aber die drei Konten nicht an.
Die beiden `PUBLIC_*` fehlen → die Seite baut durch, kann aber nicht abgleichen.

---

## Teil 4 — Fertig melden

Schreib mir „Secrets stehen". Dann:

1. Ich stoße den Workflow an.
2. Ich lese mit, was er meldet.
3. Erfolg heißt nicht „grün", sondern: **acht Tabellen, jede mit `rls = t` und
   mindestens einer Policy**, dazu Paule, Deggel und Baldes in `profiles` und
   die Bilderablage vorhanden.
4. Geht etwas schief, lese ich den Fehler und sage dir, woran es lag.

Ab da verwalte ich die Migrationen allein.

---

## Wenn es hakt

**Die Einstellungsseite zeigt nichts oder „Settings" fehlt.**
Dann fehlen dir die Rechte am Repository. Bei `moreHering/Japan` als eigenem
Konto sollte das nicht passieren — schreib mir, was du siehst.

**Der Workflow sagt weiterhin „kommt leer an".**
Mach ein Bildschirmfoto der Seite `.../settings/secrets/actions`. Die **Namen**
sind darauf sichtbar, die **Werte nicht** — das kannst du gefahrlos schicken,
und ich sehe sofort, ob Name oder Block nicht stimmen.

**Der Workflow bricht bei „Verbindung aufbauen" ab.**
Dann stimmt der String nicht. Häufig: Klammern stehengelassen, Passwort mit
Sonderzeichen, oder „Direct connection" statt „Session pooler" erwischt. Die
Fehlermeldung sagt, welches davon — ich lese sie und melde mich.

---

## Der Weg ohne GitHub

Falls dir das zu umständlich ist: `npm run db:dashboard` erzeugt aus den
Migrationen eine Fassung ohne psql-Befehle. Die vier Dateien fügst du im
SQL-Editor des Dashboards nacheinander ein und drückst **Run**. In
`0002_accounts.dashboard.sql` vorher `HIER-DAS-PASSWORT-EINSETZEN` durch euer
Anmeldepasswort ersetzen.

Reihenfolge: `0001`, `0002`, `0003`, `0004`.

Damit steht die Datenbank. **Die beiden `PUBLIC_*`-Secrets brauchst du
trotzdem** — ohne sie kommen die Zugangsdaten nicht in die gebaute Seite, und
die App bleibt offline-only.
