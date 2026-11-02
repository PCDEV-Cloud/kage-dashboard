// Ładuje dist/kage.js w prawdziwej przeglądarce i sprawdza, że strategia rejestruje się
// tak, jak oczekuje frontend HA. Uruchom: npm run build && node dev/smoke.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const bundle = readFileSync(new URL("../dist/kage.js", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(m.text()));
page.on("pageerror", (e) => logs.push("ERROR " + e.message));

await page.setContent("<!doctype html><html><body></body></html>");
await page.addScriptTag({ content: bundle, type: "module" });
await page.waitForFunction(() => customElements.get("ll-strategy-dashboard-kage"));

const result = await page.evaluate(async () => {
  const hass = {
    language: "pl",
    locale: { language: "pl" },
    floors: { parter: { floor_id: "parter", name: "Parter", level: 0 } },
    areas: { salon: { area_id: "salon", name: "Salon", floor_id: "parter" } },
    devices: {},
    entities: { "light.salon": { entity_id: "light.salon", area_id: "salon" } },
    states: {},
    callWS: async () => [],
  };
  const dash = await customElements.get("ll-strategy-dashboard-kage").generate({ type: "custom:kage" }, hass);
  const view = await customElements.get("ll-strategy-view-kage").generate(dash.views[0].strategy, hass);
  return { dash, view, registered: window.customStrategies };
});

await browser.close();
const ok =
  result.registered?.some((s) => s.type === "kage" && s.strategyType === "dashboard") &&
  result.dash.views[0].strategy.type === "custom:kage" &&
  result.view.sections.length >= 2 &&
  !logs.some((l) => l.startsWith("ERROR"));
console.log(JSON.stringify({ ok, logs, views: result.dash.views.length, sections: result.view.sections.length }, null, 2));
process.exit(ok ? 0 : 1);
