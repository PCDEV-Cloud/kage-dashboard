import type { FloorEntry, HomeAssistant } from "../../src/types";

// Przykładowy dom z makiet: trzy piętra, ogród na poziomie parteru, obszar bez piętra.
export const floors: FloorEntry[] = [
  { floor_id: "parter", name: "Parter", level: 0 },
  { floor_id: "pietro", name: "Piętro", level: 1 },
  { floor_id: "poddasze", name: "Poddasze", level: 2 },
  { floor_id: "ogrod", name: "Ogród", level: 0, icon: "mdi:tree" },
];

export function makeHass(language = "pl", withFloors = true): HomeAssistant {
  return {
    language,
    locale: { language },
    user: { id: "u1", name: "Paweł", is_admin: true },
    floors: withFloors ? Object.fromEntries(floors.map((f) => [f.floor_id, f])) : undefined,
    areas: {
      salon: { area_id: "salon", name: "Salon", floor_id: "parter" },
      kuchnia: { area_id: "kuchnia", name: "Kuchnia", floor_id: "parter" },
      hol: { area_id: "hol", name: "Hol", floor_id: "parter" },
      sypialnia: { area_id: "sypialnia", name: "Sypialnia", floor_id: "pietro" },
      lazienka: { area_id: "lazienka", name: "Łazienka", floor_id: "pietro" },
      strych: { area_id: "strych", name: "Strych", floor_id: "poddasze" },
      taras: { area_id: "taras", name: "Taras", floor_id: "ogrod" },
      piwnica: { area_id: "piwnica", name: "Piwnica", floor_id: null },
    },
    devices: {
      d_lampa: { id: "d_lampa", name: "Lampa salon", area_id: "salon" },
      d_roleta: { id: "d_roleta", name: "Roleta kuchnia", area_id: "kuchnia" },
      d_iphone: { id: "d_iphone", name: "iPhone Paweł" },
      d_backup: { id: "d_backup", name: "Backup", entry_type: "service" },
    },
    entities: {
      "light.salon": { entity_id: "light.salon", device_id: "d_lampa" },
      "sensor.salon_signal": {
        entity_id: "sensor.salon_signal",
        device_id: "d_lampa",
        entity_category: "diagnostic",
      },
      "cover.kuchnia": { entity_id: "cover.kuchnia", device_id: "d_roleta" },
      "light.hol": { entity_id: "light.hol", area_id: "hol" },
      "climate.sypialnia": { entity_id: "climate.sypialnia", area_id: "sypialnia" },
      "switch.ukryty": { entity_id: "switch.ukryty", area_id: "sypialnia", hidden: true },
      "light.taras": { entity_id: "light.taras", area_id: "taras" },
      "sensor.bez_obszaru": { entity_id: "sensor.bez_obszaru" },
      "automation.wieczor": { entity_id: "automation.wieczor" },
      "update.core": { entity_id: "update.core" },
      "person.pawel": { entity_id: "person.pawel" },
      "sensor.iphone_battery": {
        entity_id: "sensor.iphone_battery",
        device_id: "d_iphone",
        platform: "mobile_app",
      },
      "sensor.backup_state": { entity_id: "sensor.backup_state", device_id: "d_backup" },
      "light.nieistniejacy_obszar": { entity_id: "light.nieistniejacy_obszar", area_id: "garaz" },
    },
    states: {},
    async callWS<T>(msg: { type: string }): Promise<T> {
      if (msg.type === "config/floor_registry/list") return floors as T;
      throw new Error(`unexpected ${msg.type}`);
    },
  };
}
