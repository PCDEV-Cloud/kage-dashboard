import {
  generateDashboard,
  generateView,
  HOME_CARD_TYPE,
  VIEW_STRATEGY_TYPE,
} from "../src/strategy/generate";
import { languageOf, plural } from "../src/i18n";
import { makeHass } from "./fixtures/house";

describe("generateDashboard", () => {
  it("returns the home view, plus the setup view for admins only", async () => {
    const admin = await generateDashboard({ type: "custom:kage" }, makeHass());
    expect(admin.views.map((v) => v.path)).toEqual(["home", "setup"]);
    expect(admin.views[0].strategy?.type).toBe(VIEW_STRATEGY_TYPE);
    expect(admin.views[0].title).toBe("Dom");
    const hass = makeHass();
    hass.user = { id: "u2", name: "Ania", is_admin: false };
    const member = await generateDashboard({ type: "custom:kage" }, hass);
    expect(member.views.map((v) => v.path)).toEqual(["home"]);
  });

  it("uses the user's language", async () => {
    const en = await generateDashboard({ type: "custom:kage" }, makeHass("en"));
    const zh = await generateDashboard({ type: "custom:kage" }, makeHass("zh-Hans"));
    expect(en.views[0].title).toBe("Home");
    expect(zh.views[0].title).toBe("家");
  });
});

describe("generateView", () => {
  it("renders the home view as a full-screen KAGE card", async () => {
    const view = await generateView({ type: "custom:kage", view: "home" }, makeHass());
    expect(view.type).toBe("panel");
    expect(view.cards?.[0].type).toBe(HOME_CARD_TYPE);
  });

  it("creates a section per floor, top floor first, then unassigned", async () => {
    const view = await generateView({ type: "custom:kage", view: "setup" }, makeHass());
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
    const view = await generateView({ type: "custom:kage", view: "setup" }, hass);
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

describe("kiosk_mode pass-through", () => {
  it("copies kiosk_mode from the strategy config to the dashboard", async () => {
    const kiosk = { non_admin_settings: { hide_header: true, hide_sidebar: true } };
    const cfg = await generateDashboard({ type: "custom:kage", kiosk_mode: kiosk }, makeHass());
    expect(cfg.kiosk_mode).toEqual(kiosk);
    expect(
      (await generateDashboard({ type: "custom:kage" }, makeHass())).kiosk_mode,
    ).toBeUndefined();
  });
});
