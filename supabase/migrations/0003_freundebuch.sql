-- ============================================================================
-- Japan 2026 — Freundebuch: Bilderablage und Sticker
--
-- Ergänzt die Tabellen aus 0001 um das, was der Bilderstrom braucht:
-- einen Speicherbereich für die Fotos und ein Feld für den Sticker, den
-- jemand auf seinen Beitrag klebt.
--
-- Wie 0001 idempotent — ein zweiter Lauf ändert nichts.
-- ============================================================================

-- ------------------------------------------------------------- Sticker ---

-- Welcher Aufkleber auf dem Beitrag klebt. Die Auswahl steht im Client
-- (Sushi, Onigiri, Torii, Katze …); die Datenbank nimmt den Schlüssel
-- entgegen, ohne die Liste zu kennen — sonst müsste jeder neue Aufkleber
-- durch eine Migration.
alter table public.guestbook_post
  add column if not exists sticker text;

comment on column public.guestbook_post.sticker is
  'Schlüssel des Aufklebers, z. B. sushi. Die Liste führt der Client.';

-- --------------------------------------------------------- Bilderablage ---

do $$
begin
  -- Lokal (Prüfstand) gibt es kein storage-Schema. Dann ist hier nichts zu tun.
  if to_regclass('storage.buckets') is null then
    raise notice 'Kein storage-Schema — Bilderablage übersprungen.';
    return;
  end if;

  -- Nicht öffentlich: Die Bilder sind über zeitlich begrenzte Links erreichbar,
  -- die der angemeldete Client anfordert. Ein öffentlicher Bereich wäre über
  -- die geratene Adresse für jeden lesbar, und in einem Freundebuch stehen
  -- Gesichter.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'freundebuch',
    'freundebuch',
    false,
    5242880,                                   -- 5 MB; verkleinert wird im Browser
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do update
    set file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types,
        public             = excluded.public;

  raise notice 'Bilderablage freundebuch bereit.';
end $$;

-- Zugriff auf die Dateien: dieselbe Regel wie überall — wer in `profiles`
-- steht, darf. Löschen darf nur, wer die Datei angelegt hat.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'drop policy if exists freundebuch_lesen on storage.objects';
  execute $p$
    create policy freundebuch_lesen on storage.objects
      for select to authenticated
      using (bucket_id = 'freundebuch' and public.ist_reisender())
  $p$;

  execute 'drop policy if exists freundebuch_hochladen on storage.objects';
  execute $p$
    create policy freundebuch_hochladen on storage.objects
      for insert to authenticated
      with check (bucket_id = 'freundebuch' and public.ist_reisender() and owner = auth.uid())
  $p$;

  execute 'drop policy if exists freundebuch_eigene_loeschen on storage.objects';
  execute $p$
    create policy freundebuch_eigene_loeschen on storage.objects
      for delete to authenticated
      using (bucket_id = 'freundebuch' and owner = auth.uid())
  $p$;

  raise notice 'Zugriffsregeln der Bilderablage gesetzt.';
end $$;

-- ------------------------------------------------- Aufräumen beim Löschen ---

-- Hier stand ein Trigger, der beim Löschen eines Beitrags die Bildzeile aus
-- `storage.objects` entfernen sollte. Das geht nicht, und zwar aus gutem Grund:
-- Supabase hat dort einen eigenen Schutz (`storage.protect_delete`), der
-- direktes Löschen verbietet, weil eine gelöschte Metadatenzeile die Datei im
-- Objektspeicher nur verwaisen ließe statt sie zu entfernen. Der Trigger brach
-- also ab und riss das Löschen des Beitrags mit.
--
-- Das Aufräumen läuft jetzt in der App über die Storage-API: erst die Datei
-- entfernen, dann die Zeile. 0006 räumt den Trigger dort weg, wo er schon
-- angelegt wurde.
