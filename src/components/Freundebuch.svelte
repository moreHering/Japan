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
  import { places } from '../lib/places';
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

  let meinBrief = $derived(auth.userId ? (buch.steckbriefe[auth.userId] ?? {}) : {});

  async function dateiGewaehlt(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    if (vorschau) URL.revokeObjectURL(vorschau);
    neuDatei = f;
    vorschau = f ? URL.createObjectURL(f) : null;
  }

  async function absenden(e: Event) {
    e.preventDefault();
    if (!neuDatei && !neuText.trim()) return;

    const ok = await beitragAnlegen({
      datei: neuDatei,
      text: neuText.trim(),
      datum: neuDatum,
      ortNr: neuOrt ? Number(neuOrt) : null,
      sticker: neuSticker,
    });
    if (!ok) return;

    neuText = '';
    neuOrt = '';
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
          <label class="datei">
            <input type="file" accept="image/*" capture="environment" onchange={dateiGewaehlt} />
            <span>{neuDatei ? neuDatei.name : '📷 Foto wählen oder aufnehmen'}</span>
          </label>

          {#if vorschau}
            <img class="vorschau" src={vorschau} alt="Vorschau" />
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
              <select bind:value={neuOrt}>
                <option value="">— keiner —</option>
                {#each orte as o (o.nr)}
                  <option value={String(o.nr)}>{o.nr > 0 ? `${o.nr} · ` : ''}{o.name}</option>
                {/each}
              </select>
            </label>
          </div>

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
  /* ------------------------------------------------------------ Grundton */

  .y2k {
    --pink: #ff4fa3;
    --cyan: #35e0e8;
    --lila: #7b5cff;
    --limone: #b6ff5c;
    --sonne: #ffd84d;
    --tinte: #2a1440;
    --papier: #fff3fa;

    font-family: 'DotGothic16', 'Zen Kaku Gothic New', monospace;
    color: var(--tinte);
    padding: 4px 0 30px;
  }

  /* ------------------------------------------------------------- Kopf */

  .kopf {
    position: relative;
    text-align: center;
    border: 4px double var(--lila);
    border-radius: 10px;
    background:
      radial-gradient(circle at 12% 18%, rgba(255, 79, 163, 0.35) 0 22%, transparent 23%),
      radial-gradient(circle at 88% 30%, rgba(53, 224, 232, 0.35) 0 18%, transparent 19%),
      linear-gradient(160deg, #fff3fa 0%, #e8e1ff 55%, #d8fbff 100%);
    padding: 18px 12px 14px;
    overflow: hidden;
  }

  /* Stand vorher absolut in der Ecke und lag dabei auf der Überschrift.
     Jetzt eine eigene Zeile darüber — schwebt weiter, überlappt aber nichts. */
  .glitzer {
    display: flex;
    justify-content: center;
    gap: 7px;
    margin-bottom: 8px;
    animation: schweben 3.2s ease-in-out infinite;
  }

  @keyframes schweben {
    0%,
    100% {
      transform: translateY(0) rotate(-4deg);
    }
    50% {
      transform: translateY(5px) rotate(4deg);
    }
  }

  h1 {
    margin: 0;
    line-height: 1.15;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .jp {
    font-size: 1rem;
    color: var(--lila);
    letter-spacing: 0.2em;
  }

  .lat {
    font-size: clamp(1.7rem, 9vw, 2.9rem);
    font-weight: 700;
    letter-spacing: 0.04em;
    background: linear-gradient(90deg, var(--pink), var(--lila) 45%, var(--cyan));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    /* Der harte Schatten ist das, was die Schrift „2001" macht. */
    filter: drop-shadow(2px 2px 0 #fff) drop-shadow(3px 3px 0 var(--tinte));
  }

  .jahr {
    font-size: 0.8rem;
    letter-spacing: 0.45em;
    color: var(--pink);
  }

  .laufband {
    margin: 12px -12px 10px;
    background: var(--tinte);
    color: var(--limone);
    font-size: 0.74rem;
    padding: 5px 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .lauf {
    display: inline-block;
    padding-left: 100%;
    animation: laufen 22s linear infinite;
  }

  @keyframes laufen {
    to {
      transform: translateX(-100%);
    }
  }

  .zaehler {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .zlabel,
  .zhinweis {
    font-size: 0.58rem;
    letter-spacing: 0.18em;
    color: var(--lila);
  }

  .zhinweis {
    letter-spacing: 0.02em;
    opacity: 0.75;
  }

  .zziffern {
    display: flex;
    gap: 2px;
  }

  .zziffern b {
    background: #101018;
    color: var(--limone);
    font-size: 1.05rem;
    padding: 2px 5px;
    border-radius: 2px;
    border: 1px solid #3a3a55;
    box-shadow: inset 0 -4px 6px rgba(0, 0, 0, 0.6);
  }

  /* ------------------------------------------------------------ Kästen */

  .kasten {
    margin-top: 14px;
    border: 3px solid var(--lila);
    border-radius: 8px;
    background: var(--papier);
    padding: 13px 14px;
    box-shadow: 4px 4px 0 var(--cyan);
  }

  .kasten.warnung {
    border-color: var(--pink);
    box-shadow: 4px 4px 0 var(--sonne);
  }

  .kasten b {
    display: block;
    margin-bottom: 6px;
    font-size: 1rem;
  }

  .kasten p {
    margin: 0 0 10px;
    font-size: 0.85rem;
    line-height: 1.55;
  }

  /* Die Anmeldemaske kommt aus dem Reiseplaner und bringt ihre eigene
     Gestaltung mit. Hier bekommt sie einen Rahmen, damit sie als bewusst
     eingesetztes Fremdteil lesbar ist statt wie ein Fehler. */
  .loginbox {
    background: var(--washi, #efe7d6);
    border: 2px dashed var(--lila);
    border-radius: 6px;
    padding: 10px 11px;
  }

  /* ------------------------------------------------------------- Teile */

  .teil {
    margin-top: 22px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font-size: 1.25rem;
    color: var(--lila);
    text-shadow: 2px 2px 0 var(--sonne);
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
  .neu input,
  .neu select {
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
  }

  .brief input:focus,
  .neu textarea:focus {
    outline: 3px solid var(--pink);
    outline-offset: 1px;
  }

  /* ---------------------------------------------------------- Knöpfe */

  .knopf {
    font-family: inherit;
    font-size: 0.9rem;
    min-height: 44px;
    padding: 0 18px;
    border: 3px solid var(--tinte);
    border-radius: 6px;
    background: linear-gradient(180deg, var(--sonne), #ffb020);
    color: var(--tinte);
    cursor: pointer;
    box-shadow: 3px 3px 0 var(--tinte);
  }

  .knopf:active {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 var(--tinte);
  }

  .knopf.gross {
    width: 100%;
    background: linear-gradient(180deg, var(--cyan), #14b8c0);
  }

  .knopf.schlicht {
    background: #fff;
    box-shadow: 3px 3px 0 rgba(42, 20, 64, 0.35);
  }

  .knopf[disabled] {
    opacity: 0.55;
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

  .vorschau {
    width: 100%;
    max-height: 260px;
    object-fit: cover;
    border: 3px solid var(--tinte);
    border-radius: 6px;
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

  /* ------------------------------------------------------ Bilderstrom */

  .strom {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 16px;
  }

  /*
   * Der breite untere Rand ist der Polaroid-Steg — er muss weiß sein. Vorher
   * kam er aus einem 34 px breiten Rahmen in Rahmenfarbe und wurde grau, was
   * bei Beiträgen ohne Foto wie ein fehlendes Bild aussah. Jetzt ist es
   * Innenabstand auf weißem Grund.
   */
  .polaroid {
    position: relative;
    background: #fff;
    border: 1px solid #d8cfd8;
    border-radius: 3px;
    padding: 9px 9px 24px;
    box-shadow: 3px 5px 0 rgba(42, 20, 64, 0.22);
    transform: rotate(var(--kipp));
  }

  /* Ein Zettel ohne Foto braucht keinen Steg — sonst wirkt er wie ein
     Polaroid, dessen Bild nicht geladen hat. */
  .polaroid.nurtext {
    padding-bottom: 10px;
    background: linear-gradient(180deg, #fffdf2, #fff);
  }

  .polaroid img {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: #eee;
  }

  .kein {
    display: grid;
    place-items: center;
    aspect-ratio: 4 / 3;
    background: #f3eef6;
    font-size: 0.78rem;
    color: #8a7f96;
    text-align: center;
    padding: 10px;
  }

  .klebe {
    position: absolute;
    top: -14px;
    right: -10px;
    z-index: 2;
    transform: rotate(14deg);
  }

  .unten {
    padding: 8px 2px 10px;
  }

  .unten p {
    margin: 0 0 6px;
    font-size: 0.88rem;
    line-height: 1.45;
    word-break: break-word;
  }

  .zeile {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 0.66rem;
    color: #6b5f78;
  }

  .wer {
    background: var(--k);
    color: #fff;
    padding: 2px 7px;
    border-radius: 999px;
  }

  .ort {
    border: 1px solid var(--lila);
    border-radius: 3px;
    padding: 1px 5px;
  }

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

  .hinweis {
    grid-column: 1 / -1;
    text-align: center;
    font-size: 0.92rem;
    line-height: 1.7;
    color: var(--lila);
  }

  /* -------------------------------------------------------------- Fuß */

  .fuss {
    margin-top: 26px;
    text-align: center;
    border-top: 3px double var(--lila);
    padding-top: 12px;
  }

  .bau {
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    color: var(--pink);
    animation: blinken 1.6s steps(2, end) infinite;
  }

  @keyframes blinken {
    50% {
      opacity: 0.25;
    }
  }

  .fuss p {
    margin: 6px 0 0;
    font-size: 0.72rem;
    color: var(--lila);
    letter-spacing: 0.1em;
  }

  /* Wer Bewegung abgestellt hat, bekommt keine — Lauftext und Blinken sind
     Zitat, kein Zweck. */
  @media (prefers-reduced-motion: reduce) {
    .lauf,
    .glitzer,
    .bau {
      animation: none;
    }

    .lauf {
      padding-left: 0;
      white-space: normal;
    }
  }

  @media (max-width: 480px) {
    .reihe {
      flex-wrap: wrap;
    }

    .polaroid {
      transform: none; /* gekippte Karten kosten auf schmalem Schirm Breite */
    }
  }
</style>
