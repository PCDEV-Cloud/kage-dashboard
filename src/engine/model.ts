import type { AreaEntry, EntityEntry, FloorEntry, HomeAssistant } from "../types";

// Model domu, z którego powstają wszystkie widoki KAGE.
// Budowany przy każdym otwarciu dashboardu, więc nowe encje pojawiają się same.

export interface AreaModel {
  id: string;
  name: string;
  icon: string | null;
  entityIds: string[];
}

export interface FloorModel {
  id: string;
  name: string;
  level: number;
  icon: string | null;
  areas: AreaModel[];
}

// Piętra o tym samym poziomie leżą obok siebie (np. parter i ogród).
export interface LevelModel {
  level: number;
  floors: FloorModel[];
}

export interface HomeModel {
  levels: LevelModel[]; // od najwyższego do najniższego
  floors: FloorModel[];
  unassignedAreas: AreaModel[]; // obszary bez piętra
  unassignedEntityIds: string[]; // urządzenia bez obszaru (do uporządkowania)
  systemEntityIds: string[]; // encje systemowe: nie należą do pokoi
}

export const UNASSIGNED_FLOOR_ID = "__kage_unassigned__";

// Domeny, które nie są urządzeniami w pokoju. Nie trafiają do obszarów ani do listy
// „bez obszaru”; część z nich (sceny, osoby) wykorzystają kolejne etapy.
export const SYSTEM_DOMAINS = new Set([
  "automation",
  "script",
  "scene",
  "zone",
  "sun",
  "person",
  "device_tracker",
  "update",
  "tts",
  "stt",
  "conversation",
  "wake_word",
  "ai_task",
  "todo",
  "calendar",
  "weather",
  "notify",
  "event",
  "image",
  "backup",
  "input_boolean",
  "input_button",
  "input_datetime",
  "input_number",
  "input_select",
  "input_text",
  "counter",
  "timer",
  "schedule",
]);

export const domainOf = (entityId: string): string => entityId.split(".", 1)[0];

// Integracje, których encje nie opisują pokoi: telefony domowników (podróżują z nimi)
// i usługi samego HA.
export const SYSTEM_PLATFORMS = new Set(["mobile_app", "backup", "hassio", "sun", "met"]);

export function isSystemEntity(hass: HomeAssistant, entity: EntityEntry): boolean {
  if (SYSTEM_DOMAINS.has(domainOf(entity.entity_id))) return true;
  if (entity.platform && SYSTEM_PLATFORMS.has(entity.platform)) return true;
  const device = entity.device_id ? hass.devices[entity.device_id] : undefined;
  return device?.entry_type === "service";
}

// Encje, których domownik nie powinien widzieć: ukryte, diagnostyczne, konfiguracyjne.
export function isUserFacing(entity: EntityEntry): boolean {
  if (entity.hidden) return false;
  if (entity.entity_category) return false;
  return true;
}

export function entityAreaId(hass: HomeAssistant, entity: EntityEntry): string | null {
  if (entity.area_id) return entity.area_id;
  if (entity.device_id) {
    const device = hass.devices[entity.device_id];
    if (device?.area_id) return device.area_id;
  }
  return null;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export async function loadFloors(hass: HomeAssistant): Promise<FloorEntry[]> {
  if (hass.floors) return Object.values(hass.floors);
  try {
    return await hass.callWS<FloorEntry[]>({ type: "config/floor_registry/list" });
  } catch {
    return [];
  }
}

export function buildHomeModel(hass: HomeAssistant, floorEntries: FloorEntry[]): HomeModel {
  const areaEntities = new Map<string, string[]>();
  const unassignedEntityIds: string[] = [];
  const systemEntityIds: string[] = [];

  for (const entity of Object.values(hass.entities)) {
    if (!isUserFacing(entity)) continue;
    if (isSystemEntity(hass, entity)) {
      systemEntityIds.push(entity.entity_id);
      continue;
    }
    const areaId = entityAreaId(hass, entity);
    if (!areaId || !hass.areas[areaId]) {
      unassignedEntityIds.push(entity.entity_id);
      continue;
    }
    const list = areaEntities.get(areaId) ?? [];
    list.push(entity.entity_id);
    areaEntities.set(areaId, list);
  }

  const toAreaModel = (area: AreaEntry): AreaModel => ({
    id: area.area_id,
    name: area.name,
    icon: area.icon ?? null,
    entityIds: (areaEntities.get(area.area_id) ?? []).sort(),
  });

  const floorIds = new Set(floorEntries.map((f) => f.floor_id));
  const floors: FloorModel[] = floorEntries.map((floor) => ({
    id: floor.floor_id,
    name: floor.name,
    level: floor.level ?? 0,
    icon: floor.icon ?? null,
    areas: Object.values(hass.areas)
      .filter((a) => a.floor_id === floor.floor_id)
      .sort(byName)
      .map(toAreaModel),
  }));

  const unassignedAreas = Object.values(hass.areas)
    .filter((a) => !a.floor_id || !floorIds.has(a.floor_id))
    .sort(byName)
    .map(toAreaModel);

  const levelMap = new Map<number, FloorModel[]>();
  for (const floor of floors) {
    const list = levelMap.get(floor.level) ?? [];
    list.push(floor);
    levelMap.set(floor.level, list);
  }
  const levels: LevelModel[] = [...levelMap.entries()]
    .sort(([a], [b]) => b - a)
    .map(([level, list]) => ({ level, floors: list }));

  return {
    levels,
    floors,
    unassignedAreas,
    unassignedEntityIds: unassignedEntityIds.sort(),
    systemEntityIds: systemEntityIds.sort(),
  };
}
