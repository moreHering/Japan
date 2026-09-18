-- ============================================================================
-- Japan 2026 — den Trigger auf storage.objects entfernen
--
-- ## Was passiert ist
--
-- Ein Beitrag im Freundebuch ließ sich nicht löschen. 0003 hatte dafür einen
-- Trigger angelegt, der beim Löschen der Zeile auch die Bilddatei abräumen
-- sollte — per `delete from storage.objects`. Supabase verbietet das:
--
--     ERROR:  Direct deletion from storage tables is not allowed.
--             Use the Storage API instead.
--     HINT:   This prevents accidental data loss from orphaned objects.
--     CONTEXT: storage.protect_delete()
--
-- Der Trigger brach also ab und riss das Löschen des Beitrags mit. Von außen
-- sah das aus wie „Löschen geht nicht".
--
-- ## Warum der Trigger auch ohne das Verbot falsch war
--
-- Der Hinweis von Supabase nennt den Grund selbst. `storage.objects` hält nur
-- die Metadaten; die Datei liegt im Objektspeicher dahinter. Eine gelöschte
-- Zeile hätte die Datei nicht entfernt, sondern unsichtbar gemacht — sie hätte
-- weiter gegen das Freikontingent gezählt, und über die Storage-API wäre sie
-- nicht mehr erreichbar gewesen, weil deren Weg über genau diese Zeile geht.
-- Der Trigger hätte das Aufräumen also dauerhaft verhindert.
--
-- ## Wie es jetzt läuft
--
-- Das Aufräumen gehört auf die Clientseite, wo die Storage-API zur Verfügung
-- steht: erst die Datei über die API entfernen, dann die Zeile löschen. Bricht
-- der erste Schritt ab, bleibt der Beitrag stehen und der Versuch ist
-- wiederholbar — nichts verwaist, und der Fehler ist sichtbar statt still.
--
-- Idempotent: Ein zweiter Lauf findet nichts mehr vor.
-- ============================================================================

drop trigger if exists guestbook_post_bild_weg on public.guestbook_post;
drop function if exists public.freundebuch_bild_loeschen();

do $$
begin
  raise notice 'Trigger auf storage.objects entfernt — das Bild räumt jetzt die App über die Storage-API ab.';
end $$;
