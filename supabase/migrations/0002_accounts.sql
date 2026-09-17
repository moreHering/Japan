-- ============================================================================
-- Die drei Konten.
--
-- Supabase legt Benutzer normalerweise über seine Admin-API an. Hier geschieht
-- es per SQL, damit im Dashboard nichts von Hand einzutragen ist. Das Schema
-- von `auth.users` gehört Supabase und kann sich ändern — falls eine spätere
-- Version zusätzliche Pflichtfelder verlangt, schlägt diese Migration fehl
-- statt halbe Konten anzulegen, und die Benutzer werden dann im Dashboard
-- angelegt und unten nur noch mit `profiles` verknüpft.
--
-- Die Passwörter kommen als psql-Variablen aus GitHub-Secrets und stehen
-- nirgends im Repository. Ohne sie überspringt die Migration die Kontenanlage.
--
--   psql -v pw_eins="…" -v pw_zwei="…" -v pw_drei="…" -f 0002_accounts.sql
-- ============================================================================

-- Fehlende Variablen auf Leerstring setzen, damit die Datei auch ohne sie läuft.
\if :{?pw_eins} \else \set pw_eins '' \endif
\if :{?pw_zwei} \else \set pw_zwei '' \endif
\if :{?pw_drei} \else \set pw_drei '' \endif

\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

-- psql ersetzt :variablen nicht innerhalb von $$-Blöcken. Deshalb wandern die
-- Passwörter hier in Sitzungsvariablen, die der Block dann ausliest.
select set_config('japan.pw_eins', :'pw_eins', false);
select set_config('japan.pw_zwei', :'pw_zwei', false);
select set_config('japan.pw_drei', :'pw_drei', false);

do $$
declare
  konten constant jsonb := jsonb_build_array(
    jsonb_build_object('email', 'eins@japan2026.local', 'name', 'Reisende:r 1',
                       'farbe', '#C6402B', 'pw', current_setting('japan.pw_eins', true)),
    jsonb_build_object('email', 'zwei@japan2026.local', 'name', 'Reisende:r 2',
                       'farbe', '#3E6B5E', 'pw', current_setting('japan.pw_zwei', true)),
    jsonb_build_object('email', 'drei@japan2026.local', 'name', 'Reisende:r 3',
                       'farbe', '#A67C33', 'pw', current_setting('japan.pw_drei', true))
  );
  k        jsonb;
  uid      uuid;
  angelegt integer := 0;
  ohne_pw  integer := 0;
begin
  -- Ohne auth-Schema läuft die Datei lokal gegen einen nackten Postgres; dann
  -- gibt es nichts anzulegen.
  if to_regclass('auth.users') is null then
    raise notice 'Kein auth-Schema vorhanden — Kontenanlage übersprungen.';
    return;
  end if;

  for k in select * from jsonb_array_elements(konten) loop
    if coalesce(k->>'pw', '') = '' then
      ohne_pw := ohne_pw + 1;
      continue;
    end if;

    select id into uid from auth.users where email = k->>'email';

    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        k->>'email', crypt(k->>'pw', gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', k->>'name')
      );

      -- Ohne passende Identity meldet sich Supabase nicht mit E-Mail an.
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider, created_at, updated_at
      ) values (
        gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', k->>'email', 'email_verified', true),
        'email', now(), now()
      )
      on conflict do nothing;

      angelegt := angelegt + 1;
    else
      -- Vorhandenes Konto: Passwort auf den hinterlegten Wert setzen, damit ein
      -- erneuter Lauf nach einer Passwortänderung wieder einen bekannten Stand
      -- herstellt.
      update auth.users
         set encrypted_password = crypt(k->>'pw', gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             updated_at = now()
       where id = uid;
    end if;

    insert into public.profiles (id, name, farbe)
    values (uid, k->>'name', k->>'farbe')
    on conflict (id) do update
      set name = excluded.name, farbe = excluded.farbe;
  end loop;

  raise notice 'Konten: % neu angelegt, % ohne hinterlegtes Passwort übersprungen.',
    angelegt, ohne_pw;

  if ohne_pw > 0 then
    raise notice 'Fehlende Passwörter als Secrets hinterlegen und Migration erneut ausführen.';
  end if;
end $$;
