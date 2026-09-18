-- ============================================================================
-- Läuft das Löschen eines Freundebuch-Beitrags durch?
--
-- Der Verdacht: Der Trigger `guestbook_post_bild_weg` löscht die Zeile aus
-- `storage.objects`. Zwei Dinge können daran schiefgehen, und sie sehen von
-- außen völlig verschieden aus:
--
--   1. Der Trigger bricht ab (fehlendes Recht auf storage.objects). Dann
--      scheitert das Löschen des Beitrags komplett — die App meldet einen
--      Fehler, der Beitrag bleibt stehen.
--   2. Der Trigger läuft, trifft aber wegen RLS keine Zeile. Dann verschwindet
--      der Beitrag, das Bild bleibt liegen und zählt weiter gegen das
--      Freikontingent.
--
-- Diese Probe geht denselben Weg wie die App: als Rolle `authenticated`, mit
-- der Kennung im JWT-Claim. Alles in einer Transaktion, die zurückgerollt
-- wird — die Datenbank ist danach unverändert.
--
--   psql "$ZIEL" -f supabase/test/loeschen-probe.sql
-- ============================================================================

\set ON_ERROR_STOP off
\timing off

\echo '── Rechte auf storage.objects ──'
select current_user                                        as verbunden_als,
       has_table_privilege('storage.objects', 'delete')     as darf_loeschen,
       has_table_privilege('storage.objects', 'select')      as darf_lesen,
       (select rolbypassrls from pg_roles where rolname = current_user) as umgeht_rls;

\echo '── Der Trigger und sein Eigentümer ──'
select p.proname          as funktion,
       r.rolname          as gehoert,
       p.prosecdef        as security_definer,
       r.rolbypassrls     as eigentuemer_umgeht_rls,
       has_table_privilege(r.rolname, 'storage.objects', 'delete') as eigentuemer_darf_loeschen
  from pg_proc p
  join pg_roles r on r.oid = p.proowner
 where p.proname = 'freundebuch_bild_loeschen';

\echo '── Jetzt der echte Weg, in einer zurückgerollten Transaktion ──'
begin;

select id as uid from auth.users where email = 'paule@japan2026.local'
\gset

insert into public.guestbook_post (text, datum, bild_pfad, created_by)
values ('PROBE — wird zurückgerollt', current_date, :'uid' || '/probe.jpg', :'uid')
returning id as pid
\gset

-- Erst die Kennung, dann die Rolle: danach greift RLS, und ohne Claim würde
-- die Zeile schon beim Lesen unsichtbar. Beide Formen setzen — PostgREST setzt
-- je nach Fassung die Einzelform oder das vollständige JSON, und auth.uid()
-- nimmt, was es findet.
select set_config('request.jwt.claim.sub', :'uid', true) as kennung,
       set_config('request.jwt.claims', json_build_object('sub', :'uid')::text, true) is not null as claims_json;
set local role authenticated;

delete from public.guestbook_post where id = :'pid';

reset role;
select count(*) as beitrag_noch_da from public.guestbook_post where id = :'pid';

rollback;

\echo ''
\echo 'Steht oben DELETE 1 und beitrag_noch_da = 0, läuft das Löschen durch.'
\echo 'Steht dort ein Fehler, ist das die Ursache.'
