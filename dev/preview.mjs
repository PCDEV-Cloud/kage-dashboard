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
await click({ css: ".tile.blind .more" });
await page.screenshot({ path: `${out}/3-blinds-list.png` });
await click({ css: ".back" });
await click({ css: ".room-chip, .tag", text: "Bathroom" });
await page.screenshot({ path: `${out}/4-bathroom.png` });
await click({ css: ".floor-card", text: "GROUND FLOOR" });
await click({ css: ".side" });
await page.screenshot({ path: `${out}/5-outdoors.png` });

const calls = await page.evaluate(() => window.__hass.calls);
await browser.close();
console.log(JSON.stringify({ errors, calls }, null, 2));
process.exit(errors.length ? 1 : 0);
