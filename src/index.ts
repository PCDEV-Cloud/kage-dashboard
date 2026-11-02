import { stringsFor } from "./i18n";
import { generateDashboard, generateView } from "./strategy/generate";
import type { HomeAssistant, KageConfig } from "./types";

declare const __KAGE_VERSION__: string;
const VERSION = typeof __KAGE_VERSION__ === "string" ? __KAGE_VERSION__ : "dev";

// Strategia dashboardu: `strategy: { type: custom:kage }` w konfiguracji dashboardu.
class KageDashboardStrategy extends HTMLElement {
  static async generate(config: KageConfig, hass: HomeAssistant) {
    return generateDashboard(config, hass);
  }

  static getCreateSuggestions(hass: HomeAssistant) {
    return { title: stringsFor(hass).strategyName, icon: "mdi:home-lightning-bolt" };
  }
}

// Strategia widoku: zawartość widoku powstaje dopiero przy jego otwarciu.
class KageViewStrategy extends HTMLElement {
  static async generate(config: KageConfig, hass: HomeAssistant) {
    return generateView(config, hass);
  }
}

interface CustomStrategyInfo {
  type: string;
  strategyType: "dashboard" | "view";
  name: string;
  description?: string;
  documentationURL?: string;
}

declare global {
  interface Window {
    customStrategies?: CustomStrategyInfo[];
  }
}

if (!customElements.get("ll-strategy-dashboard-kage")) {
  customElements.define("ll-strategy-dashboard-kage", KageDashboardStrategy);
}
if (!customElements.get("ll-strategy-view-kage")) {
  customElements.define("ll-strategy-view-kage", KageViewStrategy);
}

// Rejestracja w oknie „Nowy dashboard” → Community dashboards (HA 2026.5+).
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((s) => s.type === "kage" && s.strategyType === "dashboard")) {
  window.customStrategies.push({
    type: "kage",
    strategyType: "dashboard",
    name: "KAGE",
    description: "Kontekstowy dashboard generowany z pięter, obszarów i urządzeń.",
    documentationURL: "https://github.com/",
  });
}

console.info(
  `%c KAGE 影 %c ${VERSION} `,
  "background:#00e5ff;color:#04121a;font-weight:700",
  "background:#05060a;color:#e8f6ff",
);
