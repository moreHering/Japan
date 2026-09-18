-- ============================================================================
-- Japan 2026 — Korrekturen an den 164 festen Orten, und Schlagworte für alle
--
-- ## Warum eine eigene Tabelle und nicht places_custom
--
-- Die 164 Orte des Reisebands stehen in `src/data/places.json` und werden beim
-- Bauen eingebacken. Sie sind damit unveränderlich — und genau das war das
-- Problem: Ein falsch zugeordnetes 📖, eine Koordinate, die zwei Straßen weiter
-- liegt, ein Ort, den es nicht mehr gibt. Auf der Reise ist ein markierter Ort,
-- der nicht existiert, schlimmer als ein fehlender.
--
-- `places_custom` taugt dafür nicht: Dort steht `not null` auf Name, Kategorie
-- und Koordinate, weil ein eigener Ort ohne die nichts wert ist. Eine Korrektur
-- ist aber das Gegenteil — sie betrifft **ein** Feld und soll die übrigen in
-- Ruhe lassen.
--
-- Deshalb `places_patch` mit durchweg nullbaren Spalten:
--
--     NULL          → nicht korrigiert, es gilt der Wert aus dem Reiseband
--     ein Wert      → dieser gilt statt des Buchwerts
--
-- Das erlaubt als Einziges, eine Korrektur **zurückzunehmen**: Spalte auf NULL,
-- und der Buchwert steht wieder da. Mit einer Volltabelle wäre der Buchwert
-- nach der ersten Änderung verloren.
--
-- ## Löschen heißt ausblenden
--
-- Nummern werden nie neu vergeben. Sie stehen im gedruckten Reiseband; würde
-- Nr. 47 gelöscht und später an etwas anderes vergeben, zeigte das Buch auf den
-- falschen Ort. `versteckt = true` nimmt einen Ort aus Liste, Karte und
-- Tagesplanung, seine Nummer bleibt aber belegt. Umkehrbar mit einem Griff.
--
-- ## Schlagworte
--
-- Freie Wörter, die niemand vorgibt — „Frühstück", „Regentag", „teuer",
-- „Deggels Wunsch". Als `text[]`, nicht als eigene Tabelle: Die Liste ist kurz,
-- wird immer vollständig gelesen und immer vollständig ersetzt. Eine
-- Zuordnungstabelle wäre hier Aufwand ohne Gegenwert.
--
-- Sie gelten für feste **und** eigene Orte, stehen deshalb in beiden Tabellen.
-- Der Store verbirgt das hinter einer Funktion, damit die Oberfläche nicht
-- wissen muss, wo ein Ort herkommt.
--
-- Idempotent.
-- ============================================================================

create table if not exists public.places_patch (
  -- Auch ≥ 165 erlaubt: Ein eigener Ort kann ausgeblendet werden, ohne ihn zu
  -- verlieren. Kein Fremdschlüssel auf places_custom, weil die 1–164 dort nicht
  -- stehen.
  nr            integer primary key check (nr > 0),

  -- Überschreibungen. NULL heißt jeweils: gilt weiter wie im Reiseband.
  name          text,
  kategorie     text        check (kategorie in ('kultur', 'essen', 'shop', 'natur', 'hotel')),
  station       text,
  area          text        check (area in ('zentrum', 'ausflug')),
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  beschreibung  text,
  from_book     boolean,
  closed_day    text,
  needs_booking boolean,
  cash_only     boolean,
  unterkunft    boolean,

  -- Aus Liste, Karte und Planung genommen. Die Nummer bleibt belegt.
  versteckt     boolean     not null default false,

  -- Freie Schlagworte. Leeres Array heißt „keine", nicht NULL — dann muss beim
  -- Lesen nichts unterschieden werden.
  schlagworte   text[]      not null default '{}',

  updated_at    timestamptz not null default now(),
  updated_by    uuid        references auth.users (id)
);

comment on table public.places_patch is
  'Korrekturen an den Orten des Reisebands. NULL in einer Spalte = nicht korrigiert.';
comment on column public.places_patch.versteckt is
  'Ausgeblendet statt gelöscht — die Nummer steht im gedruckten Band und wird nie neu vergeben.';

-- `closed_day` bewusst ohne die Wochentagsprüfung aus places_custom: Dort wird
-- neu erfasst, hier korrigiert. Ein Ort kann „Mo+Di" oder „1. und 3. Mi"
-- geschlossen haben; die Prüfung würde genau die Korrektur verhindern, um die
-- es geht. Die Oberfläche bietet trotzdem die sieben Tage an.

create index if not exists places_patch_schlagworte_idx
  on public.places_patch using gin (schlagworte);

-- ------------------------------------------------- Schlagworte für eigene Orte ---

alter table public.places_custom
  add column if not exists schlagworte text[] not null default '{}';

create index if not exists places_custom_schlagworte_idx
  on public.places_custom using gin (schlagworte);

-- ------------------------------------------------------------ Zugriffsregeln ---

alter table public.places_patch enable row level security;

do $$
begin
  execute 'drop policy if exists reisende_alles on public.places_patch';
  execute
    'create policy reisende_alles on public.places_patch
       for all to authenticated
       using (public.ist_reisender())
       with check (public.ist_reisender())';
end $$;

-- Wie bei den anderen Tabellen: Korrekturen sind gemeinsame Sache. Wer eine
-- falsche Koordinate findet, korrigiert sie — auch an einem Ort, den jemand
-- anderes angelegt hat. Wer es war, steht in updated_by.

drop trigger if exists places_patch_beruehrt on public.places_patch;
create trigger places_patch_beruehrt
  before update on public.places_patch
  for each row execute function public.touch_updated_at();

do $$
begin
  raise notice 'Korrekturen und Schlagworte bereit.';
end $$;
