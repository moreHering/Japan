<script lang="ts">
  /**
   * Zustand des Abgleichs im Klartext — und die eine Entscheidung, die die App
   * nicht selbst treffen darf.
   *
   * Beim ersten Abgleich eines Geräts kann es passieren, dass hier ein Plan
   * liegt und in der gemeinsamen Ablage ein anderer. Beides zusammenzuführen
   * ginge nur mit Raten; eine Seite still zu überschreiben, kann Tage Arbeit
   * kosten. Deshalb wird gefragt — mit Zahlen, damit die Frage beantwortbar ist.
   */
  import {
    sync,
    abgleichen,
    entscheideFuerGeraet,
    entscheideFuerAblage,
    verworfenQuittieren,
    kennzahlen,
  } from '../lib/sync.svelte';
  import { plan } from '../lib/store.svelte';

  let lokal = $derived(kennzahlen(plan));
  let fremd = $derived(sync.entscheidung ? kennzahlen(sync.entscheidung) : null);

  const stand: Record<string, string> = {
    abgemeldet: 'Nicht angemeldet — Änderungen bleiben auf diesem Gerät.',
    lädt: 'Gleicht ab …',
    bereit: 'Abgeglichen.',
    wartet: 'Kein Netz — die Änderungen gehen raus, sobald wieder Verbindung besteht.',
    fehler: 'Der Abgleich ist gestört.',
  };

  function zeit(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
</script>

{#if sync.verworfen}
  <p class="zeile verlust">
    <span>{sync.verworfen}</span>
    <button class="btn small ghost" onclick={verworfenQuittieren}>verstanden</button>
  </p>
{/if}

{#if sync.status === 'aus'}
  <p class="zeile aus">
    Für diese Seite sind keine Zugangsdaten hinterlegt. Der Plan bleibt auf diesem Gerät;
    zum Übertragen dient der Export weiter unten.
  </p>
{:else if sync.status === 'entscheidung' && fremd}
  <div class="frage">
    <h3>Zwei Pläne — welcher gilt?</h3>
    <p>
      Auf diesem Gerät liegt ein Plan, und in der gemeinsamen Ablage liegt auch einer.
      Zusammenführen lässt sich das nicht ohne Raten. <b>Sichere vorher unten den Export</b> —
      danach ist die verworfene Seite weg.
    </p>

    <div class="paar">
      <div class="karte">
        <div class="kopf">Dieses Gerät</div>
        <ul>
          <li><b>{lokal.orte}</b> eingeplante Orte</li>
          <li><b>{lokal.tage}</b> belegte Tage</li>
          <li><b>{lokal.besucht}</b> besucht · <b>{lokal.ausgaben}</b> Ausgaben</li>
        </ul>
        <button class="btn small" onclick={entscheideFuerGeraet}>
          Diesen hochladen
        </button>
      </div>

      <div class="karte">
        <div class="kopf">Gemeinsame Ablage</div>
        <ul>
          <li><b>{fremd.orte}</b> eingeplante Orte</li>
          <li><b>{fremd.tage}</b> belegte Tage</li>
          <li><b>{fremd.besucht}</b> besucht · <b>{fremd.ausgaben}</b> Ausgaben</li>
        </ul>
        <button class="btn small" onclick={entscheideFuerAblage}>
          Diesen übernehmen
        </button>
      </div>
    </div>
  </div>
{:else}
  <p class="zeile" class:warn={sync.status === 'wartet'} class:fehl={sync.status === 'fehler'}>
    {stand[sync.status] ?? ''}
    {#if sync.offen}
      <b>{sync.offen}</b> Änderung{sync.offen === 1 ? '' : 'en'} noch nicht übertragen.
    {:else if sync.status === 'bereit'}
      Letzter Abgleich {zeit(sync.letzterAbgleich)}.
    {/if}
    {#if sync.status === 'bereit' || sync.status === 'wartet'}
      <button class="btn small ghost" onclick={() => void abgleichen()}>jetzt abgleichen</button>
    {/if}
  </p>

  {#if sync.fehler}
    <p class="zeile fehl">{sync.fehler}</p>
  {/if}
{/if}

<style>
  .zeile {
    font-family: var(--util);
    font-size: 0.78rem;
    color: var(--ai-60);
    margin: 9px 0 0;
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .zeile b {
    color: var(--ai);
  }

  .zeile button {
    margin-left: auto;
  }

  .aus,
  .warn {
    color: var(--ai-60);
  }

  .fehl {
    color: var(--shu-deep);
  }

  /* Eine verlorene Änderung ist die einzige Meldung hier, die man nicht
     überlesen darf — deshalb als Kasten, nicht als graue Zeile. */
  .verlust {
    color: var(--shu-deep);
    background: rgba(198, 64, 43, 0.08);
    border: 1px solid var(--shu);
    border-radius: var(--radius-sm);
    padding: 9px 11px;
  }

  .frage {
    margin-top: 12px;
    padding: 14px;
    border: 1px solid var(--shu);
    border-radius: var(--radius-sm);
    background: rgba(198, 64, 43, 0.06);
  }

  .frage h3 {
    font-family: var(--disp);
    font-size: 1rem;
    margin: 0 0 6px;
  }

  .frage p {
    font-family: var(--util);
    font-size: 0.8rem;
    line-height: 1.5;
    margin: 0 0 12px;
    color: var(--ai-60);
  }

  .paar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 10px;
  }

  .karte {
    background: var(--washi);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 11px 12px;
  }

  .kopf {
    font-family: var(--util);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--kin);
    margin-bottom: 7px;
  }

  .karte ul {
    list-style: none;
    margin: 0 0 11px;
    padding: 0;
    font-family: var(--util);
    font-size: 0.78rem;
    line-height: 1.7;
    color: var(--ai-60);
  }

  .karte ul b {
    color: var(--ai);
    font-size: 0.92rem;
  }
</style>
