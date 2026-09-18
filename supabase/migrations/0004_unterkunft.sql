-- ============================================================================
-- Japan 2026 — eigene Orte können eure Unterkunft sein
--
-- Für Kanazawa, Takayama und Hakone steht in den Quellen nur „gebucht" bzw.
-- „Onsen-Ryokan" — welches Haus gemeint ist, weiß die App nicht. Statt zu
-- raten, tragt ihr sie selbst ein und setzt diesen Haken. Die App zeigt den
-- Ort dann als Unterkunft statt als Vorschlag.
--
-- Wie die übrigen Migrationen idempotent.
-- ============================================================================

alter table public.places_custom
  add column if not exists unterkunft boolean not null default false;

comment on column public.places_custom.unterkunft is
  'Hier wird geschlafen — kein Vorschlag, sondern die Buchung.';
