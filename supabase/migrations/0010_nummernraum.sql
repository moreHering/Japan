-- 0010 · Nummernraum für das Reiseband auf 1–1000 erweitern
--
-- ## Warum
--
-- Das Reiseband zählt seit dem neuen Reiseplan (Mietwagen Kyoto → Tokio) nicht
-- mehr bis 164, sondern bis 181: Die Orte der Straße tragen 165–181, gedruckt im
-- Band **und** in der My-Maps-Karte der Reisenden. Die Sequenz für selbst
-- angelegte Orte begann aber bei 165 (0001_init.sql). Ein eigener Ort mit
-- Nr. 165 und Hikone-jō mit Nr. 165 wären zwei Orte unter einer Nummer — der
-- Planer nähme den einen, die Karte den anderen, und Svelte bricht bei doppelten
-- Schlüsseln ganze Listen ab. Ein Marker am falschen Ort ist auf der Reise der
-- schlimmste Fehler, den diese App machen kann.
--
-- Deshalb bekommt das Band 1–1000, und eigene Orte zählen ab 1001.
--
-- ## Was diese Migration tut — und was nicht
--
-- Sie **prüft** zuerst, ob schon eigene Orte im neuen Bandraum liegen. Wenn ja,
-- bricht sie mit der Liste ab und ändert nichts. Umnummerieren wäre in der
-- Datenbank eine Transaktion, aber auf den Telefonen liegen dieselben Nummern im
-- lokalen Plan, und der Abgleich würde die alten wieder hochladen. Das ist eine
-- eigene Aufgabe mit eigenem Test, keine Nebenwirkung einer Migration.
--
-- Wenn der Raum frei ist, setzt sie die Sequenz auf 1001. Idempotent: `setval`
-- nimmt das Maximum aus 1000 und der höchsten vergebenen Nummer, ein zweiter Lauf
-- ändert also nichts.

do $$
declare
  belegt text;
begin
  select string_agg(format('Nr. %s „%s"', nr, name), ', ' order by nr)
    into belegt
    from public.places_custom
   where nr between 165 and 1000;

  if belegt is not null then
    raise exception using
      message = 'Eigene Orte liegen im Nummernraum des Reisebands (165–1000): ' || belegt,
      hint    = 'Vor dem Import der Straßen-Orte umnummerieren — siehe Kopf von 0010_nummernraum.sql.';
  end if;
end
$$;

select setval(
  'public.place_nr_seq',
  greatest(1000, (select coalesce(max(nr), 0) from public.places_custom))
);

comment on column public.places_custom.nr is
  'Ab 1001. Die Nummern 1–1000 gehören dem Reiseband (1–181 vergeben) und bleiben frei.';
