-- ============================================================================
-- Nachbau der Supabase-Auth-Umgebung für lokale Tests.
--
-- Wird NICHT in der Produktion ausgeführt — dort bringt Supabase `auth.users`
-- und `auth.uid()` selbst mit. Diese Datei existiert, damit die Migration und
-- vor allem die RLS-Policies gegen einen echten Postgres geprüft werden können,
-- statt nur plausibel auszusehen.
--
-- `auth.uid()` liest hier dieselbe Sitzungsvariable, die Supabase in der
-- Produktion aus dem JWT füllt.
-- ============================================================================

create schema if not exists auth;

/*
 * Nachbildung der Spalten, die Supabase in auth.users führt — so weit, wie
 * 0002_accounts.sql sie beschreibt. Ohne sie ließe sich die Kontenanlage nicht
 * prüfen, und sie ginge ungetestet in die Produktion.
 */
create table if not exists auth.users (
  instance_id        uuid,
  id                 uuid primary key default gen_random_uuid(),
  aud                varchar(255),
  role               varchar(255),
  email              varchar(255) unique,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at         timestamptz,
  -- Die Tokenspalten von GoTrue. Bewusst nullbar und ohne Vorgabewert, genau
  -- wie bei Supabase — daran hing der Anmeldefehler: GoTrue liest sie in
  -- Go-Strings ein und stolpert über NULL. Der Prüfstand muss das nachbilden
  -- können, sonst prüft die Migration gegen eine zu freundliche Datenbank.
  confirmation_token         varchar(255),
  recovery_token             varchar(255),
  email_change               varchar(255),
  email_change_token_new     varchar(255),
  email_change_token_current varchar(255),
  phone_change               text,
  phone_change_token         varchar(255),
  reauthentication_token     varchar(255),
  last_sign_in_at    timestamptz,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  is_super_admin     boolean,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  phone              text unique,
  is_anonymous       boolean not null default false
);

create table if not exists auth.identities (
  provider_id     text        not null,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  identity_data   jsonb       not null,
  provider        text        not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  id              uuid        not null default gen_random_uuid(),
  primary key (provider_id, provider)
);

-- Supabase liest die Kennung aus **zwei** Einstellungen: der alten Einzelform
-- `request.jwt.claim.sub` und dem vollständigen JSON `request.jwt.claims`.
-- PostgREST setzt je nach Fassung die eine oder die andere. Der Stub hatte nur
-- die erste — damit lief ein Test durch, der in Wirklichkeit auf die zweite
-- angewiesen war. Dieselbe Falle wie bei den NULL-Tokenspalten: eine
-- freundlichere Nachbildung als das Original. Jetzt das echte coalesce.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

-- Die Rolle, unter der Supabase angemeldete Zugriffe ausführt.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

grant usage on schema public, auth to authenticated, anon;
grant select on auth.users to authenticated;

-- ---------------------------------------------------------------- storage ---
--
-- Warum das hier steht: Dreimal hintereinander war dieser Stub freundlicher als
-- Supabase, und jedes Mal ging eine Reparatur erst in der Produktion auf.
--
--   1. Die Tokenspalten in auth.users fehlten      → Anmeldefehler
--   2. auth.uid() las nur eine der beiden Claimformen → falsch negative Probe
--   3. storage fehlte ganz                          → Löschen ging nicht
--
-- Der dritte Fall: Supabase schützt `storage.objects` mit einem eigenen Trigger
-- gegen direktes DELETE, weil eine gelöschte Metadatenzeile die Datei im
-- Objektspeicher nur verwaisen ließe. Ein Trigger in 0003, der genau das tat,
-- brach deshalb ab und riss das Löschen des Beitrags mit. Lokal fiel das nicht
-- auf: ohne storage-Schema übersprang der Trigger seinen Rumpf klaglos.
--
-- Also wird der Schutz hier nachgebildet — knapp, aber mit derselben Wirkung
-- und derselben Meldung. Eine Migration, die direkt in storage.objects löscht,
-- fällt ab jetzt lokal auf.

create schema if not exists storage;

create table if not exists storage.buckets (
  id               text primary key,
  name             text not null,
  public           boolean not null default false,
  file_size_limit  bigint,
  allowed_mime_types text[],
  created_at       timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  owner_id   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata   jsonb
);

alter table storage.objects enable row level security;

-- Der Schutz aus Supabase, im Wortlaut der echten Meldung.
create or replace function storage.protect_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
    using hint = 'This prevents accidental data loss from orphaned objects.';
end $$;

-- `for each statement`, nicht `for each row` — und das ist der Punkt, an dem
-- die Nachbildung erst scharf wird: Die Probe löscht einen Pfad, zu dem gar
-- keine Zeile existiert. Ein Zeilentrigger feuert dann nie und der Schutz wäre
-- wirkungslos. In der Produktion feuerte er trotzdem, also sitzt er dort auf
-- der Anweisung. Mit `for each row` lief die Gegenprobe hier durch, obwohl sie
-- in Supabase abbrach.
drop trigger if exists protect_delete on storage.objects;
create trigger protect_delete
  before delete on storage.objects
  for each statement execute function storage.protect_delete();

grant usage on schema storage to authenticated, anon;
