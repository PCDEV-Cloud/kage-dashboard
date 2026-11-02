import { domainOf } from "./model";
import type { HassEntityState, HomeAssistant } from "../types";

// Kontekst ekranu. „W domu” jest domyślny: brak danych o obecności nie przełącza ekranu.
export type Context = "home" | "away";

// Encja person zalogowanego użytkownika (atrybut user_id w stanie osoby).
export function userPerson(hass: HomeAssistant): HassEntityState | null {
  const uid = hass.user?.id;
  if (!uid) return null;
  return (
    Object.values(hass.states).find(
      (s) => domainOf(s.entity_id) === "person" && s.attributes.user_id === uid,
    ) ?? null
  );
}

// Podgląd z adresu strony: ?kage=away albo ?kage=home (tylko ta karta przeglądarki).
export function contextOverride(search: string): Context | null {
  const v = new URLSearchParams(search).get("kage");
  return v === "away" || v === "home" ? v : null;
}

export function contextFor(hass: HomeAssistant, override: Context | null = null): Context {
  if (override) return override;
  const person = userPerson(hass);
  if (!person || person.state === "unknown" || person.state === "unavailable") return "home";
  return person.state === "home" ? "home" : "away";
}

// Kto jest w domu: osoby w stanie „home”, bez kont technicznych (np. panel ścienny).
export function peopleHome(hass: HomeAssistant, technical: string[] = []): string[] {
  return Object.values(hass.states)
    .filter(
      (s) =>
        domainOf(s.entity_id) === "person" &&
        s.state === "home" &&
        !technical.includes(s.entity_id),
    )
    .map((s) =>
      typeof s.attributes.friendly_name === "string" ? s.attributes.friendly_name : s.entity_id,
    )
    .sort((a, b) => a.localeCompare(b));
}
