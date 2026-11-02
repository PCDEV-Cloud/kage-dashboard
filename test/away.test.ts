import { isHotWater, hotWaterStatus } from "../src/engine/hotwater";
import { findIssues, secureSteps, worstSeverity } from "../src/engine/issues";
import { contextFor, contextOverride, peopleHome } from "../src/engine/presence";
import type { HomeAssistant } from "../src/types";
import { makeHass } from "./fixtures/house";

function house(): HomeAssistant & {
  add: (id: string, state: string, a?: Record<string, unknown>, e?: object) => void;
} {
  const hass = makeHass("pl") as HomeAssistant & {
    add: (id: string, state: string, a?: Record<string, unknown>, e?: object) => void;
  };
  hass.add = (id, state, attributes = {}, extra = {}) => {
    hass.entities[id] = { entity_id: id, area_id: "salon", ...extra };
    hass.states[id] = { entity_id: id, state, attributes };
  };
  return hass;
}

describe("context", () => {
  it("follows the logged-in user's person and stays home without data", () => {
    const hass = house();
    expect(contextFor(hass)).toBe("home");
    hass.states["person.pawel"] = {
      entity_id: "person.pawel",
      state: "not_home",
      attributes: { user_id: "u1", friendly_name: "Paweł" },
    };
    expect(contextFor(hass)).toBe("away");
    hass.states["person.pawel"]!.state = "Praca";
    expect(contextFor(hass)).toBe("away");
    hass.states["person.pawel"]!.state = "unknown";
    expect(contextFor(hass)).toBe("home");
    expect(contextFor(hass, "away")).toBe("away");
  });

  it("reads the preview override from the address", () => {
    expect(contextOverride("?kage=away")).toBe("away");
    expect(contextOverride("?foo=1")).toBeNull();
  });

  it("lists people at home without technical accounts", () => {
    const hass = house();
    const person = (id: string, name: string, state: string) =>
      (hass.states[id] = { entity_id: id, state, attributes: { friendly_name: name } });
    person("person.jo", "Jo", "home");
    person("person.pawel", "Paweł", "not_home");
    person("person.panel", "Panel", "home");
    expect(peopleHome(hass, ["person.panel"])).toEqual(["Jo"]);
  });
});

describe("hot water", () => {
  it("is recognised by name or domain and reported only when cold", () => {
    const hass = house();
    hass.add("climate.lg_therma_dhw", "heat", {
      friendly_name: "LG Therma DHW Thermostat",
      current_temperature: 46,
    });
    hass.add("climate.salon", "heat", { current_temperature: 21 });
    expect(isHotWater(hass, "climate.lg_therma_dhw")).toBe(true);
    expect(isHotWater(hass, "climate.salon")).toBe(false);
    expect(hotWaterStatus(hass, "climate.lg_therma_dhw")).toBeNull();
    hass.states["climate.lg_therma_dhw"]!.attributes.current_temperature = 32;
    expect(hotWaterStatus(hass, "climate.lg_therma_dhw")).toBe("low");
    expect(findIssues(hass).map((i) => i.kind)).toContain("hotWater");
  });
});

describe("findIssues", () => {
  it("orders alarms first and offers fixes only where it is safe", () => {
    const hass = house();
    hass.add("light.a", "on");
    hass.add("light.b", "on");
    hass.add("light.group", "on", { entity_id: ["light.a", "light.b"] });
    hass.add("binary_sensor.window", "on", { device_class: "window", friendly_name: "Okno" });
    hass.add("binary_sensor.leak", "on", { device_class: "moisture" });
    hass.add("valve.water", "open", { device_class: "water" });
    hass.add("cover.gate", "open", { device_class: "gate" });
    hass.add("switch.plug", "on", { device_class: "outlet" });
    hass.add("alarm_control_panel.home", "disarmed");
    hass.add("sensor.house_power", "1.2", {
      device_class: "power",
      unit_of_measurement: "kW",
      friendly_name: "House power",
    });
    hass.add("sensor.water_pressure", "0.4", {
      device_class: "pressure",
      unit_of_measurement: "bar",
    });
    hass.add("sensor.air_pressure", "1013", {
      device_class: "pressure",
      unit_of_measurement: "hPa",
    });

    const issues = findIssues(hass);
    expect(issues.map((i) => i.kind)).toEqual([
      "leak",
      "gateOpen",
      "opening",
      "alarmOff",
      "pressure",
      "lights",
      "outlets",
      "power",
    ]);
    const leak = issues[0]!;
    expect(leak.action).toEqual({
      domain: "valve",
      service: "close_valve",
      entityIds: ["valve.water"],
      hold: true,
    });
    expect(issues.find((i) => i.kind === "lights")!.entityIds).toEqual(["light.a", "light.b"]);
    expect(issues.find((i) => i.kind === "outlets")!.action).toBeNull();
    expect(issues.find((i) => i.kind === "power")!.value).toBe(1200);
    expect(worstSeverity(issues)).toBe("crit");

    expect(secureSteps(issues, hass).map((s) => [s.kind, s.action.hold])).toEqual([
      ["lights", false],
      ["alarm", false],
      ["valve", true],
      ["gate", true],
    ]);
  });

  it("reports nothing in a quiet house", () => {
    const hass = house();
    hass.add("light.a", "off");
    hass.add("alarm_control_panel.home", "armed_away");
    expect(findIssues(hass)).toEqual([]);
    expect(worstSeverity([])).toBeNull();
  });
});
