import type { Strings } from "./strings";

export const pl: Strings = {
  strategyName: "KAGE",
  strategyDescription: "Kontekstowy dashboard generowany z pięter, obszarów i urządzeń.",
  viewHome: "Dom",
  unassignedFloor: "Bez piętra",
  unassignedEntities: "Bez przypisanego obszaru",
  areaCount: { one: "{n} obszar", few: "{n} obszary", many: "{n} obszarów", other: "{n} obszaru" },
  entityCount: { one: "{n} encja", few: "{n} encje", many: "{n} encji", other: "{n} encji" },
  emptyHome: "Brak pięter i obszarów. Dodaj je w Ustawienia → Obszary, etykiety i strefy.",
  skeletonNotice:
    "Podgląd techniczny KAGE: silnik czyta Twój dom. Docelowy wygląd dochodzi w kolejnych etapach.",
};
