<script lang="ts" module>
  /**
   * Die Aufkleber des Freundebuchs — selbst gezeichnete Inline-SVG.
   *
   * Warum nicht Emoji oder fertige Grafiken: Emoji sehen auf jedem Gerät
   * anders aus (und auf manchen Android-Versionen schlicht hässlich), fertige
   * Grafiken hätten eine Lizenz und müssten nachgeladen werden. Inline-SVG
   * kostet nichts, sieht überall gleich aus und funktioniert offline.
   *
   * Die Formen sind bewusst grob und flächig — das ist die Bildsprache der
   * japanischen Privathomepages um 2001, nicht die eines Icon-Sets von heute.
   */
  export type StickerName =
    | 'sushi'
    | 'maki'
    | 'onigiri'
    | 'ramen'
    | 'torii'
    | 'katze'
    | 'fuji'
    | 'sakura'
    | 'stern'
    | 'herz';

  export const STICKER: { name: StickerName; label: string }[] = [
    { name: 'sushi', label: 'Nigiri' },
    { name: 'maki', label: 'Maki' },
    { name: 'onigiri', label: 'Onigiri' },
    { name: 'ramen', label: 'Ramen' },
    { name: 'torii', label: 'Torii' },
    { name: 'katze', label: 'Winkekatze' },
    { name: 'fuji', label: 'Fuji' },
    { name: 'sakura', label: 'Kirschblüte' },
    { name: 'stern', label: 'Stern' },
    { name: 'herz', label: 'Herz' },
  ];
</script>

<script lang="ts">
  type Props = { name: StickerName; size?: number; title?: string };
  let { name, size = 34, title }: Props = $props();
</script>

<svg
  class="sticker"
  width={size}
  height={size}
  viewBox="0 0 48 48"
  role={title ? 'img' : 'presentation'}
  aria-label={title}
  aria-hidden={title ? undefined : 'true'}
