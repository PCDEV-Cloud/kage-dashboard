import { buildHomeModel, isOutdoorFloor } from "../src/engine/model";
import {
  brightnessPct,
  coverPosition,
  roomClimate,
  roomControls,
  roomGlow,
} from "../src/engine/devices";
import { autoLayout } from "../src/engine/layout";
import { findTodos } from "../src/engine/todos";
import type { HomeAssistant } from "../src/types";
import { floors, makeHass } from "./fixtures/house";

// Pokój jak sypialnia właściciela: grupa rolet + dwie rolety + ekran projektora,
// grupa świateł + pojedyncze światła, termostat, dwa głośniki.
function bedroomHass(): HomeAssistant {
  const hass = makeHass("pl");
  const add = (id: string, state: string, attributes: Record<string, unknown> = {}) => {
    hass.entities[id] = { entity_id: id, area_id: "sypialnia" };
    hass.states[id] = { entity_id: id, state, attributes };
  };
  add("cover.blinds", "open", { entity_id: ["cover.left", "cover.right"], current_position: 60 });
  add("cover.left", "open", { device_class: "blind", current_position: 100 });
  add("cover.right", "open", { device_class: "blind", current_position: 20 });
  add("cover.screen", "closed", {});
  add("cover.garage", "closed", { device_class: "garage" });
  add("light.all", "on", {
    entity_id: ["light.a", "light.b"],
    brightness: 128,
    supported_color_modes: ["brightness"],
  });
  add("light.a", "on", { brightness: 255, supported_color_modes: ["brightness"] });
  add("light.b", "off", { supported_color_modes: ["onoff"] });
  add("climate.sypialnia", "heat", {
    current_temperature: 19.8,
    temperature: 21,
    hvac_action: "heating",
  });
  add("media_player.tv", "idle", {});
  add("media_player.speaker", "playing", { media_title: "Nokturn" });
  add("sensor.hum", "47", { device_class: "humidity" });
  return hass;
}

describe("roomControls", () => {
  const hass = bedroomHass();
  const area = buildHomeModel(hass, floors)
    .floors.find((f) => f.id === "pietro")!
    .areas.find((a) => a.id === "sypialnia")!;
  const c = roomControls(hass, area);

  it("uses a group as the 'all' target and lists the single devices", () => {
    expect(c.lights).toEqual({ all: "light.all", members: ["light.a", "light.b"] });
    expect(c.covers?.all).toBe("cover.blinds");
    expect(c.covers?.members).toEqual(["cover.left", "cover.right", "cover.screen"]);
  });

  it("keeps garage doors and gates out of the room panel", () => {
    expect(c.covers?.members).not.toContain("cover.garage");
  });

  it("reads room climate, light glow and positions", () => {
    expect(roomClimate(hass, area)).toEqual({ temperature: 19.8, humidity: 47 });
    expect(roomGlow(hass, area)).toBe(100);
    expect(brightnessPct(hass, "light.all")).toBe(50);
    expect(coverPosition(hass, "cover.screen")).toBe(0);
    expect(c.media).toEqual(["media_player.speaker", "media_player.tv"]);
  });
});

describe("isOutdoorFloor", () => {
  it("recognises outdoor floors by name or icon", () => {
    expect(isOutdoorFloor({ name: "Outdoors" })).toBe(true);
    expect(isOutdoorFloor({ name: "Ogród" })).toBe(true);
    expect(isOutdoorFloor({ name: "Teren", icon: "mdi:tree" })).toBe(true);
    expect(isOutdoorFloor({ name: "Ground Floor" })).toBe(false);
  });

  it("puts the building first and the outdoor floor next to it on the same level", () => {
    const model = buildHomeModel(makeHass(), [...floors].reverse());
    const ground = model.levels.find((l) => l.level === 0)!;
    expect(ground.floors.map((f) => f.id)).toEqual(["parter", "ogrod"]);
  });
});

describe("autoLayout", () => {
  it("fills the plane without overlaps", () => {
    for (const n of [1, 2, 3, 5, 8]) {
      const rects = autoLayout(n);
      expect(rects).toHaveLength(n);
      const area = rects.reduce((s, r) => s + r.w * r.h, 0);
      expect(area).toBeCloseTo(1, 5);
    }
  });
});

describe("findTodos", () => {
  it("finds low batteries and problems, skipping phones", () => {
    const hass = makeHass("pl");
    const add = (id: string, state: string, attributes: Record<string, unknown>, extra = {}) => {
      hass.entities[id] = {
        entity_id: id,
        area_id: "sypialnia",
        entity_category: "diagnostic",
        ...extra,
      };
      hass.states[id] = { entity_id: id, state, attributes };
    };
    add("sensor.window_battery", "9", { device_class: "battery", friendly_name: "Okno" });
    add("sensor.ok_battery", "80", { device_class: "battery" });
    add("binary_sensor.pump_error", "on", { device_class: "problem", friendly_name: "Pompa" });
    add("sensor.phone_battery", "5", { device_class: "battery" }, { platform: "mobile_app" });
    const todos = findTodos(hass);
    expect(todos.map((t) => t.entityId)).toEqual([
      "binary_sensor.pump_error",
      "sensor.window_battery",
    ]);
    expect(todos[1]).toMatchObject({ kind: "battery", value: 9, area: "Sypialnia" });
  });
});
