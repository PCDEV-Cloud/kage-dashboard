import { isHotWater } from "./hotwater";
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
  // Osłony okien: osobny kafel na każdy rodzaj (żaluzje, rolety, rolety zewnętrzne, zasłony…).
  covers: CoverControl[];
  climates: string[];
  media: string[];
  // Gniazdka i przełączniki (switch), np. gniazdko z „Show as → Outlet”.
  switches: GroupControl | null;
  cameras: string[];
}

// Rodzaj osłony = klasa urządzenia w HA („Show as”). Ekran projektora HA nie ma,
// więc rozpoznajemy go osobno; „other” to osłony bez ustawionej klasy.
export type CoverKind =
  | "shade"
  | "blind"
  | "shutter"
  | "curtain"
  | "awning"
  | "window"
  | "other"
  | "screen";

const COVER_ORDER: CoverKind[] = [
  "shade",
  "blind",
  "shutter",
  "curtain",
  "awning",
  "window",
  "other",
  "screen",
];

export interface CoverControl extends GroupControl {
  kind: CoverKind;
}

// Brama, drzwi garażowe, drzwi i przepustnice nie są osłonami okien: brama i garaż trafią
// do przeglądu (z przytrzymaniem), nie do panelu pokoju.
const NON_ROOM_COVER_CLASSES = new Set(["garage", "gate", "door", "damper"]);

// HA nie ma klasy dla ekranu projektora. Rozpoznajemy go po etykiecie albo po nazwie.
// Samo „screen” tylko jako cała nazwa: „screen” bywa też nazwą zewnętrznej rolety ZIP.
const SCREEN_LABELS = new Set(["ekran", "screen", "projector", "projektor"]);
const SCREEN_NAME =
  /projector|projektor|projection|projekcyjn|beamer|leinwand|投影|幕布|^\s*(ekran|screen)\s*$/i;

export function isProjectorScreen(hass: HomeAssistant, id: string): boolean {
  const entry = hass.entities[id];
  if (entry?.labels?.some((l) => SCREEN_LABELS.has(l.toLowerCase()))) return true;
  const name = entry?.name ?? hass.states[id]?.attributes.friendly_name;
  return typeof name === "string" && SCREEN_NAME.test(name);
}

export function coverKindOf(hass: HomeAssistant, id: string): CoverKind {
  if (isProjectorScreen(hass, id)) return "screen";
  const cls = hass.states[id]?.attributes.device_class;
  return typeof cls === "string" && (COVER_ORDER as string[]).includes(cls)
    ? (cls as CoverKind)
    : "other";
}

export function stateOf(hass: HomeAssistant, id: string): HassEntityState | undefined {
  return hass.states[id];
}

// Grupa „wszystkie”. Rozpoznajemy trzy przypadki:
// 1. grupa z HA (pomocnik Group) – ma atrybut entity_id z listą członków;
// 2. przełącznik-grupa pokazany jako światło („Show as → Light”, platforma switch_as_x):
//    nowa encja nie ma listy członków, ma ją ukryty przełącznik o tym samym object_id;
// 3. grupa urządzeń (np. grupa Zigbee) oznaczona etykietą `grupa`/`group` – członków nie znamy.
const GROUP_LABELS = new Set(["grupa", "group", "wszystkie", "all"]);

const objectId = (id: string) => id.slice(id.indexOf(".") + 1);

const listAttr = (s: HassEntityState | undefined): string[] | null => {
  const v = s?.attributes.entity_id;
  return Array.isArray(v) ? v.filter((m): m is string => typeof m === "string") : null;
};

// Członkowie grupy (pusta lista = grupa z etykiety) albo null, gdy to nie grupa.
export function groupMembers(hass: HomeAssistant, id: string): string[] | null {
  const direct = listAttr(hass.states[id]);
  if (direct) return direct;
  const entry = hass.entities[id];
  if (entry?.platform === "switch_as_x") {
    const source = listAttr(hass.states[`switch.${objectId(id)}`]);
    if (source) {
      // Członkowie to przełączniki; jeśli też są pokazane jako światła, bierzemy światła.
      const domain = id.slice(0, id.indexOf("."));
      return source.map((m) => {
        const as = `${domain}.${objectId(m)}`;
        return m.startsWith("switch.") && hass.states[as] ? as : m;
      });
    }
  }
  if (entry?.labels?.some((l) => GROUP_LABELS.has(l.toLowerCase()))) return [];
  return null;
}

const isGroupId = (hass: HomeAssistant, id: string) => groupMembers(hass, id) !== null;

const available = (hass: HomeAssistant, id: string) => {
  const s = hass.states[id];
  return !!s && s.state !== "unavailable";
};

