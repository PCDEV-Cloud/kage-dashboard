import { domainOf } from "./model";
import type { HomeAssistant } from "../types";

// Ciepła woda użytkowa (zasobnik pompy ciepła, bojler). Domownik jej nie steruje:
// pokazujemy tylko problem, gdy wody jest mało albo zasobnik nie działa.

export const HOT_WATER_LOW = 40; // °C w zasobniku, poniżej – za mało ciepłej wody

const LABELS = new Set(["cwu", "dhw", "hot_water", "ciepla_woda"]);
const NAME = /\bdhw\b|hot\s*water|\bcwu\b|ciepł\w*\s+wod|domestic|热水/i;

export function isHotWater(hass: HomeAssistant, id: string): boolean {
  const d = domainOf(id);
  if (d === "water_heater") return true;
  if (d !== "climate") return false;
  const entry = hass.entities[id];
  if (entry?.labels?.some((l) => LABELS.has(l.toLowerCase()))) return true;
  const name = entry?.name ?? hass.states[id]?.attributes.friendly_name;
  return typeof name === "string" && NAME.test(name);
}

// null = w porządku; „low” = zimny zasobnik; „off” = zasobnik wyłączony.
export function hotWaterStatus(hass: HomeAssistant, id: string): "low" | "off" | null {
  const s = hass.states[id];
  if (!s || s.state === "unavailable" || s.state === "unknown") return null;
  if (s.state === "off") return "off";
  const t = s.attributes.current_temperature;
  return typeof t === "number" && t < HOT_WATER_LOW ? "low" : null;
}
