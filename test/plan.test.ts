import { buildHomeModel } from "../src/engine/model";
import {
  centroid,
  freeSpot,
  insertVertex,
  lShape,
  moveBy,
  rect,
  removeVertex,
  resolvePlan,
  writeFloor,
} from "../src/engine/plan";
import { floors, makeHass } from "./fixtures/house";

const model = buildHomeModel(makeHass(), floors);
const parter = model.floors.find((f) => f.id === "parter")!;
const strych = model.floors.find((f) => f.id === "poddasze")!;

describe("plan", () => {
  it("falls back to an automatic grid that fills the floor", () => {
    const p = resolvePlan(undefined, parter);
    expect(p.auto).toBe(true);
    expect(p.rooms.map((r) => r.id)).toEqual(parter.areas.map((a) => a.id));
    expect(p.rooms.every((r) => r.points.length === 4)).toBe(true);
    expect(p.side).toBe("right");
  });

  it("guesses the attic roof from the floor name", () => {
    expect(resolvePlan(undefined, parter).roof).toBe(false);
    expect(resolvePlan(undefined, { ...strych, name: "Poddasze" }).roof).toBe(true);
    expect(resolvePlan(undefined, { ...strych, name: "Attic" }).roof).toBe(true);
  });

  it("uses saved polygons and lists rooms still to place", () => {
    const first = parter.areas[0]!.id;
    const plan = {
      floors: { parter: { rooms: { [first]: lShape(0, 0, 6, 6) }, side: "left" as const } },
    };
    const p = resolvePlan(plan, parter);
    expect(p.auto).toBe(false);
    expect(p.rooms).toEqual([{ id: first, points: lShape(0, 0, 6, 6) }]);
    expect(p.unplaced).toEqual(parter.areas.slice(1).map((a) => a.id));
    expect(p.side).toBe("left");
  });

  it("writes a floor back without default values and can reset it", () => {
    const resolved = resolvePlan(undefined, parter);
    const saved = writeFloor(undefined, "parter", { ...resolved, voids: [rect(0, 0, 2, 2)] });
    expect(saved.floors!.parter).toMatchObject({ roof: false, voids: [rect(0, 0, 2, 2)] });
    expect(saved.floors!.parter!.cols).toBeUndefined();
    expect(writeFloor(saved, "parter", null).floors).toEqual({});
  });

  it("edits polygons on the grid", () => {
    expect(lShape(0, 0, 4, 4)).toHaveLength(6);
    expect(centroid(rect(0, 0, 4, 2))).toEqual([2, 1]);
    expect(moveBy(rect(0, 0, 4, 4), 30, -3, 20, 16)).toEqual(rect(16, 0, 4, 4));
    expect(insertVertex(rect(0, 0, 4, 4), 0)[1]).toEqual([2, 0]);
    expect(removeVertex(rect(0, 0, 4, 4), 1)).toHaveLength(3);
    expect(removeVertex(removeVertex(rect(0, 0, 4, 4), 1), 0)).toHaveLength(3);
    expect(freeSpot([rect(0, 0, 4, 4)], 20, 16)).toEqual(rect(4, 0, 4, 4));
  });
});
