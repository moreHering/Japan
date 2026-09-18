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

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
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
