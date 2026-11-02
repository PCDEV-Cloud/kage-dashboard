import { hotWaterStatus, isHotWater } from "./hotwater";
import { domainOf, entityAreaId, isSystemEntity } from "./model";
import { findTodos } from "./todos";
import type { HomeAssistant } from "../types";

// Przegląd „Poza domem”: rzeczy, na które da się zareagować z daleka.
// Kolejność: najpierw alarmy (wyciek, dym), potem to, co zostało otwarte lub włączone,
// na końcu sprawy bez pośpiechu (baterie). Brak urządzenia danego rodzaju = brak sprawy.

export type Severity = "crit" | "warn" | "info";

export type IssueKind =
  | "leak"
  | "smoke"
  | "gas"
  | "alarmTriggered"
  | "waterFlow"
  | "gateOpen"
  | "opening"
  | "alarmOff"
  | "lights"
  | "outlets"
  | "hotWater"
  | "pressure"
  | "power"
  | "battery"
  | "problem";

// Akcja naprawcza. `hold` = akcja fizyczna, wymaga przytrzymania 1,1 s.
export interface IssueAction {
  domain: string;
  service: string;
  entityIds: string[];
  hold: boolean;
}

export interface Issue {
  id: string;
  kind: IssueKind;
  severity: Severity;
  entityIds: string[];
  names: string[]; // nazwy urządzeń (do opisu)
  areas: string[]; // obszary, w których jest sprawa
  value: number | null;
  unit: string | null;
  action: IssueAction | null;
}

const ORDER: IssueKind[] = [
  "alarmTriggered",
  "leak",
  "smoke",
  "gas",
  "waterFlow",
  "gateOpen",
  "opening",
  "alarmOff",
  "hotWater",
  "pressure",
  "lights",
  "outlets",
  "power",
  "problem",
  "battery",
];

// Progi. Konfigurowalne w edytorze strategii (etap 6); na razie stałe.
export const LOW_WATER_PRESSURE_BAR = 1.0;
export const HIGH_AWAY_POWER_W = 500;

const OPENING_CLASSES = new Set(["door", "window", "garage_door", "opening"]);
const GATE_CLASSES = new Set(["garage", "gate"]);
const WHOLE_HOME = /total|house|home|whole|grid|\bdom\b|cał\w*|sieć|zużyci|总/i;

interface Ctx {
  hass: HomeAssistant;
  name(id: string): string;
  area(id: string): string | null;
}

function context(hass: HomeAssistant): Ctx {
  return {
    hass,
    name(id) {
      const n = hass.entities[id]?.name ?? hass.states[id]?.attributes.friendly_name;
      return typeof n === "string" ? n : id;
    },
    area(id) {
      const e = hass.entities[id];
      const a = e ? entityAreaId(hass, e) : null;
      return a ? (hass.areas[a]?.name ?? null) : null;
    },
  };
}

const isGroup = (hass: HomeAssistant, id: string) =>
  Array.isArray(hass.states[id]?.attributes.entity_id) || hass.entities[id]?.platform === "group";

const uniq = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];

// Encje widoczne dla domownika: z rejestru, nieukryte, niesystemowe, dostępne.
function visible(hass: HomeAssistant): string[] {
  return Object.values(hass.entities)
    .filter((e) => !e.hidden && !e.entity_category && !isSystemEntity(hass, e))
    .map((e) => e.entity_id)
    .filter((id) => {
      const s = hass.states[id]?.state;
      return s !== undefined && s !== "unavailable" && s !== "unknown";
    });
}

