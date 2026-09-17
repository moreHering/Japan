-- ============================================================================
-- Japan 2026 — Grundschema
--
-- Ablage für Reiseplan, eigene Orte und das Freundebuch. Die Migration ist
-- idempotent: ein zweiter Lauf ändert nichts und bricht nicht ab.
--
-- Sicherheitsgrundsatz: Der Schlüssel, mit dem die Seite zugreift, steht im
-- JavaScript und ist für jeden lesbar. Geschützt wird ausschließlich über Row
-- Level Security. Deshalb ist RLS auf JEDER Tabelle aktiv, und jede Policy
-- verlangt einen Eintrag in `profiles` — wer dort nicht steht, sieht nichts,
-- auch nicht mit gültigem Login.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Profile ---

-- Die drei Reisenden. Wer hier keine Zeile hat, kommt an keine Daten.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text        not null,
  farbe       text        not null default '#C6402B',
  angelegt_am timestamptz not null default now()
);

comment on table public.profiles is
  'Zugelassene Bearbeiter. Jede Policy prüft gegen diese Tabelle.';

-- Prüffunktion, auf die sich alle Policies stützen. `security definer`, damit
-- die Policies selbst nicht wieder eine Policy auf profiles auslösen.
create or replace function public.ist_reisender()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

-- --------------------------------------------------------------- Tagesplan ---

-- Eine Zeile je Ort und Tag. Bewusst zeilenweise statt als ein JSON-Dokument:
-- So überschreibt nicht der zuletzt Speichernde den ganzen Plan der anderen,
-- sondern Konflikte bleiben auf den einzelnen Eintrag begrenzt.
create table if not exists public.plan_days (
  datum      date        not null,
  place_nr   integer     not null,
  position   integer     not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users (id),
  primary key (datum, place_nr)
);

create index if not exists plan_days_datum_idx on public.plan_days (datum);

-- Notiz je Tag, getrennt von den Orten — sonst müsste beim Tippen im
-- Notizfeld die ganze Ortsliste des Tages mitgeschrieben werden.
create table if not exists public.plan_notes (
  datum      date primary key,
  notiz      text        not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users (id)
);

-- Häkchen aller Art: besuchte Orte, erledigte Buchungen, gepackte Dinge.
-- Eine Tabelle statt dreier, weil sich Struktur und Zugriff nicht unterscheiden.
create table if not exists public.plan_flags (
  art        text        not null check (art in ('done', 'booking', 'packing')),
  schluessel text        not null,
  wert       boolean     not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users (id),
  primary key (art, schluessel)
);

-- ------------------------------------------------------------------ Budget ---

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  datum      date        not null,
  text       text        not null,
  yen        integer     not null check (yen > 0),
  payer      text        not null,
  station    text        not null default '',
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id)
);

create index if not exists expenses_datum_idx on public.expenses (datum desc);

-- ------------------------------------------------------------ Eigene Orte ---

-- Die 164 Orte des Reisebands liegen unverändert in places.json — ihre Nummern
-- stehen gedruckt im Buch. Selbst angelegte Orte zählen deshalb ab 165 weiter.
create sequence if not exists public.place_nr_seq start with 165 minvalue 165;

create table if not exists public.places_custom (
  nr           integer primary key default nextval('public.place_nr_seq'),
  name         text        not null,
  kategorie    text        not null
               check (kategorie in ('kultur', 'essen', 'shop', 'natur', 'hotel')),
  station      text        not null,
  area         text        not null default 'zentrum'
               check (area in ('zentrum', 'ausflug')),
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  beschreibung text        not null default '',
  from_book    boolean     not null default false,
  closed_day   text        check (closed_day in ('Mo','Di','Mi','Do','Fr','Sa','So')),
  needs_booking boolean    not null default false,
  cash_only    boolean     not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id),
  updated_at   timestamptz not null default now()
);

comment on column public.places_custom.nr is
  'Ab 165. Die Nummern 1–164 gehören dem gedruckten Reiseband und bleiben frei.';

-- --------------------------------------------------------------- Steckbrief ---

create table if not exists public.guestbook_profile (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  feld       text        not null,
  wert       text        not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, feld)
);

-- ------------------------------------------------------------- Bilderstrom ---

create table if not exists public.guestbook_post (
  id         uuid primary key default gen_random_uuid(),
  bild_pfad  text,
  text       text        not null default '',
  datum      date        not null default current_date,
  ort_nr     integer,
  created_at timestamptz not null default now(),
  created_by uuid        not null references auth.users (id)
);

create index if not exists guestbook_post_datum_idx
  on public.guestbook_post (datum desc, created_at desc);

-- ================================================================== RLS =====

alter table public.profiles         enable row level security;
alter table public.plan_days        enable row level security;
alter table public.plan_notes       enable row level security;
alter table public.plan_flags       enable row level security;
alter table public.expenses         enable row level security;
alter table public.places_custom    enable row level security;
alter table public.guestbook_profile enable row level security;
alter table public.guestbook_post   enable row level security;

-- Die drei planen gemeinsam: alle dürfen alles lesen und ändern. Wer ändert,
-- wird festgehalten — nicht als Schranke, sondern damit nachvollziehbar ist,
-- wessen Stand gerade gewonnen hat.
do $$
declare
  t text;
begin
  foreach t in array array[
    'plan_days', 'plan_notes', 'plan_flags', 'expenses', 'places_custom'
  ] loop
    execute format('drop policy if exists reisende_alles on public.%I', t);
    execute format(
      'create policy reisende_alles on public.%I
         for all to authenticated
         using (public.ist_reisender())
         with check (public.ist_reisender())', t);
  end loop;
end $$;

-- Profile: alle drei sehen einander, ändern darf jede*r nur sich selbst.
drop policy if exists profile_lesen on public.profiles;
create policy profile_lesen on public.profiles
  for select to authenticated
  using (public.ist_reisender());

drop policy if exists profile_aendern on public.profiles;
create policy profile_aendern on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Steckbrief: lesen alle, schreiben nur die eigene Seite.
drop policy if exists steckbrief_lesen on public.guestbook_profile;
create policy steckbrief_lesen on public.guestbook_profile
  for select to authenticated
  using (public.ist_reisender());

drop policy if exists steckbrief_eigene on public.guestbook_profile;
create policy steckbrief_eigene on public.guestbook_profile
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Beiträge: lesen alle, löschen und ändern nur den eigenen.
drop policy if exists post_lesen on public.guestbook_post;
create policy post_lesen on public.guestbook_post
  for select to authenticated
  using (public.ist_reisender());

drop policy if exists post_anlegen on public.guestbook_post;
create policy post_anlegen on public.guestbook_post
  for insert to authenticated
  with check (public.ist_reisender() and created_by = auth.uid());

drop policy if exists post_eigene on public.guestbook_post;
create policy post_eigene on public.guestbook_post
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists post_loeschen on public.guestbook_post;
create policy post_loeschen on public.guestbook_post
  for delete to authenticated
  using (created_by = auth.uid());

-- ========================================================== Zeitstempel =====

-- updated_at zuverlässig setzen: Der Client könnte es vergessen oder eine
-- falsche Uhr haben, und die Konfliktauflösung beim Abgleich hängt genau
-- an diesem Wert.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'plan_days', 'plan_notes', 'plan_flags', 'places_custom', 'guestbook_profile'
  ] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$I', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$I
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
