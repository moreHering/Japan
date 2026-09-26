-- 0012 · Kurzlink-Auflöser: Zustimmungs-Cookie und mehr Fundstellen
--
-- ## Warum
--
-- Der erste echte Link (26.09.2026, eine Unterkunft in Osaka-Nipponbashi) wurde
-- aufgelöst, aber nur bis zur Adresse: Die Weiterleitung führt auf
-- `/maps/place/<Adresse>/data=…!1s0x…:0x…` — ohne `!3d/!4d`, ohne `@`. Und der
-- Abruf dieser Seite brachte keine Koordinate. Vermutung: Der Datenbankserver
-- steht in eu-central-1, und Google antwortet Servern in der EU mit der
-- Zustimmungsseite statt der Karte.
--
-- ## Was sich ändert
--
-- - Der GET schickt ein Zustimmungs-Cookie mit.
-- - Gesucht wird zusätzlich nach `APP_INITIALIZATION_STATE` (Länge vor Breite!).
-- - Die Antwort nennt unter `seite` Status, Länge und Titel der abgerufenen
--   Seite — damit der Probeschritt in migrate.yml zeigt, was Google wirklich
--   geschickt hat, statt dass wir raten.
--
-- Alles andere (erlaubte Adressen, Rechte) bleibt wie in 0011; das Recht bleibt
-- bei `create or replace` erhalten und wird unten trotzdem neu gesetzt.

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
  antwort2 record;
  diagnose jsonb;
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
      -- Mit Zustimmungs-Cookie: Ohne ihn schickt Google einem Server in der
      -- EU die Seite consent.google.com statt der Karte.
      select status, content into antwort2
        from http((
          'GET', jetzt,
          http_headers(
            'Cookie', 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb',
            'Accept-Language', 'de,en;q=0.8'
          ),
          null, null
        )::http_request);
      seite := antwort2.content;
      diagnose := jsonb_build_object(
        'status', antwort2.status,
        'laenge', length(seite),
        'titel', substring(seite from '<title>([^<]{0,120})')
      );
    exception when others then
      seite := null;
      diagnose := jsonb_build_object('fehler', sqlerrm);
    end;
    if seite is not null then
      m := regexp_match(seite, '!3d(-?[0-9]+\.[0-9]+)!4d(-?[0-9]+\.[0-9]+)');
      if m is not null then
        return jsonb_build_object('ziele', to_jsonb(ziele), 'fund', format('!3d%s!4d%s', m[1], m[2]),
                                  'fehler', null, 'seite', diagnose);
      end if;
      -- Vorschaubild der Seite: staticmap?center=lat%2Clng — der Ort selbst.
      m := regexp_match(seite, 'center=(-?[0-9]+\.[0-9]+)(?:%2C|,)(-?[0-9]+\.[0-9]+)');
      if m is null then
        m := regexp_match(seite, '/@(-?[0-9]+\.[0-9]+),(-?[0-9]+\.[0-9]+)');
      end if;
      if m is null then
        -- APP_INITIALIZATION_STATE=[[[zoom, lng, lat] — Länge vor Breite.
        m := regexp_match(seite, 'APP_INITIALIZATION_STATE=\[\[\[-?[0-9.]+,(-?[0-9]+\.[0-9]+),(-?[0-9]+\.[0-9]+)\]');
        if m is not null then
          m := array[m[2], m[1]];
        end if;
      end if;
      if m is not null then
        return jsonb_build_object('ziele', to_jsonb(ziele), 'fund', format('@%s,%s', m[1], m[2]),
                                  'fehler', null, 'seite', diagnose);
      end if;
    end if;
  end if;

  return jsonb_build_object('ziele', to_jsonb(ziele), 'fund', null, 'fehler', null, 'seite', diagnose);
exception when others then
  return jsonb_build_object('ziele', to_jsonb(ziele), 'fund', null, 'fehler', sqlerrm);
end
$$;

revoke all on function public.kurzlink_aufloesen(text) from public, anon;
grant execute on function public.kurzlink_aufloesen(text) to authenticated;

comment on function public.kurzlink_aufloesen(text) is
  'Folgt einem Google-Maps-Kurzlink (nur maps.app.goo.gl / goo.gl/maps) und liefert Ziele und Koordinaten-Fund. Nur für angemeldete Konten.';
