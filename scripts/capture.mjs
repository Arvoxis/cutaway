// Headless screenshots of a built sheet. Read every PNG before accepting a change.
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";

const [, , page, outDir = "shots"] = process.argv;
if (!page) { console.error("usage: node scripts/capture.mjs <page.html> [outDir]"); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const name = basename(page, ".html");
const browser = await puppeteer.launch({ headless: "new" });
const tab = await browser.newPage();
await tab.goto("file:///" + resolve(page).split("\\").join("/"), { waitUntil: "networkidle0" });

for (const [label, width] of [["sheet", 1760], ["phone", 390]]) {
  await tab.setViewport({ width, height: 1000, deviceScaleFactor: label === "phone" ? 2 : 1 });
  const file = `${outDir}/${name}-${label}.png`;
  // Clip to the sheet, not the viewport: the sheet sets its own width and a
  // wider viewport would just pad the PNG with empty margin.
  const svg = await tab.$("svg");
  await (label === "sheet" && svg ? svg : tab).screenshot(
    label === "sheet" && svg ? { path: file } : { path: file, fullPage: true });
  console.log(`  ${file}`);
}
await browser.close();