>
  {#if name === 'sushi'}
    <!-- Nigiri: Reisballen mit Lachs und Nori-Band -->
    <ellipse cx="24" cy="31" rx="17" ry="9" fill="#FFF8EC" stroke="#2A2118" stroke-width="2" />
    <path d="M8 27c3-7 29-7 32 0-3 5-29 5-32 0z" fill="#FF8A5B" stroke="#2A2118" stroke-width="2" />
    <path d="M13 26c4-2 9-3 13-2" stroke="#FFD2BC" stroke-width="2" stroke-linecap="round" fill="none" />
    <rect x="20" y="22" width="8" height="18" rx="1" fill="#2E4632" stroke="#2A2118" stroke-width="2" />
  {:else if name === 'maki'}
    <!-- Maki von oben: Nori-Ring, Reis, Füllung -->
    <circle cx="24" cy="24" r="17" fill="#2E4632" stroke="#2A2118" stroke-width="2" />
    <circle cx="24" cy="24" r="12.5" fill="#FFF8EC" stroke="#2A2118" stroke-width="1.5" />
    <circle cx="24" cy="24" r="5.5" fill="#FF8A5B" stroke="#2A2118" stroke-width="1.5" />
    <circle cx="19" cy="19" r="2" fill="#7FB069" />
    <circle cx="29" cy="28" r="2" fill="#7FB069" />
  {:else if name === 'onigiri'}
    <!-- Dreieck mit Nori-Streifen und Gesicht -->
    <path d="M24 7 42 38H6z" fill="#FFF8EC" stroke="#2A2118" stroke-width="2" stroke-linejoin="round" />
    <path d="M17 38h14v-9H17z" fill="#2E4632" stroke="#2A2118" stroke-width="2" />
    <circle cx="19" cy="24" r="1.7" fill="#2A2118" />
    <circle cx="29" cy="24" r="1.7" fill="#2A2118" />
    <path d="M21 28c2 2 4 2 6 0" stroke="#2A2118" stroke-width="1.8" fill="none" stroke-linecap="round" />
  {:else if name === 'ramen'}
    <!-- Schale mit Dampf, Ei und Nori -->
    <path d="M6 22h36c0 11-8 18-18 18S6 33 6 22z" fill="#C6402B" stroke="#2A2118" stroke-width="2" />
    <path d="M6 22h36" stroke="#2A2118" stroke-width="2" />
    <path d="M10 26c6 3 22 3 28 0" stroke="#FFD9A0" stroke-width="2.5" fill="none" />
    <circle cx="18" cy="31" r="4" fill="#FFF8EC" stroke="#2A2118" stroke-width="1.5" />
    <circle cx="18" cy="31" r="1.8" fill="#FFB020" />
    <rect x="26" y="27" width="7" height="7" fill="#2E4632" stroke="#2A2118" stroke-width="1.5" />
    <path d="M16 16c0-3 3-3 3-6M24 14c0-3 3-3 3-6M32 16c0-3 3-3 3-6"
      stroke="#9AA7B0" stroke-width="2" fill="none" stroke-linecap="round" />
  {:else if name === 'torii'}
    <path d="M5 13h38M8 19h32" stroke="#C6402B" stroke-width="4" stroke-linecap="round" />
    <path d="M14 19v22M34 19v22" stroke="#C6402B" stroke-width="4.5" stroke-linecap="round" />
    <path d="M14 27h20" stroke="#C6402B" stroke-width="3" />
  {:else if name === 'katze'}
    <!-- Winkekatze: Kopf, Ohren, erhobene Pfote -->
    <path d="M13 15 10 6l8 4z" fill="#FFF8EC" stroke="#2A2118" stroke-width="2" stroke-linejoin="round" />
    <path d="M35 15 38 6l-8 4z" fill="#FFF8EC" stroke="#2A2118" stroke-width="2" stroke-linejoin="round" />
    <ellipse cx="24" cy="23" rx="14" ry="12" fill="#FFF8EC" stroke="#2A2118" stroke-width="2" />
    <circle cx="19" cy="21" r="1.8" fill="#2A2118" />
    <circle cx="29" cy="21" r="1.8" fill="#2A2118" />
    <path d="M22 26h4l-2 2z" fill="#FF8A5B" />
    <path d="M8 22H2M8 25H2M40 22h6M40 25h6" stroke="#2A2118" stroke-width="1.5" stroke-linecap="round" />
    <path d="M32 33c0-4 3-6 6-4s2 7-2 7" fill="#FFF8EC" stroke="#2A2118" stroke-width="2" />
    <circle cx="24" cy="36" r="4" fill="#C6402B" stroke="#2A2118" stroke-width="1.5" />
  {:else if name === 'fuji'}
    <path d="M4 38 24 10l20 28z" fill="#4A6FA5" stroke="#2A2118" stroke-width="2" stroke-linejoin="round" />
    <path d="M15 24c3 2 5-1 8 1s5-2 9 0l-8-11z" fill="#FFF8EC" stroke="#2A2118" stroke-width="1.5" />
    <circle cx="38" cy="12" r="5" fill="#FFB020" stroke="#2A2118" stroke-width="1.5" />
  {:else if name === 'sakura'}
    <g stroke="#2A2118" stroke-width="1.6">
      <ellipse cx="24" cy="12" rx="6" ry="8" fill="#FFB7CE" />
      <ellipse cx="35" cy="20" rx="6" ry="8" fill="#FFB7CE" transform="rotate(72 35 20)" />
      <ellipse cx="31" cy="34" rx="6" ry="8" fill="#FFB7CE" transform="rotate(144 31 34)" />
      <ellipse cx="17" cy="34" rx="6" ry="8" fill="#FFB7CE" transform="rotate(216 17 34)" />
      <ellipse cx="13" cy="20" rx="6" ry="8" fill="#FFB7CE" transform="rotate(288 13 20)" />
    </g>
    <circle cx="24" cy="24" r="4" fill="#FFD84D" stroke="#2A2118" stroke-width="1.6" />
  {:else if name === 'stern'}
    <path
      d="M24 4l6 13 14 2-10 10 2 14-12-7-12 7 2-14L4 19l14-2z"
      fill="#FFD84D"
      stroke="#2A2118"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <path d="M20 16l3 5" stroke="#FFF8EC" stroke-width="2" stroke-linecap="round" />
  {:else if name === 'herz'}
    <path
      d="M24 41S5 29 5 18a9 9 0 0 1 19-4 9 9 0 0 1 19 4c0 11-19 23-19 23z"
      fill="#FF5C8A"
      stroke="#2A2118"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <path d="M14 17c0-3 2-5 4-5" stroke="#FFD1DE" stroke-width="2.5" stroke-linecap="round" />
  {/if}
</svg>

<style>
  .sticker {
    display: block;
    /* Der weiße Rand macht aus der Zeichnung einen aufgeklebten Sticker. */
    filter: drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff)
      drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.3));
  }
</style>
