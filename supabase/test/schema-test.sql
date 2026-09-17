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

reset role;

\echo ''
\echo '  Alle Prüfungen bestanden.'
