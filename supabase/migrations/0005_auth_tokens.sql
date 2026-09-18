-- ============================================================================
-- Japan 2026 — die Anmeldung reparieren
--
-- ## Was passiert ist
--
-- Nach 0002 standen die drei Konten in `auth.users`, mit Passwort, bestätigter
-- Mail, passender Rolle und Identity. Die Anmeldung scheiterte trotzdem mit
--
--     Database error querying schema
--
-- Der Grund steckt in vier Spalten, die der Insert nicht gesetzt hat:
--
--     confirmation_token, recovery_token, email_change, email_change_token_new
--
-- Sie sind bei Supabase nullbar und ohne Vorgabewert. GoTrue — der Dienst
-- hinter der Anmeldung — liest sie in Go-Strings ein, und Go kann NULL nicht
-- in einen String verwandeln. Der Abbruch passiert beim Lesen des Kontos,
-- lange bevor das Passwort geprüft wird; nach außen sieht das aus wie ein
-- Schemafehler. Wer sein Konto über die API oder das Dashboard anlegt, merkt
-- davon nichts: GoTrue selbst schreibt dort Leerstrings.
--
-- ## Was hier steht
--
-- Leerstring statt NULL für alle Tokenspalten, die GoTrue als String liest.
-- Ein leeres Token heißt „kein Vorgang offen" — genau das, was gemeint ist.
--
-- **Nicht** angefasst werden `phone` und `email`: Auf beiden liegt ein
-- eindeutiger Index. Drei Konten mit `phone = ''` wären ein Konflikt, während
-- drei mit `phone is null` erlaubt sind. Ein pauschales „alle Textspalten auf
-- Leerstring" hätte hier also Schaden angerichtet.
--
-- Idempotent: Ein zweiter Lauf findet nichts mehr zu ändern.
-- ============================================================================

do $$
declare
  -- Nur diese Spalten liest GoTrue als String. Die Liste ist bewusst
  -- ausgeschrieben und nicht aus dem Katalog erraten.
  spalten constant text[] := array[
    'confirmation_token',
    'recovery_token',
    'email_change',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change',
    'phone_change_token',
    'reauthentication_token'
  ];
  spalte    text;
  geaendert integer;
  gesamt    integer := 0;
begin
  if to_regclass('auth.users') is null then
    raise notice 'Kein auth-Schema vorhanden — übersprungen.';
    return;
  end if;

  foreach spalte in array spalten loop
    -- Ältere und neuere GoTrue-Fassungen haben nicht alle diese Spalten.
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'users'
         and column_name = spalte
    ) then
      continue;
    end if;

    execute format(
      'update auth.users set %I = '''' where %I is null and email like ''%%@japan2026.local''',
      spalte, spalte
    );
    get diagnostics geaendert = row_count;
    gesamt := gesamt + geaendert;

    if geaendert > 0 then
      raise notice '  %: % Zeile(n) von NULL auf Leerstring', spalte, geaendert;
    end if;
  end loop;

  if gesamt = 0 then
    raise notice 'Anmeldespalten: nichts zu tun, alles gesetzt.';
  else
    raise notice 'Anmeldespalten: % Werte gesetzt.', gesamt;
  end if;
end $$;
