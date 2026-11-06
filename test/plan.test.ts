import { buildHomeModel } from "../src/engine/model";
import {
  DEFAULT_ROOF,
  centroid,
  isStairsName,
  roomIsStairs,
  stairLines,
  dashedAfterInsert,
  dashedAfterRemove,
  toggleDashed,
  freeSpot,
  groupSides,
  insertVertex,
  lShape,
  moveBy,
  polygonArea,
  rect,
  removeVertex,
  resolvePlan,
  resolveRoof,
  roofLines,
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
    expect(p.side).toBeNull();
  });

  it("guesses the attic roof from the floor name", () => {
    expect(resolvePlan(undefined, parter).roof).toBeNull();
    expect(resolvePlan(undefined, { ...strych, name: "Poddasze" }).roof).toEqual(DEFAULT_ROOF);
    expect(resolvePlan(undefined, { ...strych, name: "Attic" }).roof).toEqual(DEFAULT_ROOF);
  });

  it("reads roof type, ridge and pitch and draws its lines", () => {
    expect(resolveRoof({ type: "hip", ridge: "y", pitch: 80 }, false)).toEqual({
      type: "hip",
      ridge: "y",
      pitch: 60,
    });
    expect(resolveRoof(false, true)).toBeNull();
    expect(roofLines(20, 16, DEFAULT_ROOF)).toEqual([
      [
        [0, 8],
        [20, 8],
      ],
    ]);
    const hip = roofLines(20, 16, { type: "hip", ridge: "x", pitch: 30 });
    expect(hip[0]).toEqual([
      [8, 8],
      [12, 8],
    ]);
    expect(hip).toHaveLength(5);
    expect(roofLines(20, 16, { type: "gable", ridge: "y", pitch: 30 })[0]).toEqual([
      [10, 0],
      [10, 16],
    ]);
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
    const withRoof = writeFloor(undefined, "p", { ...resolved, roof: DEFAULT_ROOF });
    expect(withRoof.floors!.p!.roof).toEqual(DEFAULT_ROOF);
    expect(saved.floors!.parter!.cols).toBeUndefined();
    expect(writeFloor(saved, "parter", null).floors).toEqual({});
  });

  it("places zones of one level on a 3 × 3 grid", () => {
    expect(groupSides([null, null])).toEqual(["center", "right"]);
    expect(groupSides([null, "center", null])).toEqual(["right", "center", "left"]);
    expect(groupSides(["front-left", null])).toEqual(["front-left", "center"]);
  });

  it("keeps dashed edges through edits and saves", () => {
    expect(dashedAfterInsert([0, 2], 0)).toEqual([0, 1, 3]);
    expect(dashedAfterRemove([1], 1, 4)).toEqual([0]);
    expect(dashedAfterRemove([3], 0, 4)).toEqual([2]);
    expect(dashedAfterRemove([2], 1, 4)).toEqual([1]);
    expect(toggleDashed([1], 1)).toEqual([]);
    const first = parter.areas[0]!.id;
    const plan = {
      floors: {
        parter: { outdoor: true, rooms: { [first]: { points: rect(0, 0, 4, 4), dashed: [1, 9] } } },
      },
    };
    const p = resolvePlan(plan, parter);
    expect(p.rooms[0]).toEqual({ id: first, points: rect(0, 0, 4, 4), dashed: [1] });
    expect(p.outdoor).toBe(true);
    const back = writeFloor(undefined, "parter", p).floors!.parter!;
    expect(back.rooms![first]).toEqual({ points: rect(0, 0, 4, 4), dashed: [1] });
    expect(back.outdoor).toBe(true);
  });

  it("draws stairs across the longer side and remembers the choice", () => {
    expect(isStairsName("Attic Stairs")).toBe(true);
    expect(isStairsName("Schody")).toBe(true);
    expect(isStairsName("Landing")).toBe(false);
    const lines = stairLines(rect(0, 0, 3, 1), 1);
    expect(lines).toEqual([
      [
        [1, 0],
        [1, 1],
      ],
      [
        [2, 0],
        [2, 1],
      ],
    ]);
    expect(stairLines(rect(0, 0, 1, 3), 1)[0]).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(roomIsStairs({ id: "x", points: rect(0, 0, 1, 1) }, "Stairs")).toBe(true);
    expect(roomIsStairs({ id: "x", points: rect(0, 0, 1, 1), stairs: false }, "Stairs")).toBe(
      false,
    );
    const first = parter.areas[0]!.id;
    const plan = {
      floors: {
        parter: {
          rooms: { [first]: { points: rect(0, 0, 4, 4), stairs: true } },
          voids: [rect(5, 5, 2, 2), rect(8, 8, 2, 2)],
          voidStairs: [1, 7],
        },
      },
    };
    const p = resolvePlan(plan, parter);
    expect(p.rooms[0]!.stairs).toBe(true);
    expect(p.voidStairs).toEqual([1]);
    const back = writeFloor(undefined, "parter", p).floors!.parter!;
    expect(back.rooms![first]).toEqual({ points: rect(0, 0, 4, 4), stairs: true });
    expect(back.voidStairs).toEqual([1]);
  });

  it("edits polygons on the grid", () => {
    expect(lShape(0, 0, 4, 4)).toHaveLength(6);
    expect(polygonArea(lShape(0, 0, 4, 4))).toBe(12);
    expect(centroid(rect(0, 0, 4, 2))).toEqual([2, 1]);
    expect(moveBy(rect(0, 0, 4, 4), 30, -3, 20, 16)).toEqual(rect(16, 0, 4, 4));
    expect(insertVertex(rect(0, 0, 4, 4), 0)[1]).toEqual([2, 0]);
    expect(removeVertex(rect(0, 0, 4, 4), 1)).toHaveLength(3);
    expect(removeVertex(removeVertex(rect(0, 0, 4, 4), 1), 0)).toHaveLength(3);
    expect(freeSpot([rect(0, 0, 4, 4)], 20, 16)).toEqual(rect(4, 0, 4, 4));
  });
});
