import { buildHomeModel, isOutdoorFloor } from "../src/engine/model";
import {
  brightnessPct,
  activeMedia,
  canSetPosition,
  climateIsOff,
  climatePower,
  coverPosition,
  mediaCaps,
  groupMembers,
  isProjectorScreen,
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
  add("cover.screen", "closed", { friendly_name: "Screen", device_class: "shade" });
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
    expect(c.covers[0]).toEqual({
      kind: "blind",
      all: "cover.blinds",
      members: ["cover.left", "cover.right"],
    });
  });

  it("keeps a projector screen apart from window blinds", () => {
    expect(c.covers.map((g) => g.kind)).toEqual(["blind", "screen"]);
    expect(c.covers[1]).toEqual({ kind: "screen", all: null, members: ["cover.screen"] });
  });

  it("keeps garage doors and gates out of the room panel", () => {
    expect(c.covers.flatMap((g) => g.members)).not.toContain("cover.garage");
  });

  it("reads room climate, light glow and positions", () => {
    expect(roomClimate(hass, area)).toEqual({ temperature: 19.8, humidity: 47 });
    expect(roomGlow(hass, area)).toBe(100);
    expect(brightnessPct(hass, "light.all")).toBe(50);
    expect(coverPosition(hass, "cover.screen")).toBe(0);
    expect(c.media).toEqual(["media_player.speaker", "media_player.tv"]);
  });
});

describe("media and climate controls", () => {
  it("offers play only when there is something to resume", () => {
    const hass = makeHass("pl");
    const set = (id: string, state: string, f: number) =>
      (hass.states[id] = { entity_id: id, state, attributes: { supported_features: f } });
    set("media_player.tv", "idle", 1 | 128 | 256 | 1024 | 16384);
    expect(mediaCaps(hass, "media_player.tv")).toEqual({
      off: false,
      canPower: true,
      canVolume: true,
      canPlayPause: false,
    });
    set("media_player.tv", "standby", 1 | 128 | 256 | 1024);
    expect(mediaCaps(hass, "media_player.tv")).toMatchObject({ off: true, canVolume: false });
    set("media_player.speaker", "paused", 1 | 4 | 16384);
    expect(mediaCaps(hass, "media_player.speaker").canPlayPause).toBe(true);
    expect(activeMedia(hass, ["media_player.tv", "media_player.speaker"])).toBe(
      "media_player.speaker",
    );
  });

  it("turns heating off and on with services or hvac modes", () => {
    const hass = makeHass("pl");
    hass.states["climate.a"] = {
      entity_id: "climate.a",
      state: "heat",
      attributes: { supported_features: 1 | 128 | 256 },
    };
    hass.states["climate.b"] = {
      entity_id: "climate.b",
      state: "off",
      attributes: { supported_features: 1, hvac_modes: ["off", "auto", "heat"] },
    };
    expect(climatePower(hass, "climate.a", false)).toEqual({
      service: "turn_off",
      data: { entity_id: "climate.a" },
    });
    expect(climateIsOff(hass, "climate.b")).toBe(true);
    expect(climatePower(hass, "climate.b", true)).toEqual({
      service: "set_hvac_mode",
      data: { entity_id: "climate.b", hvac_mode: "heat" },
    });
  });
});

describe("light groups", () => {
  const setup = () => {
    const hass = makeHass("pl");
    const add = (id: string, attributes: Record<string, unknown> = {}, extra = {}) => {
      hass.entities[id] = { entity_id: id, area_id: "sypialnia", ...extra };
      hass.states[id] = { entity_id: id, state: "on", attributes };
    };
    const area = () =>
      buildHomeModel(hass, floors)
        .floors.find((f) => f.id === "pietro")!
        .areas.find((a) => a.id === "sypialnia")!;
    return { hass, add, area };
  };

  it("recognises a switch group shown as a light", () => {
    const { hass, add, area } = setup();
    // Ukryty przełącznik-grupa i jego odpowiednik „Show as → Light”.
    add("switch.lights", { entity_id: ["switch.main", "switch.mirror"] }, { hidden: true });
    add("light.lights", {}, { platform: "switch_as_x" });
    add("light.main", {}, { platform: "switch_as_x" });
    add("light.mirror", {}, { platform: "switch_as_x" });
    expect(groupMembers(hass, "light.lights")).toEqual(["light.main", "light.mirror"]);
    expect(roomControls(hass, area()).lights).toEqual({
      all: "light.lights",
      members: ["light.main", "light.mirror"],
    });
  });

  it("prefers a group marked with a label, then the biggest group", () => {
    const { hass, add, area } = setup();
    add("light.a");
    add("light.b");
    add("light.pair", { entity_id: ["light.a", "light.b"] });
    add("light.one", { entity_id: ["light.a"] });
    expect(roomControls(hass, area()).lights?.all).toBe("light.pair");
    add("light.zigbee_all", {}, { labels: ["grupa"] });
    expect(roomControls(hass, area()).lights).toEqual({
      all: "light.zigbee_all",
      members: ["light.a", "light.b"],
    });
  });
});

