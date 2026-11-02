import type { HomeAssistant } from "../types";
import type { PlanConfig } from "./plan";

// Zapis rzutu w konfiguracji dashboardu przez publiczne API WebSocket Lovelace.
// Adres dashboardu bierzemy z bieżącej ścieżki: /<url_path>/<widok>; „lovelace” = domyślny.
export function dashboardPath(pathname: string): string | null {
  const first = pathname.split("/").filter(Boolean)[0] ?? "lovelace";
  return first === "lovelace" ? null : first;
}

interface RawConfig {
  strategy?: { type: string; [key: string]: unknown };
  [key: string]: unknown;
}

export async function savePlan(
  hass: HomeAssistant,
  urlPath: string | null,
  plan: PlanConfig,
): Promise<void> {
  const raw = await hass.callWS<RawConfig>({ type: "lovelace/config", url_path: urlPath });
  if (!raw?.strategy) throw new Error("not a strategy dashboard");
  const config: RawConfig = { ...raw, strategy: { ...raw.strategy, plan } };
  await hass.callWS({ type: "lovelace/config/save", url_path: urlPath, config });
}
