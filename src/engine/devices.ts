import { domainOf, type AreaModel } from "./model";
import type { HassEntityState, HomeAssistant } from "../types";

// Co da się sterować w pokoju. Kafel na rodzaj, nie na urządzenie: kilka rolet = jeden kafel
// z akcją dla wszystkich i listą pojedynczych.

// Grupa „wszystkie” (np. wszystkie światła albo rolety w pokoju) i pojedyncze urządzenia.
// Akcja kafla trafia do grupy, jeśli jest; lista pokazuje pojedyncze urządzenia.
export interface GroupControl {
  all: string | null;
  members: string[];
}

export type LightControl = GroupControl;

export interface RoomControls {
  lights: LightControl | null;
  covers: GroupControl | null;
  climates: string[];
  media: string[];
}

// Rolety, zasłony, ekrany. Brama i drzwi garażowe to akcje fizyczne: trafią do przeglądu
// (z przytrzymaniem), nie do panelu pokoju.
const PHYSICAL_COVER_CLASSES = new Set(["garage", "gate", "door"]);

export function stateOf(hass: HomeAssistant, id: string): HassEntityState | undefined {
  return hass.states[id];
}

const isGroup = (s: HassEntityState | undefined) => Array.isArray(s?.attributes.entity_id);

const available = (hass: HomeAssistant, id: string) => {
  const s = hass.states[id];
  return !!s && s.state !== "unavailable";
};

function grouped(hass: HomeAssistant, ids: string[]): GroupControl | null {
  if (ids.length === 0) return null;
  const groups = ids.filter((id) => isGroup(hass.states[id]));
  const members = ids.filter((id) => !isGroup(hass.states[id]));
  return { all: groups[0] ?? null, members: members.length ? members : groups.slice(0, 1) };
}

export function roomControls(hass: HomeAssistant, area: AreaModel): RoomControls {
  const lights = grouped(
    hass,
    area.entityIds.filter((id) => domainOf(id) === "light" && available(hass, id)),
  );
  const covers = grouped(
    hass,
    area.entityIds.filter((id) => {
      if (domainOf(id) !== "cover" || !available(hass, id)) return false;
      const cls = hass.states[id]?.attributes.device_class;
      return !(typeof cls === "string" && PHYSICAL_COVER_CLASSES.has(cls));
    }),
  );
  const climates = area.entityIds.filter((id) => domainOf(id) === "climate" && available(hass, id));
  const media = area.entityIds.filter(
    (id) => domainOf(id) === "media_player" && available(hass, id),
  );
  return { lights, covers, climates, media };
}

export function hasControls(c: RoomControls): boolean {
  return !!c.lights || !!c.covers || c.climates.length > 0 || c.media.length > 0;
}

export function controlCount(c: RoomControls): number {
  return (
    (c.lights?.members.length ?? 0) +
    (c.covers?.members.length ?? 0) +
    c.climates.length +
    c.media.length
  );
}

export const isOn = (hass: HomeAssistant, id: string) => hass.states[id]?.state === "on";

// Jasność 0–100 dla światła; światło bez ściemniania: 100 gdy włączone.
export function brightnessPct(hass: HomeAssistant, id: string): number {
  const s = hass.states[id];
  if (!s || s.state !== "on") return 0;
  const b = s.attributes.brightness;
  return typeof b === "number" ? Math.max(1, Math.round((b / 255) * 100)) : 100;
}

export function isDimmable(hass: HomeAssistant, id: string): boolean {
  const modes = hass.states[id]?.attributes.supported_color_modes;
  return Array.isArray(modes) && modes.some((m) => m !== "onoff");
}

// Pozycja rolety 0–100 (100 = otwarta).
export function coverPosition(hass: HomeAssistant, id: string): number {
  const s = hass.states[id];
  if (!s) return 0;
  const p = s.attributes.current_position;
  if (typeof p === "number") return p;
  return s.state === "open" || s.state === "opening" ? 100 : 0;
}

// Najjaśniejsze włączone światło w pokoju: 0 = ciemno. Służy do poświaty na rzucie.
export function roomGlow(hass: HomeAssistant, area: AreaModel): number {
  let max = 0;
  for (const id of area.entityIds) {
    if (domainOf(id) !== "light") continue;
    max = Math.max(max, brightnessPct(hass, id));
  }
  return max;
}

const numberAttr = (s: HassEntityState | undefined, key: string): number | null => {
  const v = s?.attributes[key];
  return typeof v === "number" ? v : null;
};

// Temperatura i wilgotność pokoju: z termostatu albo z czujników w obszarze.
export function roomClimate(
  hass: HomeAssistant,
  area: AreaModel,
): { temperature: number | null; humidity: number | null } {
  let temperature: number | null = null;
  let humidity: number | null = null;
  for (const id of area.entityIds) {
    const s = hass.states[id];
    if (!s) continue;
    const d = domainOf(id);
    if (d === "climate" && temperature === null) {
      temperature = numberAttr(s, "current_temperature");
      if (humidity === null) humidity = numberAttr(s, "current_humidity");
    }
    if (d === "sensor") {
      const cls = s.attributes.device_class;
      const v = Number(s.state);
      if (!Number.isFinite(v)) continue;
      if (cls === "temperature" && temperature === null) temperature = v;
      if (cls === "humidity" && humidity === null) humidity = v;
    }
  }
  return { temperature, humidity };
}

// Odtwarzacz do pokazania: grający, a jeśli żaden nie gra, pierwszy.
export function activeMedia(hass: HomeAssistant, ids: string[]): string | null {
  return ids.find((id) => hass.states[id]?.state === "playing") ?? ids[0] ?? null;
}
