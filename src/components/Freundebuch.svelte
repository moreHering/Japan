<script lang="ts">
  /**
   * Das Freundebuch — Steckbriefe und Bilderstrom.
   *
   * Die Gestaltung bricht absichtlich mit dem Rest der Seite. Vorbild sind
   * nicht die „Y2K-Designs" von heute, sondern die japanischen
   * Privathomepages um 2001: Kachelhintergrund, Lauftext, Besucherzähler,
   * Kaomoji, aufgeklebte Sticker, zu viele Rahmen. Das war dieselbe Ästhetik —
   * der Animestil und die Essenssticker gehören dazu, sie sind kein Zusatz.
   *
   * Was dabei nicht mitbricht: Tippziele bleiben groß genug, Eingabefelder
   * behalten 16 px, Bewegung hält sich an `prefers-reduced-motion`. Ein Witz
   * über altes Web rechtfertigt keine unbenutzbare Seite.
   */
  import { onMount } from 'svelte';
  /*
   * Die Y2K-Optik liegt in einer eigenen Datei, weil die öffentliche
   * Tagebuch-Ansicht dieselbe braucht. Aus einem Svelte-Stilblock kann man
   * nichts importieren — er ist komponenten-scoped und existiert nach dem
   * Compiler nur mit Hash-Klassen. Deshalb hier als Modul-Import: so landet
   * die Datei einmal im Bündel der Seite, und beide Komponenten greifen auf
   * dieselben Regeln. Vorbild ist `MapView.svelte` mit `leaflet.css`.
   */
  import '../styles/y2k.css';
  import Sticker, { STICKER, type StickerName } from './Sticker.svelte';
  import LoginPanel from './LoginPanel.svelte';
  import { auth, initAuth } from '../lib/auth.svelte';
  import {
    buch,
    FRAGEN,
    ladeFreundebuch,
    steckbriefSetzen,
    beitragAnlegen,
    beitragLoeschen,
    person,
  } from '../lib/freundebuch.svelte';
  import { places, plainText } from '../lib/places';
  import { plan } from '../lib/store.svelte';
  import { formatFull, trip } from '../lib/trip';
  import { groesse } from '../lib/bild';

  const KAOMOJI = ['(≧▽≦)', '(・ω・)ﾉ', '＼(^o^)／', '(๑>◡<๑)', '(￣ー￣)b', 'ヾ(⌐■_■)ノ♪'];

  /** Besuchszähler — ehrlich: zählt die Aufrufe in DIESEM Browser. */
  let besuche = $state(0);

  let neuText = $state('');
  let neuDatum = $state(new Date().toISOString().slice(0, 10));
  let neuOrt = $state<string>('');
  let neuSticker = $state<StickerName>('sushi');
  let neuDatei = $state<File | null>(null);
  let vorschau = $state<string | null>(null);
  let formOffen = $state(false);

  onMount(() => {
    initAuth();
    try {
      const n = Number(localStorage.getItem('japan2026:besuche') ?? '0') + 1;
      localStorage.setItem('japan2026:besuche', String(n));
      besuche = n;
    } catch {
      besuche = 1;
    }
  });

  // Anmeldung abwarten, dann laden.
  $effect(() => {
    if (auth.userId) void ladeFreundebuch();
    else if (auth.status === 'abgemeldet') buch.status = 'abgemeldet';
  });

  /** Alle Orte für die Zuordnung eines Beitrags — feste und eigene. */
  let orte = $derived([...places, ...plan.customPlaces].sort((a, b) => a.nr - b.nr));

  // ------------------------------------------------------------ Ortssuche ---
  let ortSuche = $state('');
  const ORT_TREFFER_MAX = 8;

  let gewaehlterOrt = $derived(neuOrt ? (orte.find((o) => String(o.nr) === neuOrt) ?? null) : null);

  /**
   * Treffer nach Name, Nummer oder Stichwort aus dem Beschreibungstext. Die
   * Liste bleibt kurz: Acht Vorschläge passen auf ein Handy, mehr wäre wieder
   * das Scrollen, das hier gerade abgeschafft wird.
   */
  let alleOrtTreffer = $derived.by(() => {
    const q = ortSuche.trim().toLowerCase();
    if (!q) return [];
    return orte.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        String(o.nr) === q ||
        plainText(o.descriptionHtml).toLowerCase().includes(q),
    );
  });
  let ortTreffer = $derived(alleOrtTreffer.slice(0, ORT_TREFFER_MAX));
  let ortMehr = $derived(Math.max(0, alleOrtTreffer.length - ORT_TREFFER_MAX));

  function ortWaehlen(nr: number) {
    neuOrt = String(nr);
    ortSuche = '';
  }
  function ortLoesen() {
    neuOrt = '';
    ortSuche = '';
  }

  let meinBrief = $derived(auth.userId ? (buch.steckbriefe[auth.userId] ?? {}) : {});

  async function dateiGewaehlt(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    if (!f) return; // Abbruch im Dateidialog darf die Auswahl nicht löschen
    if (vorschau) URL.revokeObjectURL(vorschau);
    neuDatei = f;
    vorschau = URL.createObjectURL(f);
  }

  /**
   * Bild wieder wegnehmen, ohne den halb geschriebenen Text zu verlieren.
   * Die beiden Eingabefelder müssen dabei geleert werden: Sonst löst dieselbe
   * Datei danach kein `change` mehr aus und lässt sich nicht erneut wählen.
   */
  function bildVerwerfen() {
    if (vorschau) URL.revokeObjectURL(vorschau);
    vorschau = null;
    neuDatei = null;
    for (const el of document.querySelectorAll<HTMLInputElement>('.bildwahl input[type=file]')) {
      el.value = '';
    }
  }

  async function absenden(e: Event) {
    e.preventDefault();
    if (!neuDatei && !neuText.trim()) return;

    // Ort samt Koordinate mitschreiben, nicht nur die Nummer: Die öffentliche
    // Tagebuchansicht kann `places_custom` nicht lesen — dort stehen die
    // Unterkünfte —, und selbst angelegte Orte werden unterwegs am häufigsten
    // getaggt. `gewaehlterOrt` ist hier ohnehin schon aufgelöst.
    const ok = await beitragAnlegen({
      datei: neuDatei,
      text: neuText.trim(),
      datum: neuDatum,
      ortNr: neuOrt ? Number(neuOrt) : null,
      ortName: gewaehlterOrt?.name ?? null,
      ortLat: gewaehlterOrt?.lat ?? null,
      ortLng: gewaehlterOrt?.lng ?? null,
      sticker: neuSticker,
    });
    if (!ok) return;

    neuText = '';
    neuOrt = '';
    ortSuche = '';
    neuDatei = null;
    if (vorschau) URL.revokeObjectURL(vorschau);
    vorschau = null;
    formOffen = false;
  }

  function loeschen(id: string) {
    if (confirm('Diesen Beitrag löschen? Das Bild geht mit.')) void beitragLoeschen(id);
  }

  const kaomojiVon = (id: string) =>
    KAOMOJI[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % KAOMOJI.length];

  /** Kleiner Versatz je Beitrag, damit die Bilder wie aufgeklebt wirken. */
  const kippung = (id: string) => (([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 7) - 3) * 0.7;
</script>

<div class="y2k">
  <!-- ------------------------------------------------------------- Kopf -->
  <header class="kopf">
    <div class="glitzer" aria-hidden="true">
      <Sticker name="sakura" size={24} />
      <Sticker name="stern" size={20} />
      <Sticker name="herz" size={18} />
      <Sticker name="maki" size={22} />
    </div>
    <h1>
      <span class="jp">ふれんず ぶっく</span>
      <span class="lat">FREUNDE&nbsp;BUCH</span>
      <span class="jahr">2026</span>
    </h1>

    <div class="laufband" aria-hidden="true">
      <div class="lauf">
        ★ willkommen im freundebuch ★ nur für Paule, Deggel und Baldes ★ bitte
        ins gästebuch eintragen ★ best viewed with your eyes ★ いらっしゃいませ ★
      </div>
    </div>

    <div class="zaehler">
      <span class="zlabel">BESUCHE</span>
      <span class="zziffern">
        {#each String(besuche).padStart(6, '0') as z, i (i)}
          <b>{z}</b>
        {/each}
      </span>
      <span class="zhinweis">zählt nur dieses Gerät — wir sind ehrlich</span>
    </div>
  </header>

  <!-- --------------------------------------------------------- Zugang -->
  {#if buch.status === 'aus'}
    <div class="kasten warnung">
      <b>Noch keine Verbindung eingerichtet.</b>
      <p>
        Das Freundebuch braucht Netz und Anmeldung — Bilder passen nicht in den
        Speicher des Browsers. Sobald die Datenbank steht, geht es hier los.
      </p>
    </div>
  {:else if buch.status === 'abgemeldet'}
    <div class="kasten">
      <b>Wer bist du? {KAOMOJI[1]}</b>
      <div class="loginbox"><LoginPanel /></div>
    </div>
  {:else if buch.status === 'fehler'}
    <div class="kasten warnung">
      <b>Da klemmt was.</b>
      <p>{buch.fehler}</p>
      <button class="knopf" onclick={() => void ladeFreundebuch()}>nochmal versuchen</button>
    </div>
  {/if}

  {#if buch.status === 'bereit' || buch.status === 'lädt'}
    <!-- ---------------------------------------------------- Steckbriefe -->
    <section class="teil">
      <h2><Sticker name="katze" size={26} />Steckbriefe</h2>

      <div class="briefe">
        {#each buch.personen as p (p.id)}
          {@const meiner = p.id === auth.userId}
          {@const brief = buch.steckbriefe[p.id] ?? {}}
          <article class="brief" style={`--k:${p.farbe}`} class:meiner>
            <div class="briefkopf">
              <span class="avatar">{kaomojiVon(p.id)}</span>
              <h3>{p.name}</h3>
              {#if meiner}<span class="du">du</span>{/if}
            </div>

            <dl>
              {#each FRAGEN as f (f.feld)}
                <dt>{f.frage}</dt>
                <dd>
                  {#if meiner}
                    <input
                      type="text"
                      value={meinBrief[f.feld] ?? ''}
                      placeholder={f.platzhalter}
                      maxlength="140"
                      onchange={(e) =>
                        void steckbriefSetzen(f.feld, (e.currentTarget as HTMLInputElement).value)}
                    />
                  {:else if brief[f.feld]}
                    <span>{brief[f.feld]}</span>
                  {:else}
                    <span class="leer">— noch nichts —</span>
                  {/if}
                </dd>
              {/each}
            </dl>
          </article>
        {/each}
      </div>

      {#if buch.personen.length === 0 && buch.status === 'bereit'}
        <p class="hinweis">Noch keine Konten angelegt — die Migration fehlt.</p>
      {/if}
    </section>

    <!-- ----------------------------------------------------- Bilderstrom -->
    <section class="teil">
      <h2><Sticker name="ramen" size={26} />Bilderstrom</h2>

      {#if !formOffen}
        <button class="knopf gross" onclick={() => (formOffen = true)}>
          ✚ Bild oder Zettel hinzufügen
        </button>
      {:else}
        <form class="neu" onsubmit={absenden}>
          <!--
            Zwei getrennte Felder, und das ist kein Schmuck: `capture` zwingt
            das Handy in die Kamera und sperrt die Aufnahmen aus. Genau das war
            hier der Fehler — ein bereits geschossenes Foto ließ sich nicht
            hinzufügen. Ohne `capture` bietet iOS beides an, Android je nach
            Hersteller nur eins. Also beide Wege ausschreiben.
          -->
          <div class="bildwahl">
            <label class="datei">
              <input type="file" accept="image/*" onchange={dateiGewaehlt} />
              <span>🖼️ Aus den Aufnahmen</span>
            </label>
            <label class="datei">
              <input type="file" accept="image/*" capture="environment" onchange={dateiGewaehlt} />
              <span>📷 Jetzt aufnehmen</span>
            </label>
          </div>

          {#if vorschau}
            <div class="vorschaurahmen">
              <img class="vorschau" src={vorschau} alt="Vorschau" />
              <button type="button" class="bildweg" onclick={bildVerwerfen} title="Bild wieder wegnehmen"
                >✕ Bild weg</button
              >
            </div>
            {#if neuDatei}
              <p class="mini">{neuDatei.name} · {groesse(neuDatei.size)}</p>
            {/if}
          {/if}

          <textarea bind:value={neuText} rows="2" placeholder="Was war da los?" maxlength="500"
          ></textarea>

          <div class="reihe">
            <label>
              <span class="mini">Tag</span>
              <input type="date" bind:value={neuDatum} min={trip.start} />
            </label>
            <label class="wachsend">
              <span class="mini">Ort</span>
              <!--
                Vorher ein <select> mit allen 164 Orten. Auf dem Handy heißt das:
                durch eine Liste scrollen, die keinen Anfang und kein Ende hat.
                Jetzt tippt man drei Buchstaben und nimmt den Treffer.
              -->
              {#if gewaehlterOrt}
                <button type="button" class="ortgewaehlt" onclick={ortLoesen}>
                  {gewaehlterOrt.nr > 0 ? `${gewaehlterOrt.nr} · ` : ''}{gewaehlterOrt.name}
                  <span class="x">✕</span>
                </button>
              {:else}
                <input
                  type="search"
                  bind:value={ortSuche}
                  placeholder="Ort suchen — oder leer lassen"
                  autocomplete="off"
                />
              {/if}
            </label>
          </div>

          {#if !gewaehlterOrt && ortTreffer.length}
            <ul class="orttreffer">
              {#each ortTreffer as o (o.nr)}
                <li>
                  <button type="button" onclick={() => ortWaehlen(o.nr)}>
                    {o.nr > 0 ? `${o.nr} · ` : ''}{o.name}
                  </button>
                </li>
              {/each}
              {#if ortMehr > 0}
                <li class="mehr">… und {ortMehr} weitere — genauer tippen</li>
              {/if}
            </ul>
          {:else if !gewaehlterOrt && ortSuche.trim()}
            <p class="mini">Kein Ort gefunden. Der Beitrag geht auch ohne.</p>
          {/if}

          <div class="stickerwahl">
            <span class="mini">Aufkleber</span>
            <div class="stickerreihe">
              {#each STICKER as s (s.name)}
                <button
                  type="button"
                  class="stickerknopf"
                  class:on={neuSticker === s.name}
                  title={s.label}
                  aria-label={s.label}
                  aria-pressed={neuSticker === s.name}
                  onclick={() => (neuSticker = s.name)}
                >
                  <Sticker name={s.name} size={30} />
                </button>
              {/each}
            </div>
          </div>

          {#if buch.upload !== null}
            <div class="balken"><i style={`width:${buch.upload}%`}></i></div>
            <p class="mini">
              {#if buch.letzteGroesse}
                aus {groesse(buch.letzteGroesse.vorher)} wurden
                {groesse(buch.letzteGroesse.nachher)} — wird hochgeladen …
              {:else}
                wird verkleinert …
              {/if}
            </p>
          {/if}

          {#if buch.fehler}
            <p class="fehler">{buch.fehler}</p>
          {/if}

          <div class="reihe">
            <button
              type="button"
              class="knopf schlicht"
              onclick={() => {
                formOffen = false;
                neuDatei = null;
                if (vorschau) URL.revokeObjectURL(vorschau);
                vorschau = null;
              }}>abbrechen</button
            >
            <button class="knopf" type="submit" disabled={buch.upload !== null}>eintragen</button>
          </div>
        </form>
      {/if}

      <div class="strom">
        {#each buch.beitraege as b (b.id)}
          {@const wer = person(b.autorId)}
          <article
            class="polaroid"
            class:nurtext={!b.bildPfad}
            style={`--k:${wer.farbe}; --kipp:${kippung(b.id)}deg`}
          >
            {#if b.sticker}
              <span class="klebe"><Sticker name={b.sticker as StickerName} size={38} /></span>
            {/if}

            {#if b.bildUrl}
              <img src={b.bildUrl} alt={b.text || 'Foto'} loading="lazy" />
            {:else if b.bildPfad}
              <div class="kein">Bild lässt sich gerade nicht laden</div>
            {/if}

            <div class="unten">
              {#if b.text}<p>{b.text}</p>{/if}
              <div class="zeile">
                <span class="wer">{wer.name}</span>
                <span>{formatFull(b.datum)}</span>
                {#if b.ortNr}
                  {@const o = orte.find((x) => x.nr === b.ortNr)}
                  {#if o}<span class="ort">{o.nr > 0 ? `${o.nr} ` : ''}{o.name}</span>{/if}
                {/if}
                {#if b.autorId === auth.userId}
                  <button class="weg" onclick={() => loeschen(b.id)} title="löschen">✕</button>
                {/if}
              </div>
            </div>
          </article>
        {/each}

        {#if buch.status === 'bereit' && !buch.beitraege.length}
          <p class="hinweis">
            Noch nichts drin. {KAOMOJI[3]}<br />
            Das erste Foto kommt bestimmt aus Osaka.
          </p>
        {/if}
      </div>
    </section>
  {/if}

  <footer class="fuss">
    <div class="bau" aria-hidden="true">🚧 under construction 🚧</div>
    <p>この ページ は ともだち だけ の ため です</p>
  </footer>
</div>

<style>
  /*
   * Hier steht nur noch, was das Bearbeiten betrifft: Steckbriefe, das Formular
   * für neue Beiträge, der Löschknopf. Alles, was die Gästeansicht ebenso zeigt —
   * Grundton, Kopf, Kästen, Knöpfe, Polaroids, Fuß und die drei Keyframes — liegt
   * in `src/styles/y2k.css` und kommt über den Import im `<script>`.
   *
   * Die Farbvariablen (`--lila`, `--tinte`, …) kommen von dort und hängen am
   * `.y2k`-Wrapper dieser Komponente. Sie erben hierher; ein Wurzelelement ohne
   * `.y2k` würde alle Regeln unten farblos machen.
   */

  /* Die Anmeldemaske kommt aus dem Reiseplaner und bringt ihre eigene
     Gestaltung mit. Hier bekommt sie einen Rahmen, damit sie als bewusst
     eingesetztes Fremdteil lesbar ist statt wie ein Fehler. */
  .loginbox {
    background: var(--washi, #efe7d6);
    border: 2px dashed var(--lila);
    border-radius: 6px;
    padding: 10px 11px;
  }

  /* ------------------------------------------------------- Steckbriefe */

  .briefe {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }

  .brief {
    border: 3px solid var(--k);
    border-radius: 10px;
    background: var(--papier);
    padding: 12px 13px 14px;
    box-shadow: 4px 4px 0 rgba(42, 20, 64, 0.2);
  }

  .brief.meiner {
    background: linear-gradient(170deg, #fffbe9, var(--papier));
  }

  .briefkopf {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 2px dotted var(--k);
    padding-bottom: 7px;
    margin-bottom: 9px;
  }

  .avatar {
    font-size: 1.1rem;
    background: var(--k);
    color: #fff;
    border-radius: 999px;
    padding: 4px 7px;
    white-space: nowrap;
  }

  .briefkopf h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--k);
  }

  .du {
    margin-left: auto;
    font-size: 0.6rem;
    letter-spacing: 0.15em;
    background: var(--sonne);
    border: 1px solid var(--tinte);
    padding: 2px 6px;
    border-radius: 3px;
  }

  dl {
    margin: 0;
  }

  dt {
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    color: var(--lila);
    margin-top: 8px;
  }

  dd {
    margin: 2px 0 0;
    font-size: 0.88rem;
  }

  .leer {
    opacity: 0.45;
  }

  /* ------------------------------------------------------ Eingabefelder */

  .brief input,
  .neu textarea,
  .neu input {
    width: 100%;
    background: #fff;
    border: 2px solid var(--lila);
    border-radius: 4px;
    padding: 7px 8px;
    font-family: inherit;
    /* 16 px, sonst zoomt iOS beim Antippen hinein. Der Stilbruch endet an
       der Bedienbarkeit. */
    font-size: 16px;
    color: var(--tinte);
    /* 44 px wie `.orttreffer button` und die Tab-Leiste: Ein Datumsfeld und ein
       Suchfeld sind Tippziele, und mit Polster und Schrift allein kommen sie auf
       37 px. Das gilt für das Suchfeld doppelt — es steht direkt über einer
       Trefferliste, und daneben zu tippen wählt einen Ort aus. */
    min-height: 44px;
  }

  .brief input:focus,
  .neu textarea:focus,
  .neu input:focus {
    outline: 3px solid var(--pink);
    outline-offset: 1px;
  }

  /* ------------------------------------------------------ Neuer Beitrag */

  .neu {
    display: flex;
    flex-direction: column;
    gap: 9px;
    border: 3px dashed var(--pink);
    border-radius: 10px;
    background: var(--papier);
    padding: 13px;
  }

  .datei {
    display: block;
    border: 3px dotted var(--lila);
    border-radius: 8px;
    padding: 16px 12px;
    text-align: center;
    background: #fff;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .datei input {
    display: none;
  }

  /* Zwei Knöpfe nebeneinander, auf schmalen Geräten untereinander. */
  .bildwahl {
    display: flex;
    gap: 8px;
  }
  .bildwahl .datei {
    flex: 1 1 0;
    padding: 14px 8px;
  }
  @media (max-width: 380px) {
    .bildwahl {
      flex-direction: column;
    }
  }

  .ortgewaehlt {
    width: 100%;
    min-height: 44px;
    padding: 0 10px;
    border: 3px solid var(--tinte);
    border-radius: 6px;
    background: var(--sonne);
    color: var(--tinte);
    font: inherit;
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .ortgewaehlt .x {
    font-weight: 700;
    flex: none;
  }

  .orttreffer {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 3px solid var(--lila);
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
  }
  .orttreffer li + li {
    border-top: 1px dashed var(--lila);
  }
  .orttreffer button {
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 0.85rem;
    text-align: left;
    color: var(--tinte);
    cursor: pointer;
  }
  .orttreffer button:active {
    background: var(--sonne);
  }
  .orttreffer .mehr {
    padding: 8px 12px;
    font-size: 0.72rem;
    color: #6b5a8a;
  }

  .vorschaurahmen {
    position: relative;
  }
  .vorschau {
    width: 100%;
    max-height: 260px;
    object-fit: cover;
    border: 3px solid var(--tinte);
    border-radius: 6px;
    display: block;
  }
  /* Über dem Bild, aber mit 44 px Höhe — darunter trifft kein Finger. */
  .bildweg {
    position: absolute;
    top: 8px;
    right: 8px;
    min-height: 44px;
    padding: 0 14px;
    border: 3px solid var(--tinte);
    border-radius: 6px;
    background: var(--pink);
    color: var(--tinte);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 2px 2px 0 var(--tinte);
  }
  .bildweg:active {
    transform: translate(2px, 2px);
    box-shadow: none;
  }

  .reihe {
    display: flex;
    gap: 9px;
    align-items: flex-end;
  }

  .reihe label {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .wachsend {
    flex: 1;
    min-width: 0;
  }

  .mini {
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    color: var(--lila);
  }

  .stickerwahl {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .stickerreihe {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .stickerknopf {
    background: #fff;
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 5px;
    cursor: pointer;
    min-width: 44px;
    min-height: 44px;
    display: grid;
    place-items: center;
  }

  .stickerknopf.on {
    border-color: var(--pink);
    background: #ffe9f4;
    box-shadow: 0 0 0 2px var(--sonne);
  }

  .balken {
    height: 12px;
    border: 2px solid var(--tinte);
    border-radius: 999px;
    background: #fff;
    overflow: hidden;
  }

  .balken i {
    display: block;
    height: 100%;
    background: repeating-linear-gradient(
      45deg,
      var(--limone) 0 6px,
      var(--cyan) 6px 12px
    );
    transition: width 0.25s ease;
  }

  .fehler {
    margin: 0;
    font-size: 0.82rem;
    color: #b3003c;
  }

  /* Der Löschknopf sitzt in `.zeile` am Polaroid; die Zeile selbst kommt aus
     `y2k.css`. Er bleibt hier, weil die Gästeansicht nichts löschen kann. */
  .weg {
    margin-left: auto;
    background: none;
    border: none;
    color: #b3003c;
    cursor: pointer;
    font-size: 0.9rem;
    min-width: 30px;
    min-height: 30px;
  }

  @media (max-width: 480px) {
    .reihe {
      flex-wrap: wrap;
    }
  }
</style>
