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
  unassignedHint:
    "przypisz ich urządzenia do obszarów w Ustawienia → Urządzenia i usługi → Urządzenia (encje dziedziczą obszar urządzenia).",
  noUnassignedDevices: "Wszystkie urządzenia mają przypisany obszar.",
  moreItems: "…i {n} więcej.",
  systemEntities: {
    one: "{n} encja systemowa (automatyzacje, aktualizacje, osoby…) nie jest liczona: nie należy do pokoju.",
    few: "{n} encje systemowe (automatyzacje, aktualizacje, osoby…) nie są liczone: nie należą do pokoi.",
    many: "{n} encji systemowych (automatyzacje, aktualizacje, osoby…) nie jest liczonych: nie należą do pokoi.",
    other: "{n} encji systemowych (automatyzacje, aktualizacje, osoby…) nie jest liczonych.",
  },
  skeletonNotice:
    "Podgląd techniczny KAGE: silnik czyta Twój dom. Docelowy wygląd dochodzi w kolejnych etapach.",
};
