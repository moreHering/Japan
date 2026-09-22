-- ============================================================================
-- Japan 2026 — Freundebuch: mehrere Bilder je Beitrag und eine Layout-Vorlage
--
-- Bis hierher trug ein Beitrag genau ein Bild: `bild_pfad` ist eine einzelne
-- Spalte. Damit gab es keine Collage und keinen Filmstreifen, und ein
-- Hochformatfoto wurde im 4:3-Rahmen oben und unten abgeschnitten.
--
-- Zwei Spalten kommen dazu. Wie 0001 idempotent — ein zweiter Lauf ändert
-- nichts.
--
-- Rechte: **hier ist nichts zu tun.** 0008 erteilt
-- `grant select on public.guestbook_post to anon` tabellenweit, neue Spalten
-- sind damit automatisch gedeckt. (Bei `profiles` sind die Rechte spaltenweise
-- erteilt — dort wäre es anders.) Es entsteht auch keine neue Tabelle, also
-- greift weder die RLS-Pflicht des Migrationslaufs noch der Merksatz aus 0008,
-- dass jede neue Tabelle dort eingetragen werden muss.
-- ============================================================================

-- ----------------------------------------------------- Die Bilder als Reihe ---

-- Warum ein Array und keine Kindtabelle: Es gibt nichts je Bild zu speichern
-- außer dem Pfad, und die Reihenfolge ist im Array schon enthalten. Eine
-- Tabelle hätte einen Fremdschlüssel, eine eigene RLS-Regel, einen Eintrag in
-- den anon-Rechten von 0008 und eine zweite Abfrage beim Laden gekostet — für
-- genau eine Textspalte.
alter table public.guestbook_post
  add column if not exists bild_pfade text[] not null default '{}';

comment on column public.guestbook_post.bild_pfade is
  'Alle Bildpfade des Beitrags, in Anzeigereihenfolge. bild_pfad trägt weiter das erste.';

-- ------------------------------------------------------------- Die Vorlage ---

-- Welches Layout der Beitrag zeigt: polaroid, hochkant, panorama, streifen,
-- collage. Freies `text` ohne Enum, genau wie `sticker` aus 0003: Die Liste
-- führt der Client, und jede neue Vorlage kostet damit keine Migration.
--
-- `null` bleibt erlaubt und heißt „Polaroid" — alle bestehenden Beiträge stehen
-- so da, und `vorlageVon()` in `src/lib/vorlagen.ts` fängt sowohl `null` als
-- auch einen unbekannten Wert ab.
alter table public.guestbook_post
  add column if not exists vorlage text;

comment on column public.guestbook_post.vorlage is
  'Layout des Beitrags, z. B. collage. Die Liste führt der Client; null = polaroid.';

-- ------------------------------------------------- Bestehende Beiträge füllen ---

-- Jeder Beitrag mit Bild bekommt seinen Pfad auch in die Reihe. Bedingt auf
-- `cardinality(...) = 0`, damit ein zweiter Lauf eine inzwischen gewachsene
-- Reihe nicht auf ein Bild zurücksetzt.
update public.guestbook_post
   set bild_pfade = array[bild_pfad]
 where bild_pfad is not null
   and cardinality(bild_pfade) = 0;

-- ============================================================================
-- Zur Redundanz zwischen `bild_pfad` und `bild_pfade[1]`
--
-- Sie ist Absicht und keine Nachlässigkeit. `bild_pfad` bleibt und wird weiter
-- mit dem **ersten** Bild beschrieben, weil ein Telefon mit zwischen-
-- gespeichertem altem JavaScript nur diese Spalte liest: Ohne sie zeigte es
-- plötzlich bildlose Beiträge, und zwar ohne Fehlermeldung.
--
-- Wer räumt sie auf? Niemand, vorläufig. Der Preis ist eine Textspalte je
-- Beitrag; der Preis der Alternative wäre, dass ein nicht neu geladener Tab die
-- Bilder verliert. Neuer Code liest `bild_pfade` und benutzt `bild_pfad` nur als
-- Rückfall (`pfadeVon()` in `src/lib/vorlagen.ts`).
-- ============================================================================
