export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

// Wszystkie teksty interfejsu. Nowy język = nowy plik z tym kształtem.
export interface Strings {
  strategyName: string;
  strategyDescription: string;
  viewHome: string;
  unassignedFloor: string;
  unassignedEntities: string;
  areaCount: PluralForms;
  entityCount: PluralForms;
  emptyHome: string;
  skeletonNotice: string;
}
