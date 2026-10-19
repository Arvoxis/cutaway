// A 1:1 detail crop of a sheet, for the README. A whole sheet shrunk to
// README width is an unreadable smudge; a crop at full scale shows the craft.
import puppeteer from "puppeteer";
import { resolve } from "node:path";

const [, , page, out, x = 0, y = 0, w = 1380, h = 620, scale = 2] = process.argv;
if (!page || !out) { console.error("usage: node scripts/crop.mjs <page.html> <out.png> [x y w h scale]"); process.exit(1); }

const browser = await puppeteer.launch({ headless: "new" });
const tab = await browser.newPage();
await tab.setViewport({ width: 1900, height: 1200, deviceScaleFactor: +scale });
await tab.goto("file:///" + resolve(page).split("\\").join("/"), { waitUntil: "networkidle0" });
const box = await tab.$eval("svg", (s) => { const r = s.getBoundingClientRect(); return { x: r.x, y: r.y }; });
await tab.screenshot({ path: out, clip: { x: box.x + +x, y: box.y + +y, width: +w, height: +h } });
await browser.close();
console.log(`wrote ${out}`);
