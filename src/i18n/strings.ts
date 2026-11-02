export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

// Wszystkie teksty interfejsu. Nowy język = nowy plik z tym kształtem.
export interface Strings {
  strategyName: string;
  strategyDescription: string;
  viewHome: string;
  viewSetup: string;
  unassignedFloor: string;
  unassignedEntities: string;
  areaCount: PluralForms;
  entityCount: PluralForms;
  emptyHome: string;
  skeletonNotice: string;
  unassignedHint: string;
  noUnassignedDevices: string;
  moreItems: string;
  systemEntities: PluralForms;

  // Ekran „W domu”
  ctxHome: string;
  alarmOff: string;
  alarmArmed: string;
  alarmArming: string;
  alarmTriggered: string;
  floorLit: string; // etykieta licznika na karcie piętra
  nothingToDo: string;
  todoBattery: string; // {n}
  todoBatteryLow: string;
  todoProblem: string;
  hide: string; // {x}
  humidity: string; // {n}
  lightOn: string;
  stateOn: string;
  stateOff: string;
  light: string;
  lightsSome: string; // {on} {total}
  allLights: string;
  brightness: string;
  blinds: string;
  open: string;
  closed: string;
  openPct: string; // {n}
  openAll: string;
  closeAll: string;
  heating: string;
  heatingNow: string; // {t}
  holdingNow: string; // {t}
  lowerTemp: string;
  raiseTemp: string;
  music: string;
  nothingPlaying: string;
  play: string;
  pause: string;
  nothingToControl: string;
  sensorsInBackground: string;
  showList: string;
  back: string;
  scenes: string;
  moveTo: string; // {x}
}
