<script lang="ts">
  /**
   * Anmeldung für die drei Reisenden.
   *
   * Ist die Verbindung nicht eingerichtet, zeigt die Komponente das offen an,
   * statt eine Maske anzubieten, die nicht funktionieren kann.
   */
  import { onMount } from 'svelte';
  import {
    auth,
    initAuth,
    anmelden,
    abmelden,
    letzterName,
    bleibtAngemeldet,
    KONTEN,
    type KontoName,
  } from '../lib/auth.svelte';

  let name = $state<KontoName>(KONTEN[0].name);
  let passwort = $state('');
  let merken = $state(true);
  let offen = $state(false);

  onMount(() => {
    name = letzterName();
    merken = bleibtAngemeldet();
    initAuth();
  });

  async function absenden(e: Event) {
    e.preventDefault();
    const ok = await anmelden(name, passwort, merken);
    if (ok) {
      passwort = '';
      offen = false;
    }
  }

  let farbe = $derived(KONTEN.find((k) => k.name === auth.name)?.farbe ?? 'var(--ai-60)');
</script>

{#if auth.status === 'nicht-eingerichtet'}
  <div class="zeile hinweis">
    <span class="punkt grau"></span>
    <span>Nur auf diesem Gerät gespeichert — Abgleich noch nicht eingerichtet.</span>
  </div>
{:else if auth.status === 'lädt'}
  <div class="zeile hinweis"><span class="punkt grau"></span><span>Anmeldung wird geprüft …</span></div>
{:else if auth.status === 'angemeldet'}
  <div class="zeile">
    <span class="punkt" style={`background:${farbe}`}></span>
    <span>Angemeldet als <b>{auth.name}</b></span>
    <button class="btn small ghost" onclick={abmelden} disabled={auth.beschäftigt}>abmelden</button>
  </div>
{:else}
  <div class="zeile">
    <span class="punkt grau"></span>
    <span>Nicht angemeldet — Änderungen bleiben auf diesem Gerät.</span>
    <button class="btn small primary" onclick={() => (offen = !offen)}>
      {offen ? 'schließen' : 'anmelden'}
    </button>
  </div>

  {#if offen}
    <form class="maske" onsubmit={absenden}>
      <div class="namen">
        {#each KONTEN as k (k.name)}
          <button
            type="button"
            class="konto"
            class:on={name === k.name}
            style={`--k:${k.farbe}`}
            onclick={() => (name = k.name)}
            aria-pressed={name === k.name}
          >
            {k.name}
          </button>
        {/each}
      </div>

      <label class="pw">
        <span class="sr-only">Passwort</span>
        <input
          type="password"
          bind:value={passwort}
          placeholder="Passwort"
          autocomplete="current-password"
          required
        />
      </label>

      <label class="merken">
        <input type="checkbox" bind:checked={merken} />
        <span>angemeldet bleiben</span>
      </label>

      <button class="btn primary" type="submit" disabled={auth.beschäftigt}>
        {auth.beschäftigt ? 'moment …' : 'anmelden'}
      </button>

      {#if auth.fehler}
        <p class="fehler">{auth.fehler}</p>
      {/if}
    </form>
  {/if}
{/if}

<style>
  .zeile {
    display: flex;
    align-items: center;
    gap: 9px;
    font-family: var(--util);
    font-size: 0.78rem;
    color: var(--ai-60);
    flex-wrap: wrap;
  }

  .zeile b {
    color: var(--ai);
  }

  .zeile button {
    margin-left: auto;
  }

  .hinweis {
    color: var(--ai-40);
  }

  .punkt {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    flex: none;
  }

  .punkt.grau {
    background: var(--line);
    border: 1px solid var(--ai-40);
  }

  .maske {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-top: 11px;
    padding-top: 11px;
    border-top: 1px solid var(--line-soft);
  }

  .namen {
    display: flex;
    gap: 6px;
  }

  .konto {
    flex: 1;
    font-family: var(--util);
    font-size: 0.82rem;
    background: var(--washi);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 10px 8px;
    cursor: pointer;
    color: var(--ai-60);
  }

  .konto.on {
    background: var(--k);
    border-color: var(--k);
    color: #fff;
    font-weight: 700;
  }

  .pw input {
    width: 100%;
    background: var(--washi);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    font-family: var(--util);
  }

  .merken {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--util);
    font-size: 0.8rem;
    color: var(--ai-60);
    cursor: pointer;
  }

  .merken input {
    accent-color: var(--shu);
    width: 18px;
    height: 18px;
  }

  .fehler {
    font-family: var(--util);
    font-size: 0.78rem;
    color: var(--shu-deep);
    margin: 0;
  }
</style>
