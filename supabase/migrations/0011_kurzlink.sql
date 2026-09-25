-- 0011 · Google-Maps-Kurzlinks auflösen
--
-- ## Warum
--
-- Das Teilen-Menü von Google Maps liefert `https://maps.app.goo.gl/…`. Darin
-- steht keine Koordinate, nur eine Weiterleitung. Der Browser darf ihr nicht
-- folgen (CORS), und die App hat keinen eigenen Server — die Datenbank schon.
-- Gemeldet am 25.09.2026: Unterkünfte ließen sich nicht per geteiltem Link
-- eintragen.
--
-- ## Was die Funktion tut
--
-- `kurzlink_aufloesen(link)` folgt den Weiterleitungen einzeln per HEAD (die
-- Erweiterung `http` folgt bei HEAD nicht von selbst) und sammelt die Ziele.
-- Steht in keinem Ziel eine Koordinate, holt sie das letzte Ziel einmal per GET
-- und sucht im Seitentext nach `!3d…!4d…` oder dem Kartenmittelpunkt.
--
-- **Ausgewertet wird im Client**, mit derselben `lese()`-Regel wie ein
-- eingefügter Link. Die Funktion liefert nur Rohstoff:
--
--     { "ziele": [url, …], "fund": "!3d..!4d.." | "@lat,lng" | null, "fehler": text | null }
--
-- ## Kein offener Proxy
--
-- - Nur Links auf `maps.app.goo.gl/…` und `goo.gl/maps/…`.
-- - Weiterleitungen nur zu `google.<tld>` oder `goo.gl`, höchstens drei.
-- - 5 s Zeitlimit je Abruf.
-- - Aufrufen dürfen nur angemeldete Konten, Gäste (`anon`) nicht.
--
-- ## Ohne die Erweiterung
--
-- Im lokalen Test-Postgres gibt es `http` nicht. Die Erweiterung wird nur
-- angelegt, wenn sie verfügbar ist; sonst antwortet die Funktion mit
-- `fehler: 'nicht verfügbar'`, und der Client fällt auf die Namenssuche zurück.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'http') then
    create schema if not exists extensions;
    create extension if not exists http with schema extensions;
  else
    raise notice 'Erweiterung http nicht verfügbar — kurzlink_aufloesen antwortet mit „nicht verfügbar".';
  end if;
end
$$;

create or replace function public.kurzlink_aufloesen(link text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  erlaubt constant text := '^https://(maps\.app\.goo\.gl/[A-Za-z0-9_-]+|goo\.gl/maps/[A-Za-z0-9_-]+)(\?[A-Za-z0-9_=&%.-]*)?$';
  weiter  constant text := '^https://([a-z0-9-]+\.)*(google\.[a-z.]+|goo\.gl)(/|$)';
  ziele   text[] := array[]::text[];
  jetzt   text := btrim(link);
  antwort record;
  ort     text;
  seite   text;
  m       text[];
begin
  if auth.uid() is null then
    return jsonb_build_object('ziele', '[]'::jsonb, 'fund', null, 'fehler', 'nicht angemeldet');
  end if;
  if jetzt is null or jetzt !~ erlaubt then
    return jsonb_build_object('ziele', '[]'::jsonb, 'fund', null, 'fehler', 'kein Maps-Kurzlink');
  end if;
  if not exists (select 1 from pg_extension where extname = 'http') then
    return jsonb_build_object('ziele', '[]'::jsonb, 'fund', null, 'fehler', 'nicht verfügbar');
  end if;

  perform http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
  perform http_set_curlopt('CURLOPT_USERAGENT',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

  for i in 1..3 loop
    select status, headers into antwort from http_head(jetzt);
    exit when antwort.status < 300 or antwort.status >= 400;
    select h.value into ort from unnest(antwort.headers) h where lower(h.field) = 'location' limit 1;
    exit when ort is null;
    if ort !~ weiter then
      ziele := ziele || ort;   -- zeigen, aber nicht folgen
      exit;
    end if;
    ziele := ziele || ort;
    jetzt := ort;
    -- Steht die Koordinate schon im Ziel, ist die Arbeit getan.
    exit when ort ~ '!3d-?[0-9.]+!4d-?[0-9.]+' or ort ~ '@-?[0-9]+\.[0-9]+,-?[0-9]+\.[0-9]+';
  end loop;

  if array_to_string(ziele, ' ') !~ '(!3d-?[0-9.]+!4d|@-?[0-9]+\.[0-9]+,)' and jetzt ~ weiter then
    begin
      select content into seite from http_get(jetzt);
    exception when others then
      seite := null;
    end;
    if seite is not null then
      m := regexp_match(seite, '!3d(-?[0-9]+\.[0-9]+)!4d(-?[0-9]+\.[0-9]+)');
      if m is not null then
        return jsonb_build_object('ziele', to_jsonb(ziele), 'fund', format('!3d%s!4d%s', m[1], m[2]), 'fehler', null);
      end if;
      m := regexp_match(seite, 'center=(-?[0-9]+\.[0-9]+)(?:%2C|,)(-?[0-9]+\.[0-9]+)');
      if m is null then
        m := regexp_match(seite, '@(-?[0-9]+\.[0-9]+),(-?[0-9]+\.[0-9]+)');
      end if;
      if m is not null then
        return jsonb_build_object('ziele', to_jsonb(ziele), 'fund', format('@%s,%s', m[1], m[2]), 'fehler', null);
      end if;
    end if;
  end if;

  return jsonb_build_object('ziele', to_jsonb(ziele), 'fund', null, 'fehler', null);
exception when others then
  return jsonb_build_object('ziele', to_jsonb(ziele), 'fund', null, 'fehler', sqlerrm);
end
$$;

revoke all on function public.kurzlink_aufloesen(text) from public, anon;
grant execute on function public.kurzlink_aufloesen(text) to authenticated;

comment on function public.kurzlink_aufloesen(text) is
  'Folgt einem Google-Maps-Kurzlink (nur maps.app.goo.gl / goo.gl/maps) und liefert Ziele und Koordinaten-Fund. Nur für angemeldete Konten.';