export function findIssues(hass: HomeAssistant): Issue[] {
  const c = context(hass);
  const ids = visible(hass);
  const st = (id: string) => hass.states[id]!;
  const cls = (id: string) => st(id).attributes.device_class;
  const out: Issue[] = [];
  const group = (
    kind: IssueKind,
    severity: Severity,
    list: string[],
    action: IssueAction | null = null,
  ) => {
    if (!list.length) return;
    out.push({
      id: `${kind}:${list.slice().sort().join(",")}`,
      kind,
      severity,
      entityIds: list,
      names: list.map(c.name),
      areas: uniq(list.map(c.area)),
      value: list.length,
      unit: null,
      action,
    });
  };

  const binaryOn = (classes: Set<string> | string) =>
    ids.filter((id) => {
      if (domainOf(id) !== "binary_sensor" || st(id).state !== "on") return false;
      const k = cls(id);
      return typeof classes === "string" ? k === classes : classes.has(k as string);
    });

  const valves = ids.filter(
    (id) => domainOf(id) === "valve" && ["open", "opening"].includes(st(id).state),
  );
  const closeValves: IssueAction | null = valves.length
    ? { domain: "valve", service: "close_valve", entityIds: valves, hold: true }
    : null;

  group("leak", "crit", binaryOn("moisture"), closeValves);
  group("smoke", "crit", binaryOn(new Set(["smoke", "heat"])));
  group("gas", "crit", binaryOn(new Set(["gas", "carbon_monoxide"])));

  const alarms = ids.filter((id) => domainOf(id) === "alarm_control_panel");
  group(
    "alarmTriggered",
    "crit",
    alarms.filter((id) => st(id).state === "triggered"),
  );

  const flowing = ids.filter(
    (id) => domainOf(id) === "sensor" && cls(id) === "volume_flow_rate" && Number(st(id).state) > 0,
  );
  group("waterFlow", "warn", flowing, closeValves);

  const gates = ids.filter(
    (id) =>
      domainOf(id) === "cover" &&
      GATE_CLASSES.has(cls(id) as string) &&
      ["open", "opening"].includes(st(id).state),
  );
  group("gateOpen", "warn", gates, {
    domain: "cover",
    service: "close_cover",
    entityIds: gates,
    hold: true,
  });

  group("opening", "warn", binaryOn(OPENING_CLASSES));

  const disarmed = alarms.filter((id) => st(id).state === "disarmed");
  group("alarmOff", "warn", disarmed, {
    domain: "alarm_control_panel",
    service: "alarm_arm_away",
    entityIds: disarmed,
    hold: false,
  });

  const cold = ids.filter((id) => isHotWater(hass, id) && hotWaterStatus(hass, id) !== null);
  group("hotWater", "warn", cold);

  const pressure = ids.filter((id) => {
    if (domainOf(id) !== "sensor" || cls(id) !== "pressure") return false;
    const unit = st(id).attributes.unit_of_measurement;
    const v = Number(st(id).state);
    return unit === "bar" && Number.isFinite(v) && v < LOW_WATER_PRESSURE_BAR;
  });
  group("pressure", "warn", pressure);

  const lights = ids.filter(
    (id) => domainOf(id) === "light" && st(id).state === "on" && !isGroup(hass, id),
  );
  group("lights", "warn", lights, {
    domain: "light",
    service: "turn_off",
    entityIds: lights,
    hold: false,
  });

  // Gniazdka bez akcji zbiorczej: wśród nich bywa lodówka albo router.
  group(
    "outlets",
    "info",
    ids.filter((id) => domainOf(id) === "switch" && cls(id) === "outlet" && st(id).state === "on"),
  );

  // Pobór prądu całego domu: czujnik mocy oznaczony etykietą `dom`/`home` albo o nazwie
  // wskazującej na cały dom; bierzemy największy.
  const power = ids
    .filter((id) => domainOf(id) === "sensor" && cls(id) === "power")
    .filter(
      (id) =>
        hass.entities[id]?.labels?.some((l) => ["dom", "home"].includes(l.toLowerCase())) ||
        WHOLE_HOME.test(c.name(id)),
    )
    .map((id) => {
      const unit = st(id).attributes.unit_of_measurement;
      const v = Number(st(id).state);
      return { id, w: unit === "kW" ? v * 1000 : v };
    })
    .filter((p) => Number.isFinite(p.w))
    .sort((a, b) => b.w - a.w)[0];
  if (power && power.w >= HIGH_AWAY_POWER_W) {
    out.push({
      id: `power:${power.id}`,
      kind: "power",
      severity: "info",
      entityIds: [power.id],
      names: [c.name(power.id)],
      areas: [],
      value: Math.round(power.w),
      unit: "W",
      action: null,
    });
  }

  for (const t of findTodos(hass)) {
    out.push({
      id: t.id,
      kind: t.kind,
      severity: "info",
      entityIds: [t.entityId],
      names: [t.name],
      areas: t.area ? [t.area] : [],
      value: t.value,
      unit: t.value !== null ? "%" : null,
      action: null,
    });
  }

  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

// „Zabezpiecz dom”: kroki, które da się wykonać z daleka. Akcje fizyczne z przytrzymaniem.
export interface SecureStep {
  kind: "lights" | "alarm" | "valve" | "gate";
  action: IssueAction;
}

export function secureSteps(issues: Issue[], hass: HomeAssistant): SecureStep[] {
  const steps: SecureStep[] = [];
  const pick = (k: IssueKind) => issues.find((i) => i.kind === k)?.action ?? null;
  const lights = pick("lights");
  if (lights) steps.push({ kind: "lights", action: lights });
  const alarm = pick("alarmOff");
  if (alarm) steps.push({ kind: "alarm", action: alarm });
  const valves = Object.keys(hass.states).filter(
    (id) =>
      domainOf(id) === "valve" &&
      hass.states[id]!.attributes.device_class === "water" &&
      ["open", "opening"].includes(hass.states[id]!.state),
  );
  if (valves.length)
    steps.push({
      kind: "valve",
      action: { domain: "valve", service: "close_valve", entityIds: valves, hold: true },
    });
  const gate = pick("gateOpen");
  if (gate) steps.push({ kind: "gate", action: gate });
  return steps;
}

export const worstSeverity = (issues: Issue[]): Severity | null =>
  issues.some((i) => i.severity === "crit")
    ? "crit"
    : issues.some((i) => i.severity === "warn")
      ? "warn"
      : issues.length
        ? "info"
        : null;
