import { callService } from "../src/engine/calls";
import { makeHass } from "./fixtures/house";

describe("callService", () => {
  it("sends a group or a single entity in one call", async () => {
    const hass = makeHass();
    const calls: unknown[] = [];
    hass.callService = async (...args) => void calls.push(args);
    await callService(hass, "light", "turn_on", { entity_id: "light.group" }, 0);
    expect(calls).toEqual([["light", "turn_on", { entity_id: "light.group" }]]);
  });

  it("sends a list one entity at a time and carries on after a failure", async () => {
    const hass = makeHass();
    const sent: string[] = [];
    hass.callService = async (_d, _s, data) => {
      sent.push(data!.entity_id as string);
      if (data!.entity_id === "light.b") throw new Error("unavailable");
    };
    await callService(
      hass,
      "light",
      "turn_off",
      { entity_id: ["light.a", "light.b", "light.c"] },
      0,
    );
    expect(sent).toEqual(["light.a", "light.b", "light.c"]);
  });
});
