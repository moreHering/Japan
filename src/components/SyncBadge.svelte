<script lang="ts">
  /**
   * Anzeige des Abgleichs in der Kopfzeile — und die Stelle, an der der
   * Abgleich überhaupt anläuft. Sie steht im Layout und damit auf jeder Seite;
   * sonst würde nur abgeglichen, wer zufällig die Organisationsseite öffnet.
   *
   * Absichtlich klein: Auf dem Handy ist Platz in der Kopfzeile knapp. Ein
   * Punkt sagt den Zustand, die Zahl daneben sagt, wie viel noch aussteht.
   */
  import { onMount } from 'svelte';
  import { sync, initSync, abgleichen } from '../lib/sync.svelte';
  import { initAuth } from '../lib/auth.svelte';
  import { url } from '../lib/paths';

  onMount(() => {
    initAuth();
    initSync();
  });

  const texte: Record<string, string> = {
    aus: 'kein Abgleich eingerichtet',
    abgemeldet: 'nicht angemeldet',
    lädt: 'gleicht ab …',
    bereit: 'abgeglichen',
    wartet: 'wartet auf Netz',
    entscheidung: 'Entscheidung nötig',
    fehler: 'Abgleich gestört',
  };

  /** Bei diesen Zuständen hilft nur die Organisationsseite weiter. */
  let hinFuehren = $derived(
    sync.status === 'entscheidung' ||
      sync.status === 'fehler' ||
      sync.status === 'abgemeldet' ||
      Boolean(sync.verworfen),
  );

  let titel = $derived(
    [
      texte[sync.status],
      sync.offen ? `${sync.offen} Änderung(en) offen` : '',
      sync.fehler ?? '',
      sync.verworfen ?? '',
    ]
      .filter(Boolean)
      .join(' · '),
  );

  /** Eine verlorene Änderung übertönt jeden sonstigen Zustand. */
  let anzeige = $derived(sync.verworfen ? 'Änderung verloren' : texte[sync.status]);
</script>

{#if sync.status !== 'aus'}
  {#if hinFuehren}
    <a class="badge {sync.verworfen ? 'fehler' : sync.status}" href={url('organisation')} title={titel} aria-label={titel}>
      <span class="punkt"></span>
      <span class="wort">{anzeige}</span>
    </a>
  {:else}
    <button
      class="badge {sync.status}"
      onclick={() => void abgleichen()}
      title={titel}
      aria-label={titel}
    >
      <span class="punkt"></span>
      <span class="wort">
        {sync.offen ? `${sync.offen} offen` : texte[sync.status]}
      </span>
    </button>
  {/if}
{/if}

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(239, 231, 214, 0.1);
    border: 1px solid rgba(239, 231, 214, 0.25);
    border-radius: 999px;
    padding: 5px 10px;
    font-family: var(--util);
    font-size: 0.72rem;
    color: var(--washi);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
  }

  .punkt {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--line);
    flex: none;
  }

  .bereit .punkt {
    background: #7fa06a;
  }

  .lädt .punkt {
    background: var(--kin);
    animation: pochen 1.1s ease-in-out infinite;
  }

  .wartet .punkt {
    background: var(--kin);
  }

  .fehler .punkt,
  .entscheidung .punkt {
    background: #e2724f;
  }

  @keyframes pochen {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.25;
    }
  }

  /* Auf schmalen Geräten bleibt nur der Punkt — das Wort kostet zu viel Platz. */
  @media (max-width: 560px) {
    .wort {
      display: none;
    }

    .badge {
      padding: 7px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lädt .punkt {
      animation: none;
    }
  }
</style>
