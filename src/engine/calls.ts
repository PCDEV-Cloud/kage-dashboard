import type { HomeAssistant } from "../types";

// Odstęp między rozkazami do kilku urządzeń. Sieci Zigbee gubią pojedyncze rozkazy, gdy
// dostają kilka naraz; jeden rozkaz do grupy dochodzi zawsze, więc grupę wołamy wprost.
export const STAGGER_MS = 150;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wywołuje usługę HA. Lista encji idzie po kolei, encja po encji, z odstępem `gapMs`.
export async function callService(
  hass: HomeAssistant,
  domain: string,
  service: string,
  data: Record<string, unknown>,
  gapMs = STAGGER_MS,
): Promise<void> {
  if (!hass.callService) return;
  const target = data.entity_id;
  if (!Array.isArray(target) || target.length < 2) {
    await hass.callService(domain, service, data);
    return;
  }
  for (const [i, id] of target.entries()) {
    if (i > 0) await wait(gapMs);
    try {
      await hass.callService(domain, service, { ...data, entity_id: id });
    } catch {
      // Jedno niedostępne urządzenie nie zatrzymuje pozostałych.
    }
  }
}
