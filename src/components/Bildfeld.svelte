<script lang="ts">
  /**
   * Die Bilder eines Freundebuch-Beitrags, in der Form seiner Vorlage.
   *
   * ## Warum es diese Komponente gibt
   *
   * Das Polaroid wurde an **zwei** Stellen unabhängig gebaut:
   * `Freundebuch.svelte` und `Tagebuch.svelte`. Mit einem Bild und einem
   * Seitenverhältnis war das noch zu vertreten. Mit fünf Vorlagen und bis zu vier
   * Bildern heißt es, dieselbe Fallunterscheidung zweimal zu pflegen — und die
   * beiden Stellen sind schon heute leicht verschieden (`nurtext` hängt einmal am
   * Pfad, einmal an der URL). Der nächste Unterschied wäre keiner, den jemand
   * beschlossen hat.
   *
   * ## Rein darstellend, und das ist eine Zusicherung
   *
   * **Kein `input`, kein `form`, kein `button`.** Die Gästeansicht
   * (`/tagebuch/`) verspricht, nichts Bedienbares zu enthalten, und
   * `browser-tagebuch.mjs` zählt genau diese Knoten. Eine gemeinsame Komponente
   * mit einem Löschknopf darin hätte dieses Versprechen gebrochen — der Knopf
   * bleibt deshalb draußen, im Freundebuch.
   *
   * **Kein eigener `<style>`-Block.** Die Regeln stehen in `src/styles/y2k.css`;
   * stünden sie auch hier, gäbe es zwei Quellen für dieselbe Regel, und welche
   * gewinnt, hinge an der Reihenfolge der Stylesheets. `y2k-css.test.ts` prüft
   * das.
   *
   * ## Was draußen bleibt und warum
   *
   * Der Kippwinkel (0,7 im Freundebuch, 0,4 im Tagebuch), die `nurtext`-Klasse
   * und der Löschknopf. Diese Unterschiede sind Absicht, nicht Zufall: Im
   * Freundebuch darf die Kippung deutlicher sein, weil dort weniger Beiträge
   * dicht beieinander stehen. Sie hier zu vereinheitlichen hätte geheißen, eine
   * Gestaltungsentscheidung aus Bequemlichkeit zurückzunehmen.
   */
  import { bilderZeigen, vorlageVon } from '../lib/vorlagen';

  type Bild = { url: string; alt: string };

  type Props = {
    /** Der gespeicherte Wert aus `guestbook_post.vorlage` — `null` heißt Polaroid. */
    vorlage: string | null;
    bilder: Bild[];
    /**
     * Wie viele Bilder der Beitrag **haben sollte**.
     *
     * Getrennt von `bilder.length`, weil beides auseinanderfallen kann: Ein
     * Beitrag mit drei Pfaden, von denen einer keinen Link bekommen hat, hat zwei
     * Bilder und drei erwartete. Nur dann ist „lässt sich gerade nicht laden"
     * die richtige Auskunft — und nicht bei einem Textbeitrag.
     */
    erwartet?: number;
    /** Ruft das Tagebuch, um sein `kaputt`-Set zu füllen. */
    onFehler?: () => void;
  };

  let { vorlage, bilder, erwartet, onFehler }: Props = $props();

  let v = $derived(vorlageVon(vorlage));
  /*
   * Mehr Bilder als die Vorlage zeigt werden **nicht** gerendert. Sonst bekäme
   * eine Collage bei fünf Pfaden fünf Felder, und das 2×2-Raster wäre keines
   * mehr. Die Maske sagt beim Anlegen, dass die übrigen nicht erscheinen.
   */
  let sichtbar = $derived(bilderZeigen(v, bilder));
  let fehlend = $derived((erwartet ?? bilder.length) > bilder.length);
</script>

{#if sichtbar.length}
  <!--
    **Die Vorlagenklasse steht nicht hier, sondern am `<article>` darüber.**
    `grid-column: 1 / -1` für das Panorama wirkt nur am Rasterelement, und das ist
    das `<article>` im `.strom`. Die Klasse an zwei Orten zu führen hätte
    geheißen, dass sie einmal vergessen wird. `data-vorlage` bleibt als Angabe
    für Prüfungen und für den Blick in die Entwicklerwerkzeuge.
  -->
  <div class="bilder" data-vorlage={v.id}>
    <!--
      Geschlüsselt nach **Position**, nicht nach URL: Zwei gleiche Bilder in einer
      Collage sind erlaubt (dasselbe Foto zweimal ausgewählt), und Svelte verlangt
      eindeutige Schlüssel. Die Liste wird nie umsortiert, nur ganz ersetzt — dann
      ist der Index der stabilste Schlüssel, den es hier gibt.
    -->
    {#each sichtbar as bild, i (i)}
      <img
        src={bild.url}
        alt={bild.alt}
        loading="lazy"
        decoding="async"
        onerror={() => onFehler?.()}
      />
    {/each}
  </div>
{:else if fehlend}
  <div class="kein" data-vorlage={v.id}>Bild lässt sich gerade nicht laden</div>
{/if}
