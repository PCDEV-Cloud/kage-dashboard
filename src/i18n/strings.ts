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
  stop: string;
  opening: string;
  closing: string;
  position: string;
  // Kafel osłon okien według klasy urządzenia w HA.
  covers: Record<
    "shade" | "blind" | "shutter" | "curtain" | "awning" | "window" | "other" | "screen",
    string
  >;
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

  // Ekran „Poza domem”
  ctxAway: string;
  verdictOk: string;
  verdictIssues: PluralForms; // {n}
  issue: {
    leak: string;
    smoke: string;
    gas: string;
    alarmTriggered: string;
    waterFlow: string;
    gateOpen: string;
    opening: string; // {n}
    alarmOff: string;
    hotWater: string;
    pressure: string;
    lights: string; // {n}
    outlets: string; // {n}
    power: string; // {v}
  };
  actTurnOff: string;
  actArm: string;
  actCloseValve: string;
  actClose: string;
  hold: string;
  secureHome: string;
  secureHint: string;
  secureNothing: string;
  secureRun: string;
  secureDone: string;
  cancel: string;
  step: {
    lights: string; // {n}
    alarm: string;
    valve: string;
    gate: string;
  };
  peopleAtHome: string;
  nobodyHome: string;
  showRooms: string;
  backToOverview: string;
}
