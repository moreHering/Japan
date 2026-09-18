-- ============================================================================
-- Prüfungen gegen das Schema. Jede schlägt mit einer Meldung fehl, statt still
-- durchzulaufen — ein Test, der nichts prüft, ist schlimmer als keiner.
--
--   psql ... -f local-auth-stub.sql -f ../migrations/0001_init.sql -f schema-test.sql
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- Drei Testkonten anlegen: zwei zugelassene, eines ohne Profil.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'eins@test'),
  ('22222222-2222-2222-2222-222222222222', 'zwei@test'),
  ('99999999-9999-9999-9999-999999999999', 'fremd@test')
on conflict (id) do nothing;

insert into public.profiles (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Eins'),
  ('22222222-2222-2222-2222-222222222222', 'Zwei')
on conflict (id) do nothing;

grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$
declare
  n integer;
  nr1 integer;
  nr2 integer;
  fehler text[] := '{}';
begin
  -- ---------------------------------------------------------------- RLS an?
  select count(*) into n
  from pg_tables t
  where t.schemaname = 'public'
    and not exists (
      select 1 from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      where c.relname = t.tablename and ns.nspname = 'public' and c.relrowsecurity
    );
  if n > 0 then
    fehler := fehler || format('%s Tabelle(n) ohne RLS', n);
  end if;

  -- ------------------------------------------------ Nummernvergabe ab 165
  insert into public.places_custom (name, kategorie, station, lat, lng)
  values ('Testort A', 'kultur', 'osaka', 34.7, 135.5) returning nr into nr1;
  insert into public.places_custom (name, kategorie, station, lat, lng)
  values ('Testort B', 'essen', 'kyoto', 35.0, 135.7) returning nr into nr2;

  if nr1 <> 165 then
    fehler := fehler || format('erste eigene Nummer ist %s, erwartet 165', nr1);
  end if;
  if nr2 <> nr1 + 1 then
    fehler := fehler || format('zweite Nummer ist %s, erwartet %s', nr2, nr1 + 1);
  end if;

  -- --------------------------------------------- Ungültige Werte abweisen
  begin
    insert into public.places_custom (name, kategorie, station, lat, lng)
    values ('Falsche Kategorie', 'quatsch', 'osaka', 34.7, 135.5);
    fehler := fehler || 'unbekannte Kategorie wurde angenommen';
  exception when check_violation then null;
  end;

  begin
    insert into public.places_custom (name, kategorie, station, lat, lng)
    values ('Falsche Koordinate', 'kultur', 'osaka', 999, 135.5);
    fehler := fehler || 'unmögliche Koordinate wurde angenommen';
  exception when check_violation then null;
  end;

  begin
    insert into public.expenses (datum, text, yen, payer) values (current_date, 'Minus', -5, 'Eins');
    fehler := fehler || 'negativer Betrag wurde angenommen';
  exception when check_violation then null;
  end;

  if array_length(fehler, 1) > 0 then
    raise exception E'\n  FEHLGESCHLAGEN:\n    - %', array_to_string(fehler, E'\n    - ');
  end if;
  raise notice 'Struktur, Nummernvergabe und Wertprüfungen: bestanden';
end $$;

-- ===================================================== Zugriffsregeln ======
-- Ab hier unter der Rolle, die Supabase für angemeldete Zugriffe verwendet.

set role authenticated;

-- --- Zugelassener Reisender sieht und schreibt --------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare n integer;
begin
  insert into public.plan_days (datum, place_nr, position, updated_by)
  values ('2026-09-26', 1, 0, auth.uid())
  on conflict (datum, place_nr) do nothing;

  select count(*) into n from public.plan_days;
  if n < 1 then
    raise exception 'Zugelassener Nutzer sieht seine eigenen Daten nicht';
  end if;
  raise notice 'Zugelassener Nutzer: Lesen und Schreiben bestanden (% Zeile(n))', n;
end $$;

-- --- Zweiter Reisender sieht dieselben Daten ----------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare n integer;
begin
  select count(*) into n from public.plan_days;
  if n < 1 then
    raise exception 'Gemeinsame Planung scheitert: zweiter Nutzer sieht nichts';
  end if;
  raise notice 'Gemeinsame Sicht auf den Plan: bestanden';
end $$;

-- --- Fremder ohne Profil sieht nichts und darf nichts -------------------
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';

do $$
declare n integer; fehler text[] := '{}';
begin
  select count(*) into n from public.plan_days;
  if n <> 0 then
    fehler := fehler || format('Fremder sieht %s Zeile(n) im Tagesplan', n);
  end if;

  select count(*) into n from public.expenses;
  if n <> 0 then
    fehler := fehler || format('Fremder sieht %s Ausgabe(n)', n);
  end if;

  select count(*) into n from public.places_custom;
  if n <> 0 then
    fehler := fehler || format('Fremder sieht %s eigene Orte', n);
  end if;

  begin
    insert into public.plan_days (datum, place_nr) values ('2026-10-01', 42);
    fehler := fehler || 'Fremder konnte in den Tagesplan schreiben';
  exception when insufficient_privilege then null;
  end;

  if array_length(fehler, 1) > 0 then
    raise exception E'\n  RLS DURCHLÄSSIG:\n    - %', array_to_string(fehler, E'\n    - ');
  end if;
  raise notice 'Fremder ohne Profil: kein Lesen, kein Schreiben — bestanden';
end $$;

-- --- Steckbrief: nur die eigene Seite beschreibbar ----------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare fehler text[] := '{}';
begin
  insert into public.guestbook_profile (user_id, feld, wert)
  values (auth.uid(), 'lieblingsessen', 'Takoyaki')
  on conflict (user_id, feld) do update set wert = excluded.wert;

  begin
    insert into public.guestbook_profile (user_id, feld, wert)
    values ('22222222-2222-2222-2222-222222222222', 'lieblingsessen', 'fremd geschrieben');
    fehler := fehler || 'fremder Steckbrief war beschreibbar';
  exception when insufficient_privilege then null;
  end;

  if array_length(fehler, 1) > 0 then
    raise exception E'\n  FEHLGESCHLAGEN:\n    - %', array_to_string(fehler, E'\n    - ');
  end if;
  raise notice 'Steckbrief: nur die eigene Seite beschreibbar — bestanden';
end $$;

-- ------------------------------------------------ Beiträge im Freundebuch ---
--
-- Nicht geprüft werden kann hier die Bilderablage: Das `storage`-Schema
-- gehört Supabase und existiert lokal nicht. Was geprüft wird, ist die
-- Zeilenebene — wer lesen, schreiben und löschen darf.

do $$
declare
  eigene uuid;
  n integer;
  fehler text[] := '{}';
begin
  insert into public.guestbook_post (text, datum, sticker, created_by)
  values ('Erster Tag', '2026-09-26', 'sushi', auth.uid())
  returning id into eigene;

  -- Ein Beitrag auf fremden Namen darf nicht durchgehen, sonst wäre die
  -- Zuordnung der Beiträge zu Personen wertlos.
  begin
    insert into public.guestbook_post (text, datum, created_by)
    values ('untergeschoben', '2026-09-26', '22222222-2222-2222-2222-222222222222');
    fehler := fehler || 'Beitrag auf fremden Namen war möglich';
  exception when insufficient_privilege then null;
  end;

  -- Den eigenen ändern: ja.
  update public.guestbook_post set text = 'Erster Tag, nachgebessert' where id = eigene;
  get diagnostics n = row_count;
  if n <> 1 then fehler := fehler || 'eigener Beitrag war nicht änderbar'; end if;

  if array_length(fehler, 1) > 0 then
    raise exception E'\n  FEHLGESCHLAGEN:\n    - %', array_to_string(fehler, E'\n    - ');
  end if;
  raise notice 'Beiträge: eigene änderbar, fremde nicht unterschiebbar — bestanden';
end $$;

-- Der zweite Reisende sieht den Beitrag, darf ihn aber nicht löschen.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare
  n integer;
  fehler text[] := '{}';
begin
  select count(*) into n from public.guestbook_post;
  if n < 1 then fehler := fehler || 'fremder Beitrag war nicht lesbar'; end if;

  delete from public.guestbook_post;
  get diagnostics n = row_count;
  if n <> 0 then fehler := fehler || 'fremder Beitrag war löschbar'; end if;

  if array_length(fehler, 1) > 0 then
    raise exception E'\n  FEHLGESCHLAGEN:\n    - %', array_to_string(fehler, E'\n    - ');
  end if;
  raise notice 'Beiträge: sichtbar für alle, löschbar nur für den Urheber — bestanden';
end $$;

-- ------------------------------------------ Korrekturen und Schlagworte ---
--
-- Der Kern der Korrekturtabelle ist die NULL-Bedeutung: NULL heißt „nicht
-- korrigiert". Nur dadurch lässt sich eine Korrektur **zurücknehmen** und der
-- Buchwert kommt wieder zum Vorschein. Ginge das verloren, wäre der Buchwert
-- nach der ersten Änderung für immer weg — und niemand würde es merken, weil
-- die App einfach den letzten Stand zeigt.

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  n      integer;
  wert   text;
  fehler text[] := '{}';
begin
  -- Eine Korrektur an Nr. 47 (To-ji), die falsch unter „Arashiyama" stand.
  insert into public.places_patch (nr, lat, lng, schlagworte, updated_by)
  values (47, 34.9805, 135.7477, array['stimmt geprüft'], auth.uid());

  -- Nur die gesetzten Spalten dürfen belegt sein. Der Name wurde nicht
  -- angefasst, also muss er NULL bleiben.
  select name into wert from public.places_patch where nr = 47;
  if wert is not null then
    fehler := fehler || 'nicht korrigierte Spalte war nicht NULL';
  end if;

  -- Zurücknehmen: Spalte auf NULL, Buchwert gilt wieder.
  update public.places_patch set lat = null, lng = null where nr = 47;
  select count(*) into n from public.places_patch
   where nr = 47 and lat is null and lng is null;
  if n <> 1 then fehler := fehler || 'Korrektur ließ sich nicht zurücknehmen'; end if;

  -- Ausblenden statt Löschen. Die Nummer bleibt belegt.
  insert into public.places_patch (nr, versteckt, updated_by)
  values (34, true, auth.uid());
  select count(*) into n from public.places_patch where nr = 34 and versteckt;
  if n <> 1 then fehler := fehler || 'Ausblenden ging nicht'; end if;

  -- Schlagworte: leeres Array als Vorgabe, nicht NULL — sonst müsste beim
  -- Lesen überall unterschieden werden.
  select count(*) into n from public.places_patch where nr = 34 and schlagworte = '{}';
  if n <> 1 then fehler := fehler || 'Schlagworte kamen nicht als leeres Array'; end if;

  -- Über den GIN-Index suchbar.
  update public.places_patch set schlagworte = array['regentag', 'frühstück'] where nr = 34;
  select count(*) into n from public.places_patch where schlagworte @> array['regentag'];
  if n <> 1 then fehler := fehler || 'Suche nach einem Schlagwort fand nichts'; end if;

  -- Eine Nummer darf nur eine Korrektur haben, sonst gäbe es zwei Wahrheiten.
  begin
    insert into public.places_patch (nr) values (47);
    fehler := fehler || 'zwei Korrekturen zur selben Nummer waren möglich';
  exception when unique_violation then null;
  end;

  -- Eine unsinnige Kategorie muss auffallen, bevor sie in der Karte landet.
  begin
    insert into public.places_patch (nr, kategorie) values (99, 'quatsch');
    fehler := fehler || 'unsinnige Kategorie ging durch';
  exception when check_violation then null;
  end;

  if array_length(fehler, 1) > 0 then
    raise exception E'\n  FEHLGESCHLAGEN:\n    - %', array_to_string(fehler, E'\n    - ');
  end if;
  raise notice 'Korrekturen: NULL heißt unkorrigiert, Ausblenden und Schlagworte gehen — bestanden';
end $$;

-- Der zweite Reisende muss die Korrektur sehen und selbst korrigieren dürfen:
-- Wer unterwegs merkt, dass ein Ort nicht stimmt, soll das richten können, egal
-- wer den Eintrag angelegt hat.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare
  n      integer;
  fehler text[] := '{}';
begin
  select count(*) into n from public.places_patch where nr = 47;
  if n <> 1 then fehler := fehler || 'fremde Korrektur war nicht sichtbar'; end if;

  update public.places_patch set name = 'To-ji' where nr = 47;
  get diagnostics n = row_count;
  if n <> 1 then fehler := fehler || 'fremde Korrektur war nicht änderbar'; end if;

  if array_length(fehler, 1) > 0 then
    raise exception E'\n  FEHLGESCHLAGEN:\n    - %', array_to_string(fehler, E'\n    - ');
  end if;
  raise notice 'Korrekturen: alle drei sehen und ändern sie — bestanden';
end $$;

-- Ohne Profil: nichts.
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';

do $$
declare
  n      integer;
  fehler text[] := '{}';
begin
  select count(*) into n from public.places_patch;
  if n <> 0 then fehler := fehler || 'Fremder konnte Korrekturen lesen'; end if;

  begin
    insert into public.places_patch (nr, name) values (1, 'übernommen');
    fehler := fehler || 'Fremder konnte eine Korrektur schreiben';
  exception when insufficient_privilege then null;
  end;

  if array_length(fehler, 1) > 0 then
    raise exception E'\n  FEHLGESCHLAGEN:\n    - %', array_to_string(fehler, E'\n    - ');
  end if;
  raise notice 'Korrekturen: ohne Profil kein Zugriff — bestanden';
end $$;

-- --------------------------------------------------- Anmeldung möglich? ---
--
-- Der Grund, warum es diese Prüfung gibt: Nach dem ersten Migrationslauf
-- standen die Konten vollständig da — und die Anmeldung scheiterte trotzdem
-- mit „Database error querying schema", weil vier Tokenspalten NULL waren.
-- Von außen war das nicht zu sehen. Hier ist es zu sehen.

reset role;

do $$
declare
  spalten constant text[] := array[
    'confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new'
  ];
  spalte  text;
  n       integer;
  fehler  text[] := '{}';
begin
  foreach spalte in array spalten loop
    -- Nur die Konten, die 0002 anlegt. Die drei Testkonten oben entstehen
    -- absichtlich roh und ohne diese Spalten — sie bilden nach, wie ein per
    -- SQL angelegtes Konto aussieht, bevor 0005 es repariert.
    execute format(
      'select count(*) from auth.users where %I is null and email like ''%%@japan2026.local''',
      spalte
    ) into n;
    if n > 0 then
      fehler := fehler || format('%s ist bei %s Konto/Konten NULL', spalte, n);
    end if;
  end loop;

  if array_length(fehler, 1) > 0 then
    raise exception E'\n  FEHLGESCHLAGEN:\n    - %', array_to_string(fehler, E'\n    - ');
  end if;
  raise notice 'Anmeldung: keine NULL in den Tokenspalten — bestanden';
end $$;

\echo ''
\echo '  Alle Prüfungen bestanden.'
