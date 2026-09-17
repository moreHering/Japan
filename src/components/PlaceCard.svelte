<script lang="ts">
  /** Ein Ort in der Liste: Nummer, Name, Hinweise, Aktionen. */
  import { categoryOf, type Place } from '../lib/places';
  import { maps } from '../lib/paths';
  import { isDone, toggleDone, dayOfPlace } from '../lib/store.svelte';
  import { formatDay } from '../lib/trip';

  type Props = {
    place: Place;
    /** Kompakte Darstellung ohne Beschreibungstext. */
    compact?: boolean;
    /** Hervorgehoben, weil auf der Karte ausgewählt. */
    active?: boolean;
    onselect?: (nr: number) => void;
    /** Zusätzliche Aktionen rechts (z. B. "auf Tag legen"). */
    children?: import('svelte').Snippet;
  };

  let { place, compact = false, active = false, onselect, children }: Props = $props();

  const cat = categoryOf(place.category);
  let done = $derived(isDone(place.nr));
  let placedOn = $derived(dayOfPlace(place.nr));
  let expanded = $state(false);

  let hints = $derived(
    [
      place.closedDay ? { text: `${place.closedDay}. geschlossen`, warn: true } : null,
      place.needsBooking ? { text: 'Reservierung nötig', warn: true } : null,
      place.cashOnly ? { text: 'nur Bargeld', warn: false } : null,
    ].filter((h): h is { text: string; warn: boolean } => h !== null),
  );
</script>

<article class="place" class:active class:done class:compact>
  <button
    class="pin {place.category}"
    title={`Nr. ${place.nr} — auf der Karte zeigen`}
    onclick={() => onselect?.(place.nr)}
  >
    {place.nr}
  </button>

  <div class="body">
    <h3>
      {place.name}
      {#if place.isFriendTip}
        <span class="tip" title="Freundestipp">★</span>
      {/if}
      {#if place.book}
        <span class="book" title={`Aus dem Reiseführer — Erlebnis ${place.book}: ${place.bookTitle}`}>
          📖
        </span>
      {/if}
    </h3>

    <div class="meta">
      <span class="cat" style={`color:${cat.color}`}>{cat.short}</span>
      <span class="dot">·</span>
      <span>{place.stationLabel}</span>
      {#if placedOn}
        <span class="dot">·</span>
        <span class="placed">{formatDay(placedOn)}</span>
      {/if}
    </div>

    {#if hints.length}
      <div class="hints">
        {#each hints as hint (hint.text)}
          <span class="hint" class:warn={hint.warn}>{hint.text}</span>
        {/each}
      </div>
    {/if}

    {#if !compact}
      <p class="desc" class:clamped={!expanded}>
        <!-- Nur <strong>/<em> aus dem Reiseband, vom Konvertierungsskript gefiltert -->
        {@html place.descriptionHtml}
      </p>
      {#if place.descriptionHtml.length > 190}
        <button class="more" onclick={() => (expanded = !expanded)}>
          {expanded ? 'weniger' : 'mehr'}
        </button>
      {/if}
    {/if}

    <div class="actions">
      <button
        class="btn small"
        aria-pressed={done}
        onclick={() => toggleDone(place.nr)}
        title="Als besucht markieren"
      >
        {done ? '✓ besucht' : 'besucht?'}
      </button>
      {@render children?.()}
      <a class="btn small ghost" href={maps(place)} target="_blank" rel="noopener">Maps ↗</a>
    </div>
  </div>
</article>

<style>
  .place {
    display: flex;
    gap: 11px;
    padding: 12px 13px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    transition: border-color 0.14s, box-shadow 0.14s;
  }

  .place.active {
    border-color: var(--shu);
    box-shadow: 0 0 0 2px rgba(198, 64, 43, 0.16);
  }

  .place.done {
    background: var(--washi-2);
  }

  .place.done h3 {
    color: var(--ai-60);
  }

  .pin {
    border: 2px solid rgba(239, 231, 214, 0.9);
    cursor: pointer;
    align-self: flex-start;
    margin-top: 1px;
  }

  .pin:hover {
    transform: scale(1.09);
  }

  .body {
    min-width: 0;
    flex: 1;
  }

  h3 {
    font-size: 1rem;
    margin: 0 0 3px;
  }

  .tip {
    color: var(--kin);
    font-size: 0.85em;
  }

  .book {
    font-size: 0.8em;
    opacity: 0.85;
  }

  .meta {
    font-family: var(--util);
    font-size: 0.7rem;
    color: var(--ai-40);
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
  }

  .cat {
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .dot {
    opacity: 0.5;
  }

  .placed {
    color: var(--shu-deep);
    font-weight: 700;
  }

  .hints {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 6px;
  }

  .hint {
    font-family: var(--util);
    font-size: 0.66rem;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--washi-2);
    color: var(--ai-60);
    border: 1px solid var(--line);
  }

  .hint.warn {
    background: rgba(198, 64, 43, 0.09);
    border-color: rgba(198, 64, 43, 0.3);
    color: var(--shu-deep);
  }

  .desc {
    font-size: 0.88rem;
    margin: 7px 0 0;
    color: var(--ai);
  }

  .desc.clamped {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .more {
    background: none;
    border: none;
    padding: 2px 0;
    font-family: var(--util);
    font-size: 0.7rem;
    color: var(--shu-deep);
    cursor: pointer;
    text-decoration: underline;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 9px;
  }

  .compact {
    padding: 9px 11px;
  }

  .compact h3 {
    font-size: 0.92rem;
  }
</style>
