// Renderuje kartę KAGE na domu testowym i zapisuje zrzuty ekranu.
// Uruchom: npm run build && node dev/preview.mjs [katalog_wyjściowy]
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { demoHass } from "./demo-house.mjs";

const out = process.argv[2] ?? "dev/out";
mkdirSync(out, { recursive: true });
const bundle = readFileSync(new URL("../dist/kage.js", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on(
  "console",
  (m) => m.type() === "error" && !m.text().includes("ERR_TUNNEL") && errors.push(m.text()),
);

await page.setContent(
  `<!doctype html><html><body style="margin:0;background:#05060a"></body></html>`,
);
await page.addScriptTag({ content: bundle, type: "module" });
await page.waitForFunction(() => customElements.get("kage-home-card"));
await page.evaluate(`(${demoHass.toString()})`).catch(() => {});
await page.evaluate((src) => {
  // eslint-disable-next-line no-new-func
  const make = new Function(`return (${src})`)();
  const card = document.createElement("kage-home-card");
  card.setConfig({});
  window.__hass = make("en");
  card.hass = window.__hass;
  document.body.appendChild(card);
}, demoHass.toString());
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/1-home.png` });

const click = async (selector) => {
  await page.evaluate((sel) => {
    const root = document.querySelector("kage-home-card").shadowRoot;
    const el = [...root.querySelectorAll(sel.css)].find(
      (e) => !sel.text || e.textContent.includes(sel.text),
    );
    el.click();
  }, selector);
  await page.waitForTimeout(900);
};

await click({ css: ".floor-card", text: "FIRST FLOOR" });
await click({ css: ".room-chip, .tag", text: "Master Bedroom" });
await page.screenshot({ path: `${out}/2-master.png` });
await click({ css: ".tile.media .more" });
await page.screenshot({ path: `${out}/2b-media-list.png` });
await click({ css: ".back" });
await click({ css: ".tile.blind .more" });
await page.screenshot({ path: `${out}/3-blinds-list.png` });
await click({ css: ".back" });
await click({ css: ".room-chip, .tag", text: "Bathroom" });
await page.screenshot({ path: `${out}/4-bathroom.png` });
await click({ css: ".floor-card", text: "GROUND FLOOR" });
await click({ css: ".side" });
await page.screenshot({ path: `${out}/5-outdoors.png` });

// Poza domem: osoba zalogowanego użytkownika wychodzi, w domu zostaje Jo.
const setStates = async (changes) => {
  await page.evaluate((changes) => {
    const card = document.querySelector("kage-home-card");
    const h = card.hass;
    const states = { ...h.states };
    for (const [id, state] of Object.entries(changes)) states[id] = { ...states[id], state };
    window.__hass = { ...h, states, callService: h.callService, calls: h.calls };
    card.hass = window.__hass;
  }, changes);
  await page.waitForTimeout(700);
};
await setStates({ "person.demo": "not_home" });
await page.screenshot({ path: `${out}/6-away.png`, fullPage: true });
await click({ css: ".secure" });
await page.screenshot({ path: `${out}/7-secure.png`, fullPage: true });
await setStates({
  "light.bathroom_lights": "off",
  "light.bathroom_main": "off",
  "light.bathroom_mirror": "off",
  "binary_sensor.bedroom_2_window": "off",
  "alarm_control_panel.home": "armed_away",
  "switch.kitchen_socket": "off",
  "sensor.house_power": "120",
  "person.jo": "not_home",
});
await page.screenshot({ path: `${out}/8-away-ok.png`, fullPage: true });
await setStates({ "binary_sensor.utility_leak": "on" });
await page.screenshot({ path: `${out}/9-leak.png`, fullPage: true });

// Tablet i laptop: ten sam dom w szerokim oknie.
await setStates({
  "person.demo": "home",
  "person.jo": "home",
  "binary_sensor.utility_leak": "off",
});
await page.setViewportSize({ width: 1180, height: 820 });
await page.waitForTimeout(900);
await click({ css: ".floor-card", text: "FIRST FLOOR" });
await page.screenshot({ path: `${out}/10-tablet.png` });
await click({ css: ".room-chip, .tag", text: "Master Bedroom" });
await page.screenshot({ path: `${out}/11-tablet-master.png` });
await setStates({ "person.demo": "not_home" });
await page.screenshot({ path: `${out}/12-tablet-away.png` });
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/13-laptop-away.png` });

// Edytor rzutu (administrator, laptop): kształt L, pusty obszar, zapis.
await click({ css: ".edit-plan" });
await page.screenshot({ path: `${out}/14-editor.png` });
const ed = async (sel, text) =>
  page.evaluate(
    ({ sel, text }) => {
      const root = document.querySelector("kage-home-card").shadowRoot;
      const edEl = root.querySelector("kage-plan-editor").shadowRoot;
      const el = [...edEl.querySelectorAll(sel)].find((e) => !text || e.textContent.includes(text));
      el.click();
    },
    { sel, text },
  );
await ed(".name", "Master Bedroom");
await page.waitForTimeout(300);
await ed(".act", "L");
await ed(".act", "empty area");
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/15-editor-l.png` });
await ed(".act.primary");
await page.waitForTimeout(800);
const saved = await page.evaluate(() => window.__hass.saved);
await page.screenshot({ path: `${out}/16-after-save.png` });
console.log(JSON.stringify(saved?.strategy?.plan?.floors?.first?.rooms?.master ?? null));

const calls = await page.evaluate(() => window.__hass.calls);
await browser.close();
console.log(JSON.stringify({ errors, calls }, null, 2));
process.exit(errors.length ? 1 : 0);