function grouped(hass: HomeAssistant, ids: string[]): GroupControl | null {
  if (ids.length === 0) return null;
  const groups = ids.filter((id) => isGroupId(hass, id));
  const members = ids.filter((id) => !groups.includes(id));
  // Kilka grup w pokoju: wygrywa oznaczona etykietą, potem ta z największą liczbą członków.
  const score = (g: string) => {
    const m = groupMembers(hass, g)!;
    return m.length === 0 ? Number.MAX_SAFE_INTEGER : m.length;
  };
  const all = groups.reduce<string | null>(
    (best, g) => (best === null || score(g) > score(best) ? g : best),
    null,
  );
  return { all, members: members.length ? members : all ? [all] : [] };
}

export function roomControls(hass: HomeAssistant, area: AreaModel): RoomControls {
  const lights = grouped(
    hass,
    area.entityIds.filter((id) => domainOf(id) === "light" && available(hass, id)),
  );
  const covers = coverControls(
    hass,
    area.entityIds.filter((id) => {
      if (domainOf(id) !== "cover" || !available(hass, id)) return false;
      const cls = hass.states[id]?.attributes.device_class;
      return !(typeof cls === "string" && NON_ROOM_COVER_CLASSES.has(cls));
    }),
  );
  const climates = area.entityIds.filter(
    (id) => domainOf(id) === "climate" && available(hass, id) && !isHotWater(hass, id),
  );
  const media = area.entityIds.filter(
    (id) => domainOf(id) === "media_player" && available(hass, id),
  );
  const switches = grouped(
    hass,
    area.entityIds.filter((id) => domainOf(id) === "switch" && available(hass, id)),
  );
  const cameras = area.entityIds.filter((id) => domainOf(id) === "camera" && available(hass, id));
  return { lights, covers, climates, media, switches, cameras };
}

// Pojedyncze osłony dzielimy według rodzaju. Grupa z HA trafia do rodzaju, do którego
// należą wszystkie jej osłony; grupa mieszana (np. rolety + ekran) zostaje pominięta,
// żeby „wszystkie” nie ruszały osłon innego rodzaju.
function coverControls(hass: HomeAssistant, ids: string[]): CoverControl[] {
  const groups = ids.filter((id) => isGroupId(hass, id));
  const singles = ids.filter((id) => !groups.includes(id));
  const byKind = new Map<CoverKind, CoverControl>();
  for (const id of singles) {
    const kind = coverKindOf(hass, id);
    const c = byKind.get(kind) ?? { kind, all: null, members: [] };
    c.members.push(id);
    byKind.set(kind, c);
  }
  for (const g of groups) {
    const inside = groupMembers(hass, g) ?? [];
    const kinds = new Set(inside.filter((m) => hass.states[m]).map((m) => coverKindOf(hass, m)));
    const kind: CoverKind | null =
      kinds.size === 1 ? [...kinds][0]! : kinds.size === 0 ? coverKindOf(hass, g) : null;
    if (!kind) continue;
    const c = byKind.get(kind);
    if (!c) byKind.set(kind, { kind, all: g, members: [g] });
    else if (!c.all) c.all = g;
  }
  return COVER_ORDER.flatMap((k) => byKind.get(k) ?? []);
}

// Gniazdka: wszystkie przełączniki z klasą „outlet” → podpis „Gniazdka”, inaczej „Przełączniki”.
export function allOutlets(hass: HomeAssistant, ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => hass.states[id]?.attributes.device_class === "outlet");
}

// Nazwa urządzenia na kaflu: nazwa encji nadana w HA; inaczej friendly_name bez nazwy
// urządzenia na początku (np. „wc_socket Socket” → „Socket”) i bez nazwy pokoju
// („WC Mirror” → „Mirror”); gdy nic nie zostaje – entity id.
export function displayName(hass: HomeAssistant, id: string, areaName: string): string {
  const entry = hass.entities[id];
  const strip = (text: string, prefix: string | null | undefined): string => {
    if (!prefix) return text;
    const rest = text.toLowerCase().startsWith(prefix.toLowerCase() + " ")
      ? text.slice(prefix.length + 1).trim()
      : text;
    return rest || text;
  };
  let name = entry?.name?.trim();
  if (!name) {
    const raw = hass.states[id]?.attributes.friendly_name;
    if (typeof raw !== "string" || !raw.trim()) return id;
    const device = entry?.device_id ? hass.devices[entry.device_id] : undefined;
    name = strip(raw.trim(), device?.name_by_user ?? device?.name);
  }
  return strip(name, areaName);
}

export function hasControls(c: RoomControls): boolean {
  return (
    !!c.lights ||
    c.covers.length > 0 ||
    c.climates.length > 0 ||
    c.media.length > 0 ||
    !!c.switches ||
    c.cameras.length > 0
  );
}

