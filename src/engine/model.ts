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
  unassignedEntityIds: string[]; // encje bez obszaru
}

export const UNASSIGNED_FLOOR_ID = "__kage_unassigned__";

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

  for (const entity of Object.values(hass.entities)) {
    if (!isUserFacing(entity)) continue;
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

  return { levels, floors, unassignedAreas, unassignedEntityIds: unassignedEntityIds.sort() };
}
