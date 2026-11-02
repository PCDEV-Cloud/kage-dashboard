import { domainOf, entityAreaId, isSystemEntity } from "./model";
import type { HomeAssistant } from "../types";

// Sprawy „do zrobienia”: rzeczy, na które domownik może zareagować bez pośpiechu.
// Baterie i czujniki problemów są zwykle diagnostyczne, więc tu czytamy także je.

export const LOW_BATTERY = 15;

export interface Todo {
  id: string; // stabilny klucz do ukrywania
  kind: "battery" | "problem";
  entityId: string;
  name: string;
  area: string | null;
  value: number | null;
}

export function findTodos(hass: HomeAssistant): Todo[] {
  const out: Todo[] = [];
  for (const entity of Object.values(hass.entities)) {
    if (entity.hidden || isSystemEntity(hass, entity)) continue;
    const s = hass.states[entity.entity_id];
    if (!s || s.state === "unavailable" || s.state === "unknown") continue;
    const cls = s.attributes.device_class;
    const domain = domainOf(entity.entity_id);
    const areaId = entityAreaId(hass, entity);
    const area = areaId ? (hass.areas[areaId]?.name ?? null) : null;
    const device = entity.device_id ? hass.devices[entity.device_id] : undefined;
    const name =
      device?.name_by_user ??
      device?.name ??
      (typeof s.attributes.friendly_name === "string"
        ? s.attributes.friendly_name
        : entity.entity_id);

    if (domain === "sensor" && cls === "battery") {
      const v = Number(s.state);
      if (Number.isFinite(v) && v <= LOW_BATTERY) {
        out.push({
          id: `battery:${entity.entity_id}`,
          kind: "battery",
          entityId: entity.entity_id,
          name,
          area,
          value: v,
        });
      }
    } else if (domain === "binary_sensor" && cls === "battery" && s.state === "on") {
      out.push({
        id: `battery:${entity.entity_id}`,
        kind: "battery",
        entityId: entity.entity_id,
        name,
        area,
        value: null,
      });
    } else if (domain === "binary_sensor" && cls === "problem" && s.state === "on") {
      out.push({
        id: `problem:${entity.entity_id}`,
        kind: "problem",
        entityId: entity.entity_id,
        name,
        area,
        value: null,
      });
    }
  }
  return out.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "problem" ? -1 : 1,
  );
}
