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

-- Wird ein Beitrag gelöscht, bleibt sonst das Bild in der Ablage liegen und
-- zählt gegen das Freikontingent, ohne dass es noch jemand sieht.
create or replace function public.freundebuch_bild_loeschen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.bild_pfad is not null and to_regclass('storage.objects') is not null then
    delete from storage.objects
     where bucket_id = 'freundebuch' and name = old.bild_pfad;
  end if;
  return old;
end $$;

drop trigger if exists guestbook_post_bild_weg on public.guestbook_post;
create trigger guestbook_post_bild_weg
  after delete on public.guestbook_post
  for each row execute function public.freundebuch_bild_loeschen();
