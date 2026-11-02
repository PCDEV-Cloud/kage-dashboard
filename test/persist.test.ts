import { dashboardPath, savePlan } from "../src/engine/persist";
import { rect } from "../src/engine/plan";
import { makeHass } from "./fixtures/house";

describe("persist", () => {
  it("finds the dashboard from the address", () => {
    expect(dashboardPath("/dashboard-kage/home")).toBe("dashboard-kage");
    expect(dashboardPath("/lovelace/0")).toBeNull();
    expect(dashboardPath("/")).toBeNull();
  });

  it("writes the plan into the strategy and keeps other keys", async () => {
    const hass = makeHass();
    const sent: unknown[] = [];
    hass.callWS = async <T>(msg: { type: string }) => {
      sent.push(msg);
      return { strategy: { type: "custom:kage", kiosk_mode: { a: 1 } }, title: "KAGE" } as T;
    };
    const plan = { floors: { parter: { rooms: { salon: rect(0, 0, 4, 4) } } } };
    await savePlan(hass, "dashboard-kage", plan);
    expect(sent[1]).toEqual({
      type: "lovelace/config/save",
      url_path: "dashboard-kage",
      config: { title: "KAGE", strategy: { type: "custom:kage", kiosk_mode: { a: 1 }, plan } },
    });
  });

  it("refuses dashboards that are not KAGE strategies", async () => {
    const hass = makeHass();
    hass.callWS = async <T>() => ({ views: [] }) as T;
    await expect(savePlan(hass, null, {})).rejects.toThrow();
  });
});
