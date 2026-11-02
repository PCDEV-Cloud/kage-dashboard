import { css } from "lit";

// Tokeny motywu Neon z design systemu KAGE (telefon, tablet, laptop).
export const neonTokens = css`
  :host {
    --kage-ground: #05060a;
    --kage-surface: rgba(14, 18, 30, 0.62);
    --kage-surface-solid: #0e121e;
    --kage-ink: #e8f6ff;
    --kage-ink-muted: #9fb0c6;
    --kage-ink-dim: #8a97ab;
    --kage-line: rgba(0, 229, 255, 0.22);
    --kage-accent: #00e5ff;
    --kage-on-accent: #04121a;
    --kage-light: #ffb300;
    --kage-on-light: #140c00;
    --kage-scene: #ff2bd6;
    --kage-on-scene: #0a0410;
    --kage-climate: #3dffa2;
    --kage-outdoor: #3dffa2;
    --kage-ok: #3dffa2;
    --kage-warn: #ffb300;
    --kage-crit: #ff3b5c;
    --kage-font-ui: "Chakra Petch", system-ui, sans-serif;
    --kage-font-mono: "JetBrains Mono", ui-monospace, monospace;
    --kage-cut-s: 7px;
    --kage-cut-m: 12px;
  }
`;

export const baseStyles = css`
  * {
    box-sizing: border-box;
  }
  button {
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--kage-accent);
    outline-offset: 3px;
  }
  .cut-s {
    clip-path: polygon(
      var(--kage-cut-s) 0,
      100% 0,
      100% calc(100% - var(--kage-cut-s)),
      calc(100% - var(--kage-cut-s)) 100%,
      0 100%,
      0 var(--kage-cut-s)
    );
  }
  .cut-m {
    clip-path: polygon(
      var(--kage-cut-m) 0,
      100% 0,
      100% calc(100% - var(--kage-cut-m)),
      calc(100% - var(--kage-cut-m)) 100%,
      0 100%,
      0 var(--kage-cut-m)
    );
  }
  .glass {
    background: var(--kage-surface);
    border: 1px solid var(--kage-line);
    backdrop-filter: blur(18px) saturate(150%);
    -webkit-backdrop-filter: blur(18px) saturate(150%);
  }
  .mono {
    font-family: var(--kage-font-mono);
  }
  .ctl {
    transition:
      background-color 0.3s ease,
      color 0.3s ease,
      box-shadow 0.3s ease,
      border-color 0.3s ease,
      transform 0.15s ease;
  }
  .ctl:active {
    transform: scale(0.95);
  }
  @keyframes kage-rise {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes kage-here {
    0% {
      box-shadow: 0 0 0 0 rgba(0, 229, 255, 0.8);
    }
    100% {
      box-shadow: 0 0 0 9px rgba(0, 229, 255, 0);
    }
  }
  @keyframes kage-nudge {
    0%,
    100% {
      transform: translateX(0);
    }
    50% {
      transform: translateX(3px);
    }
  }
  @keyframes kage-eq {
    0%,
    100% {
      transform: scaleY(0.3);
    }
    50% {
      transform: scaleY(1);
    }
  }
  @keyframes kage-scan {
    0% {
      transform: translateY(-120px);
    }
    100% {
      transform: translateY(1200px);
    }
  }
  .rise {
    animation: kage-rise 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none !important;
      transition: none !important;
    }
  }
`;

// Fonty z Google Fonts, ładowane raz na dokument.
export function ensureFonts(): void {
  const id = "kage-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";
  document.head.appendChild(link);
}