describe("cover kinds", () => {
  it("gives every cover class its own tile and drops mixed groups", () => {
    const hass = makeHass("pl");
    const add = (id: string, attributes: Record<string, unknown>) => {
      hass.entities[id] = { entity_id: id, area_id: "sypialnia" };
      hass.states[id] = { entity_id: id, state: "open", attributes };
    };
    add("cover.inner", { device_class: "shade" });
    add("cover.outer", { device_class: "shutter" });
    add("cover.slats", { device_class: "blind" });
    add("cover.drape", { device_class: "curtain" });
    add("cover.all_outer", { entity_id: ["cover.outer"] });
    add("cover.everything", { entity_id: ["cover.inner", "cover.outer"] });
    const area = buildHomeModel(hass, floors)
      .floors.find((f) => f.id === "pietro")!
      .areas.find((a) => a.id === "sypialnia")!;
    const c = roomControls(hass, area);
    expect(c.covers.map((g) => [g.kind, g.all, g.members])).toEqual([
      ["shade", null, ["cover.inner"]],
      ["blind", null, ["cover.slats"]],
      ["shutter", "cover.all_outer", ["cover.outer"]],
      ["curtain", null, ["cover.drape"]],
    ]);
  });

  it("knows which covers can be set to a position", () => {
    const hass = makeHass("pl");
    hass.states["cover.a"] = {
      entity_id: "cover.a",
      state: "open",
      attributes: { supported_features: 15 },
    };
    hass.states["cover.b"] = {
      entity_id: "cover.b",
      state: "open",
      attributes: { supported_features: 3 },
    };
    expect(canSetPosition(hass, "cover.a")).toBe(true);
    expect(canSetPosition(hass, "cover.b")).toBe(false);
  });

  it("recognises screens by label or name", () => {
    const hass = makeHass("pl");
    const add = (id: string, attributes: Record<string, unknown>, labels: string[] = []) => {
      hass.entities[id] = { entity_id: id, area_id: "sypialnia", labels };
      hass.states[id] = { entity_id: id, state: "open", attributes };
    };
    add("cover.zip", { friendly_name: "Screen ZIP taras", device_class: "shade" });
    add("cover.plotno", { friendly_name: "Płótno" }, ["ekran"]);
    const area = buildHomeModel(hass, floors)
      .floors.find((f) => f.id === "pietro")!
      .areas.find((a) => a.id === "sypialnia")!;
    const c = roomControls(hass, area);
    expect(c.covers.map((g) => [g.kind, g.members])).toEqual([
      ["shade", ["cover.zip"]],
      ["screen", ["cover.plotno"]],
    ]);
    expect(isProjectorScreen(hass, "cover.zip")).toBe(false);
  });
});

describe("roomClimate", () => {
  it("ignores hot water temperature and prefers an air sensor", () => {
    const hass = makeHass("pl");
    const add = (id: string, state: string, attributes: Record<string, unknown>) => {
      hass.entities[id] = { entity_id: id, area_id: "sypialnia" };
      hass.states[id] = { entity_id: id, state, attributes };
    };
    add("climate.dhw", "heat", { current_temperature: 47.7, temperature: 50 });
    const area = () =>
      buildHomeModel(hass, floors)
        .floors.find((f) => f.id === "pietro")!
        .areas.find((a) => a.id === "sypialnia")!;
    expect(roomClimate(hass, area()).temperature).toBeNull();
    add("sensor.air", "18.4", { device_class: "temperature" });
    expect(roomClimate(hass, area()).temperature).toBe(18.4);
  });
});

describe("isOutdoorFloor", () => {
  it("recognises outdoor floors by name or icon", () => {
    expect(isOutdoorFloor({ name: "Outdoors" })).toBe(true);
    expect(isOutdoorFloor({ name: "Ogród" })).toBe(true);
    expect(isOutdoorFloor({ name: "Teren", icon: "mdi:tree" })).toBe(true);
    expect(isOutdoorFloor({ name: "Driveway" })).toBe(true);
    expect(isOutdoorFloor({ name: "Front Drive" })).toBe(true);
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
