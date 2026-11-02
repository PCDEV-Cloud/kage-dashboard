import type { Strings } from "./strings";

export const en: Strings = {
  strategyName: "KAGE",
  strategyDescription: "Context-aware dashboard generated from your floors, areas and devices.",
  viewHome: "Home",
  unassignedFloor: "No floor",
  unassignedEntities: "Not assigned to an area",
  areaCount: { one: "{n} area", other: "{n} areas" },
  entityCount: { one: "{n} entity", other: "{n} entities" },
  emptyHome: "No floors or areas yet. Add them in Settings → Areas, labels & zones.",
  unassignedHint:
    "assign their devices to areas in Settings → Devices & services → Devices (entities inherit the device's area).",
  noUnassignedDevices: "Every device is assigned to an area.",
  moreItems: "…and {n} more.",
  systemEntities: {
    one: "{n} system entity (automations, updates, people…) is not counted: it doesn't belong to a room.",
    other:
      "{n} system entities (automations, updates, people…) are not counted: they don't belong to a room.",
  },
  skeletonNotice:
    "KAGE technical preview: the engine reads your home. The final look arrives in the next stages.",
};
