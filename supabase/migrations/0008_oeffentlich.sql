-- ============================================================================
-- Japan 2026 — das Tagebuch für die Gäste öffnen
--
-- ## Was hier entschieden wird, und dass es endgültig ist
--
-- Ab dieser Migration sind drei Tabellen für **jeden** lesbar, der die Adresse
-- der Seite kennt: `profiles`, `guestbook_profile`, `guestbook_post`. Dazu wird
-- die Bilderablage öffentlich.
--
-- „Öffentlich" heißt hier wörtlich weltweit, nicht „für wen wir den Link
-- schicken". Der Supabase-Schlüssel steckt im JavaScript der Seite und ist für
-- jeden Besucher lesbar; wer ihn ausliest, fragt die Datenbank direkt. Der
-- einzige Schutz ist, dass die Adresse nicht verlinkt und der Bildpfad nicht
-- ratbar ist (`<uuid>/<uuid>.jpg`).
--
-- Und es ist nicht zurückzunehmen: Ein Bild, dessen Link einmal jemand hatte,
-- ist kopierbar. Ein späteres `public = false` entfernt das Original, nicht die
-- Kopien — auch nicht die in der Vorschau eines Messengers. Dasselbe gilt für
-- Steckbriefe und Beitragstexte.
--
-- Das ist so gewollt und ausdrücklich abgestimmt. Es steht hier, weil es beim
-- nächsten Nachdenken über Sichtbarkeit die erste Zeile sein soll, die man
-- liest.
--
-- ## Was ausdrücklich NICHT geöffnet wird
--
-- `plan_days`, `plan_notes`, `plan_flags`, `expenses`, `places_custom`,
-- `places_patch`. Der Plan, die Ausgaben und die selbst angelegten Orte bleiben
-- dicht — in `places_custom` stehen die Unterkünfte, also wo die drei schlafen.
--
-- **Kommt eine neue Tabelle in `public` dazu, muss sie hier eingetragen
-- werden** (oder eben nicht — dann bleibt sie dicht). Supabase erteilt `anon`
-- für jede neue Tabelle wieder Vorgabe-Privilegien; der `revoke`-Block unten
-- ist eine Momentaufnahme. Die Prüfungen in `schema-test.sql` sind deshalb
-- generisch formuliert und nicht als Aufzählung — sie fallen um, wenn hier
-- etwas vergessen wird.
--
-- Idempotent.
-- ============================================================================

-- --------------------------------------------------------------- Policies ---
--
-- Für Gäste gilt schlicht `using (true)` — nicht `ist_reisender()`. Und
-- ausschließlich `for select`, niemals `for all`: Ein Gast liest, er schreibt
-- nicht. Die 14 bestehenden `to authenticated`-Policies bleiben unangetastet.

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'guestbook_profile', 'guestbook_post'] loop
    execute format('drop policy if exists gaeste_lesen on public.%I', t);
    execute format(
      'create policy gaeste_lesen on public.%I for select to anon using (true)', t
    );
  end loop;
  raise notice 'Gästeansicht: drei Tabellen für anon lesbar.';
end $$;

-- ----------------------------------------------------------------- Grants ---
--
-- Die zweite, unabhängige Schranke — und die, die in Supabase wirklich
-- arbeitet: Dort hat `anon` per Vorgabe schon Rechte auf alles in `public`.
-- Ohne diesen Widerruf wären Plan und Ausgaben allein durch die fehlende
-- Policy geschützt, und eine künftige Policy ohne `to`-Klausel (die gilt für
-- PUBLIC und damit auch für `anon`) hätte sie sofort geöffnet.
--
-- `usage on schema public` wird **nicht** angefasst: Ohne das antwortet
-- PostgREST überhaupt nicht mehr.

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Bei `profiles` nur die drei Spalten, die die Gästeansicht braucht —
-- `angelegt_am` bleibt außen. Spaltenrechte sind mit PostgREST unproblematisch,
-- solange die Abfrage die Spalten namentlich nennt, und das tut sie.
grant select (id, name, farbe) on public.profiles to anon;
grant select on public.guestbook_profile to anon;
grant select on public.guestbook_post   to anon;

-- ------------------------------------------------- Ortsangabe im Beitrag ---
--
-- Warum der Ort im Beitrag steht und nicht nachgeschlagen wird:
--
-- `ort_nr` verweist bei Nummern ab 165 auf `places_custom`, und das bleibt
-- dicht. Ein Gast könnte den Namen also nicht auflösen — und genau diese Orte
-- werden unterwegs am häufigsten getaggt, das Lokal, das man gefunden hat.
--
-- Die Alternative wäre, `places_custom` zu öffnen. Damit stünden aber auch die
-- Unterkünfte öffentlich da, über die niemand geschrieben hat. Also umgekehrt:
-- Der Beitrag merkt sich, was gewählt wurde. Nebeneffekt, der gefällt — der
-- Eintrag behält den Namen, den der Ort **damals** hatte.
--
-- `ort_nr` bleibt für die App erhalten.

alter table public.guestbook_post
  add column if not exists ort_name text,
  add column if not exists ort_lat  double precision,
  add column if not exists ort_lng  double precision;

comment on column public.guestbook_post.ort_name is
  'Name des Orts zum Zeitpunkt des Eintrags. Macht die Gästeansicht unabhängig von places_custom.';

-- ----------------------------------------------------------- Bilderablage ---
--
-- `update`, nicht `upsert`: Führt Supabase in `storage.buckets` irgendwann
-- weitere Pflichtspalten, bricht ein Insert — ein Update ist davon unabhängig.
--
-- Öffentlicher Bucket statt einer anon-Policy auf `storage.objects`, und das
-- ist eine Entscheidung, kein Vergessen:
--
--   · Ein öffentlicher Bucket ist **nicht aufzählbar**. `GET /object/public/…`
--     funktioniert, `list()` läuft weiter über RLS, und dort hat `anon` keine
--     Policy. Wer den Pfad nicht kennt, findet nichts.
--   · Mit SELECT auf `storage.objects` könnte ein Gast `list()` aufrufen und
--     sich zu allem signierte Links holen — derselbe Zugang, nur umständlicher.
--   · Signierte Links gelten eine Stunde. Eine über Nacht offene Seite zeigt
--     morgens tote Bilder.
--   · Und: Ob die Storage-API einer anon-Sitzung überhaupt eine Signatur
--     ausstellt, ist von hier aus nicht prüfbar. `public = true` ist ein
--     Boolean, das der Prüfstand lesen kann.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Kein storage-Schema — Bucket übersprungen.';
    return;
  end if;
  update storage.buckets set public = true where id = 'freundebuch';
  if not found then
    raise notice 'Bucket freundebuch nicht vorhanden — 0003 hat ihn nicht angelegt?';
  else
    raise notice 'Bilderablage freundebuch: öffentlich lesbar.';
  end if;
end $$;
