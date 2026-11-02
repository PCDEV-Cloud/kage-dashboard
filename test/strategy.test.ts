import { generateDashboard, generateView, VIEW_STRATEGY_TYPE } from "../src/strategy/generate";
import { languageOf, plural } from "../src/i18n";
import { makeHass } from "./fixtures/house";

describe("generateDashboard", () => {
  it("returns a home view that delegates to the KAGE view strategy", async () => {
    const config = await generateDashboard({ type: "custom:kage" }, makeHass());
    expect(config.views).toHaveLength(1);
    expect(config.views[0].strategy?.type).toBe(VIEW_STRATEGY_TYPE);
    expect(config.views[0].title).toBe("Dom");
  });

  it("uses the user's language", async () => {
    const en = await generateDashboard({ type: "custom:kage" }, makeHass("en"));
    const zh = await generateDashboard({ type: "custom:kage" }, makeHass("zh-Hans"));
    expect(en.views[0].title).toBe("Home");
    expect(zh.views[0].title).toBe("家");
  });
});

describe("generateView", () => {
  it("creates a section per floor, top floor first, then unassigned", async () => {
    const view = await generateView({ type: "custom:kage" }, makeHass());
    const headings = view
      .sections!.map((s) => s.cards.find((c) => c.type === "heading")?.heading)
      .filter(Boolean);
    expect(headings).toEqual([
      "Poddasze",
      "Piętro",
      "Parter",
      "Ogród",
      "Bez piętra",
      "Bez przypisanego obszaru",
    ]);
  });
});

describe("unassigned report", () => {
  it("lists devices to fix by domain and counts system entities separately", async () => {
    const hass = makeHass("en");
    hass.states["sensor.bez_obszaru"] = {
      entity_id: "sensor.bez_obszaru",
      state: "1",
      attributes: { friendly_name: "Loose sensor" },
    };
    const view = await generateView({ type: "custom:kage" }, hass);
    const section = view.sections![view.sections!.length - 1];
    const report = String(section.cards[1].content);
    expect(report).toContain("`light` 1 · `sensor` 1");
    expect(report).toContain("`sensor.bez_obszaru` — Loose sensor");
    expect(report).toContain("5 system entities");
  });
});

describe("i18n", () => {
  it("falls back to English for unknown languages", () => {
    expect(languageOf({ language: "fr" })).toBe("en");
    expect(languageOf({ locale: { language: "pl-PL" } })).toBe("pl");
  });

  it("uses Polish plural forms", () => {
    const forms = { one: "{n} rzecz", few: "{n} rzeczy", many: "{n} rzeczy", other: "{n} rzeczy" };
    expect(plural("pl", 1, forms)).toBe("1 rzecz");
    expect(plural("pl", 3, forms)).toBe("3 rzeczy");
  });
});
