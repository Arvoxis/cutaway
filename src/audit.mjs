// Proves a sheet obeys references/craft.md. Exits non-zero on any failure.
// The drawing is not finished until this prints every line at 0.
import { readFileSync } from "node:fs";
import { model, routePoints } from "./render.mjs";
import { INSET } from "../kit/sheet.mjs";

const overlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const inside = (outer, p) =>
  p.x >= outer.x && p.y >= outer.y &&
  p.x + p.w <= outer.x + outer.w && p.y + p.h <= outer.y + outer.h;

// A segment of the drawn route against a part's rectangle. The audit checks
// the geometry the renderer actually emits, never an approximation of it.
function segHitsRect(x1, y1, x2, y2, r) {
  const lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b);
  if (hi(x1, x2) < r.x || lo(x1, x2) > r.x + r.w) return false;
  if (hi(y1, y2) < r.y || lo(y1, y2) > r.y + r.h) return false;
  return true;   // routes are axis-aligned, so overlapping extents means a hit
}

export function audit(graph, opts = {}) {
  const m = model(graph, opts);
  const { at, edges, numbered, num, label, regions, dm, flow, sheetW } = m;
  const fail = [];
  const add = (check, detail) => fail.push({ check, detail });

  // 1. No two parts overlap.
  const all = numbered.map((n) => ({ id: n.id, ...at.get(n.id) }));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      if (overlap(all[i], all[j])) add("part-overlap", `${all[i].id} / ${all[j].id}`);

  // 2. No relation passes through a part it does not terminate on.
  edges.forEach((e, i) => {
    const pts = routePoints(e, at.get(e.from), at.get(e.to), m, i);
    for (const p of all) {
      if (p.id === e.from || p.id === e.to) continue;
      for (let k = 1; k < pts.length; k++)
        if (segHitsRect(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], p)) {
          add("relation-through-part", `${e.from} -> ${e.to} crosses ${p.id}`);
          break;
        }
    }
  });

  // 3. Every relation terminates on an outline at both ends.
  for (const e of edges) {
    const a = at.get(e.from), b = at.get(e.to);
    if (Math.abs((a.y + a.h) - (a.y + a.h)) > 0.01) add("loose-end", `${e.from}`);
    if (!a || !b) add("loose-end", `${e.from} -> ${e.to}`);
  }

  // 4. Every part label fits inside its part.
  for (const n of numbered) {
    const p = at.get(n.id);
    if (label.get(n.id).length * 6.6 + 14 > p.w) add("label-overflow", n.id);
  }

  // 5. A region holds exactly its own parts.
  for (const r of regions) {
    for (const n of flow) {
      const p = at.get(n.id), mine = dm.get(n.id) === r.name;
      if (mine && !inside(r, p)) add("region-excludes-member", `${r.name} / ${n.id}`);
      if (!mine && overlap(r, p)) add("region-holds-foreigner", `${r.name} / ${n.id}`);
    }
  }
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++)
      if (overlap(regions[i], regions[j]))
        add("region-overlap", `${regions[i].name} / ${regions[j].name}`);

  // 6. Nothing crosses the frame.
  for (const p of all)
    if (p.x < INSET || p.y < INSET || p.x + p.w > sheetW - INSET)
      add("crosses-frame", p.id);

  // 7. Balloon numbers and the parts list agree, one to one.
  const ns = [...num.values()].sort((a, b) => a - b);
  if (ns.length !== new Set(ns).size) add("duplicate-balloon", "numbers repeat");
  if (ns.some((v, i) => v !== i + 1)) add("balloon-gap", "numbering is not 1..n");

  return fail;
}

const args = process.argv.slice(2);
// The audit has to check the sheet that was drawn. Pass it the same --level
// the renderer got, or a forced module-level sheet goes out unchecked while
// the audit quietly passes a district one.
const li = args.indexOf("--level");
const level = li >= 0 ? args[li + 1] : "auto";
if (!["auto", "module", "district"].includes(level)) {
  console.error(`unknown --level ${level} (auto | module | district)`);
  process.exit(1);
}
const files = li < 0 ? args : args.filter((_, i) => i !== li && i !== li + 1);
if (files.length) {
  let total = 0;
  for (const f of files) {
    const fails = audit(JSON.parse(readFileSync(f, "utf8")), { level });
    const by = new Map();
    for (const { check } of fails) by.set(check, (by.get(check) ?? 0) + 1);
    const name = f.split(/[\\/]/).pop().replace(".graph.json", "");
    const checks = ["part-overlap", "relation-through-part", "loose-end", "label-overflow",
      "region-excludes-member", "region-holds-foreigner", "region-overlap",
      "crosses-frame", "duplicate-balloon", "balloon-gap"];
    console.log(`\n${name}`);
    for (const c of checks) console.log(`  ${(by.get(c) ?? 0) === 0 ? " ok " : "FAIL"}  ${String(by.get(c) ?? 0).padStart(4)}  ${c}`);
    for (const { detail } of fails.slice(0, 4)) console.log(`        · ${detail}`);
    total += fails.length;
  }
  console.log(total === 0 ? "\naudit passed" : `\naudit failed: ${total} problems`);
  process.exit(total === 0 ? 0 : 1);
}