export function controlCount(c: RoomControls): number {
  return (
    (c.lights?.members.length ?? 0) +
    c.covers.reduce((n, g) => n + g.members.length, 0) +
    c.climates.length +
    c.media.length +
    (c.switches?.members.length ?? 0) +
    c.cameras.length
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

// Czy osłonę można ustawić w dowolnej pozycji (CoverEntityFeature.SET_POSITION = 4).
export const COVER_SET_POSITION = 4;

export function canSetPosition(hass: HomeAssistant, id: string): boolean {
  const f = hass.states[id]?.attributes.supported_features;
  return typeof f === "number" && (f & COVER_SET_POSITION) !== 0;
}

// Czy osłonę można zatrzymać w ruchu (CoverEntityFeature.STOP = 8).
export const COVER_STOP = 8;

export function canStop(hass: HomeAssistant, id: string): boolean {
  const f = hass.states[id]?.attributes.supported_features;
  return typeof f === "number" && (f & COVER_STOP) !== 0;
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
// Temperatura powietrza w pokoju: najpierw czujnik temperatury, potem termostat.
// Wartości spoza zakresu powietrza (np. ciepła woda użytkowa 47°) pomijamy.
const AIR_MIN = -10;
const AIR_MAX = 35;
const isAir = (v: number | null): v is number => v !== null && v >= AIR_MIN && v <= AIR_MAX;

export function roomClimate(
  hass: HomeAssistant,
  area: AreaModel,
): { temperature: number | null; humidity: number | null } {
  let sensorTemp: number | null = null;
  let climateTemp: number | null = null;
  let humidity: number | null = null;
  for (const id of area.entityIds) {
    const s = hass.states[id];
    if (!s) continue;
    const d = domainOf(id);
    if (d === "climate" && !isHotWater(hass, id)) {
      const t = numberAttr(s, "current_temperature");
      if (climateTemp === null && isAir(t)) climateTemp = t;
      if (humidity === null) humidity = numberAttr(s, "current_humidity");
    }
    if (d === "sensor") {
      const cls = s.attributes.device_class;
      const v = Number(s.state);
      if (!Number.isFinite(v)) continue;
      if (cls === "temperature" && sensorTemp === null && isAir(v)) sensorTemp = v;
      if (cls === "humidity" && humidity === null) humidity = v;
    }
  }
  return { temperature: sensorTemp ?? climateTemp, humidity };
}

// Odtwarzacz do pokazania: grający, a jeśli żaden nie gra, pierwszy.
// Odtwarzacz do pokazania: grający, potem wstrzymany, potem włączony, na końcu pierwszy.
export function activeMedia(hass: HomeAssistant, ids: string[]): string | null {
  const rank = (id: string) => {
    const st = hass.states[id]?.state;
    return st === "playing" ? 0 : st === "paused" ? 1 : st && !MEDIA_OFF.has(st) ? 2 : 3;
  };
  return ids.slice().sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

const MEDIA_OFF = new Set(["off", "standby", "unavailable", "unknown"]);

const features = (hass: HomeAssistant, id: string) => {
  const f = hass.states[id]?.attributes.supported_features;
  return typeof f === "number" ? f : 0;
};

// MediaPlayerEntityFeature: PAUSE 1, VOLUME_SET 4, TURN_ON 128, TURN_OFF 256,
// VOLUME_STEP 1024, PLAY 16384.
export interface MediaCaps {
  off: boolean;
  canPower: boolean;
  canVolume: boolean;
  canPlayPause: boolean; // jest co wznowić albo wstrzymać
}

export function mediaCaps(hass: HomeAssistant, id: string): MediaCaps {
  const f = features(hass, id);
  const st = hass.states[id]?.state ?? "off";
  const off = MEDIA_OFF.has(st);
  return {
    off,
    canPower: (f & (128 | 256)) !== 0,
    canVolume: !off && (f & (4 | 1024)) !== 0,
    canPlayPause: (st === "playing" || st === "paused") && (f & (1 | 16384)) !== 0,
  };
}

// Włączanie i wyłączanie termostatu. Gdy brak turn_on/turn_off (ClimateEntityFeature
// TURN_ON 128, TURN_OFF 256), przełączamy tryb: off ↔ pierwszy tryb grzania z listy.
export function climateIsOff(hass: HomeAssistant, id: string): boolean {
  return hass.states[id]?.state === "off";
}

export function climatePower(
  hass: HomeAssistant,
  id: string,
  on: boolean,
): { service: string; data: Record<string, unknown> } | null {
  const f = features(hass, id);
  const modes = hass.states[id]?.attributes.hvac_modes;
  const list = Array.isArray(modes) ? (modes as string[]) : [];
  if (!on) {
    if (f & 256) return { service: "turn_off", data: { entity_id: id } };
    if (list.includes("off"))
      return { service: "set_hvac_mode", data: { entity_id: id, hvac_mode: "off" } };
    return null;
  }
  if (f & 128) return { service: "turn_on", data: { entity_id: id } };
  const mode = ["heat", "auto", "heat_cool", "cool"].find((m) => list.includes(m));
  return mode ? { service: "set_hvac_mode", data: { entity_id: id, hvac_mode: mode } } : null;
}
