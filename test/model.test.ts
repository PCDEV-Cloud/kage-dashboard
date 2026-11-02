import { buildHomeModel, loadFloors } from "../src/engine/model";
import { floors, makeHass } from "./fixtures/house";

describe("buildHomeModel", () => {
  const hass = makeHass();
  const model = buildHomeModel(hass, floors);

  it("orders levels from the highest to the lowest", () => {
    expect(model.levels.map((l) => l.level)).toEqual([2, 1, 0]);
  });

  it("puts floors with the same level side by side", () => {
    const ground = model.levels.find((l) => l.level === 0)!;
    expect(ground.floors.map((f) => f.id)).toEqual(["parter", "ogrod"]);
  });

  it("assigns entities to areas directly and through their device", () => {
    const parter = model.floors.find((f) => f.id === "parter")!;
    const salon = parter.areas.find((a) => a.id === "salon")!;
    const kuchnia = parter.areas.find((a) => a.id === "kuchnia")!;
    expect(salon.entityIds).toEqual(["light.salon"]);
    expect(kuchnia.entityIds).toEqual(["cover.kuchnia"]);
  });

  it("hides diagnostic, config and hidden entities", () => {
    const all = model.floors.flatMap((f) => f.areas.flatMap((a) => a.entityIds));
    expect(all).not.toContain("sensor.salon_signal");
    expect(all).not.toContain("switch.ukryty");
  });

  it("keeps areas without a floor and entities without an area", () => {
    expect(model.unassignedAreas.map((a) => a.id)).toEqual(["piwnica"]);
    expect(model.unassignedEntityIds).toEqual(["light.nieistniejacy_obszar", "sensor.bez_obszaru"]);
  });

  it("picks up a new entity without any configuration", () => {
    const h = makeHass();
    h.entities["light.nowa"] = { entity_id: "light.nowa", area_id: "strych" };
    const m = buildHomeModel(h, floors);
    const strych = m.floors.find((f) => f.id === "poddasze")!.areas[0];
    expect(strych.entityIds).toContain("light.nowa");
  });
});

describe("loadFloors", () => {
  it("uses hass.floors when present", async () => {
    expect((await loadFloors(makeHass())).length).toBe(4);
  });

  it("falls back to the floor registry over WebSocket", async () => {
    expect((await loadFloors(makeHass("pl", false))).length).toBe(4);
  });
});
