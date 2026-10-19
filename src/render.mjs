// Draw a graph.json as a drafting sheet. Implements references/craft.md.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { columns, districtMap, labels, cyclicEdges } from "./layout.mjs";
import { toDistricts } from "./reduce.mjs";
import * as K from "../kit/sheet.mjs";

const ROW = 92, PARTH = 26, MARGIN = 54, GAPX = 16;

// Past this many modules a module-level sheet stops being a page and becomes
// a wall poster, so the drawing zooms out to districts instead.
export const MODULE_LIMIT = 120;

export function model(graph, { role = "source", level = "auto" } = {}) {
  let nodes = graph.nodes.filter((n) => n.role === role);
  let ids = new Set(nodes.map((n) => n.id));
  let edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);

  const zoom = level === "auto" ? (nodes.length > MODULE_LIMIT ? "district" : "module") : level;
  if (zoom === "district") {
    const moduleCount = nodes.length;
    ({ nodes, edges } = toDistricts(nodes, edges));
    ids = new Set(nodes.map((n) => n.id));
    nodes.moduleCount = moduleCount;
  }

  const degree = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    degree.set(e.from, degree.get(e.from) + 1);
    degree.set(e.to, degree.get(e.to) + 1);
  }
  const isolated = nodes.filter((n) => degree.get(n.id) === 0);
  const flow = nodes.filter((n) => degree.get(n.id) > 0);
  
  const label = labels(nodes.map((n) => n.id));
  // A district part carries how many modules it stands for; without it the
  // overview hides exactly the thing that made it necessary.
  if (zoom === "district")
    for (const n of nodes) label.set(n.id, `${label.get(n.id)} ×${n.modules}`);
  const widthOf = (id) => Math.max(58, label.get(id).length * 6.6 + 20);

  const dm = districtMap(nodes.map((n) => n.id));
  const cyclic = cyclicEdges(flow, edges);
  // How many modules a wrapped layer holds decides the sheet's proportions:
  // narrow rows give a tall ribbon, wide rows a letterbox. Try a few and keep
  // whichever lands closest to a landscape sheet.
  const TARGET = 1.3;
  let best = null;
  for (let per = 4; per <= 10; per++) {
    const c = columns(flow, edges, widthOf, { gapX: GAPX, maxPerRow: per, district: dm, back: cyclic });
    const w = c.width + MARGIN * 2, h = MARGIN + 34 + c.slotCount * ROW;
    const score = Math.abs(Math.log((w / h) / TARGET));
    if (!best || score < best.score) best = { c, score };
  }
  const { depth, place, colX, colWidth, order, slotCount, width: drawW } = best.c;

  // Rows: deepest dependency layer at the bottom, the entry point on top.
  const rowsUsed = [...new Set(flow.map((n) => depth.get(n.id)))].sort((a, b) => b - a);
  const slotY = (slot) => MARGIN + 34 + slot * ROW;
  const flowBottom = MARGIN + 34 + slotCount * ROW;

  const at = new Map();
  for (const n of flow) {
    const p = place.get(n.id);
    at.set(n.id, { x: MARGIN + p.x, y: slotY(p.slot), w: p.w, h: PARTH });
  }

  // Standalone strip, wrapped under a rule.
  const sheetW = Math.max(760, MARGIN * 2 + drawW);
  let sx = MARGIN, sy = flowBottom + 44, stripRows = isolated.length ? 1 : 0;
  for (const n of isolated) {
    const w = widthOf(n.id);
    if (sx + w > sheetW - MARGIN) { sx = MARGIN; sy += 34; stripRows++; }
    at.set(n.id, { x: sx, y: sy, w, h: PARTH });
    sx += w + GAPX;
  }
  const bodyBottom = isolated.length ? sy + PARTH : flowBottom;

  // Reading order: top-left to bottom-right, so the parts list walks the
  // architecture in dependency order.
  const numbered = [...flow, ...isolated].sort((a, b) => {
    const A = at.get(a.id), B = at.get(b.id);
    return A.y - B.y || A.x - B.x;
  });
  const num = new Map(numbered.map((n, i) => [n.id, i + 1]));

  // Hatch by churn percentile among drawn parts.
  const churns = [...nodes.map((n) => n.churn)].sort((a, b) => a - b);
  const pct = (v) => churns.length ? churns.filter((c) => c < v).length / churns.length : 0;

  // One accent: the entry point — deepest layer, most dependencies.
  const top = rowsUsed[0];
  const entry = flow.filter((n) => depth.get(n.id) === top)
    .sort((a, b) => edges.filter((e) => e.from === b.id).length - edges.filter((e) => e.from === a.id).length)[0];

  // One channel offset per part, not per relation. Everything leaving a part
  // then shares a single horizontal trunk that branches off at each lane,
  // instead of drawing one more full-width line per relation.
  const portOff = new Map();
  {
    const byRow = new Map();
    for (const n of flow) {
      const r = place.get(n.id).slot;
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r).push(n.id);
    }
    for (const [, ids] of byRow) {
      ids.sort((a, b) => at.get(a).x - at.get(b).x);
      ids.forEach((id, i) => portOff.set(id, 12 + (i % 6) * 7));
    }
  }

  // Free vertical corridors. No part ever sits between two district columns,
  // so a relation can always travel down one of these without crossing
  // anything. This is what makes orthogonal routing possible at all.
  const lanes = [MARGIN - 22];
  for (const d of order) lanes.push(MARGIN + colX.get(d) + colWidth.get(d) + 23);

  // Regions: a district owns its column outright, so these cannot overlap.
  // A district holding nearly every part is the sheet rather than a district:
  // its dash-dot border runs just inside the frame and doubles it, which is
  // noise for the same reason a border around a single part is. Drop it and
  // let the districts that do mark something out carry the structure.
  const regions = order
    .filter((d) => {
      const n = flow.filter((x) => dm.get(x.id) === d).length;
      return n > 1 && n <= flow.length * (2 / 3);
    })
    .map((d) => {
      const mine = flow.filter((n) => dm.get(n.id) === d).map((n) => at.get(n.id));
      const x = MARGIN + colX.get(d) - 10, w = colWidth.get(d) + 20;
      const y = Math.min(...mine.map((p) => p.y)) - 22;
      const h = Math.max(...mine.map((p) => p.y + p.h)) - y + 10;
      return { name: d, x, y, w, h };
    });

  return {
    graph, nodes, edges, flow, isolated, numbered, num, at, label, dm, regions, zoom,
    depth, colX, colWidth, order, rowsUsed, entry, pct,
    cyclic, flowBottom, bodyBottom, sheetW, lanes, portOff,
  };
}

// Orthogonal routing. A relation leaves its part downward, runs along the
// channel between two rows, drops down a free inter-column lane, and comes
// back along another channel into the part it points at -- so it never
// crosses a part it does not connect to. Channel offsets are staggered so
// parallel runs stay separate lines rather than one thick smear.
export function routePoints(e, a, b, m, i) {
  const { at, numbered, lanes, portOff } = m;
  // A back edge in an import cycle points up the sheet, so neither the ports
  // nor the channel offsets can assume a downward run.
  const down = b.y > a.y;
  const ax = +(a.x + a.w / 2).toFixed(1), ay = down ? a.y + a.h : a.y;
  const bx = +(b.x + b.w / 2).toFixed(1), by = down ? b.y : b.y + b.h;
  const dir = down ? 1 : -1;

  const blocks = (x, u, v) => {
    const y0 = Math.min(u, v), y1 = Math.max(u, v);
    return numbered.some((n) => {
      if (n.id === e.from || n.id === e.to) return false;
      const p = at.get(n.id);
      return x > p.x - 6 && x < p.x + p.w + 6 && p.y < y1 && p.y + p.h > y0;
    });
  };

  if (Math.abs(ax - bx) < 1.5 && !blocks(ax, ay, by)) return [[ax, ay], [ax, by]];

  const y1 = +(ay + dir * (portOff.get(e.from) ?? 14)).toFixed(1);
  const y2 = +(by - dir * (6 + (portOff.get(e.to) ?? 14))).toFixed(1);

  // Any lane between the two ends costs the same horizontal travel, and that
  // is the least possible; a lane outside the span adds a detour.
  const lo = Math.min(ax, bx), hi = Math.max(ax, bx), mid = (ax + bx) / 2;
  const between = lanes.filter((L) => L >= lo && L <= hi);
  const pool = between.length ? between : lanes;
  const corridor = pool.reduce((best, L) => Math.abs(L - mid) < Math.abs(best - mid) ? L : best, pool[0]);
  // Split each corridor into sub-lanes keyed by destination. Without this
  // every relation through a corridor lands on one x and the corridor draws
  // as a heavy rectangle that competes with the dash-dot region borders.
  const lane = +(corridor + (((portOff.get(e.to) ?? 14) % 3) - 1) * 13).toFixed(1);

  if ((y2 - y1) * dir <= 0) return [[ax, ay], [ax, y1], [bx, y1], [bx, by]];   // adjacent rows
  return [[ax, ay], [ax, y1], [lane, y1], [lane, y2], [bx, y2], [bx, by]];
}

export const pathOf = (pts) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");

export function render(graph, opts) {
  const m = model(graph, opts);
  const { zoom } = m;
  const {
    edges, flow, isolated, numbered, num, at, label, dm,
    order, colX, colWidth, entry, pct, cyclic, flowBottom, bodyBottom, sheetW, rowsUsed, lanes,
  } = m;

  const parts = numbered.map((n) => {
    const p = at.get(n.id);
    return K.part({
      ...p, label: label.get(n.id), n: num.get(n.id),
      hatch: K.hatchFor(pct(n.churn)),
      accent: entry && n.id === entry.id,
    });
  }).join("");

  const relations = edges.map((e, i) => {
    const a = at.get(e.from), b = at.get(e.to);
    const heavy = e.weight >= 3;
    const dash = cyclic.has(`${e.from}\u0000${e.to}`) ? ` stroke-dasharray="${K.DASH.cycle}"` : "";
    return `<path d="${pathOf(routePoints(e, a, b, m, i))}"`
      + ` class="${heavy ? "w-med i72" : "w-thin i45"}"${dash} marker-end="url(#dep)"/>`;
  }).join("");

  const regions = m.regions.map(K.region).join("");

  const strip = isolated.length
    ? `<line x1="${MARGIN}" y1="${flowBottom + 18}" x2="${sheetW - MARGIN}" y2="${flowBottom + 18}" class="w-thin i45"/>`
      + `<text class="t-anno i45" x="${MARGIN}" y="${flowBottom + 34}">re-exports &amp; standalone — no internal relation either way (${isolated.length})</text>`
    : "";

  const listRows = numbered.map((n) => ({ n: num.get(n.id), module: n.id, loc: n.loc, churn: n.churn }));
  const probe = K.partsList(MARGIN, 0, listRows);
  const sheetH = bodyBottom + 56 + probe.height + MARGIN;
  const list = K.partsList(MARGIN, sheetH - K.INSET - 16, listRows);

  const body = K.frame(sheetW, sheetH)
    + regions + relations + parts + strip + list.svg
    + K.titleBlock(sheetW, sheetH, {
      repo: graph.root,
      sheet: "1/1",
      commit: graph.commit,
      date: graph.generatedAt,
      summary: (zoom === "district" ? "district overview · " : "")
        + `${flow.length} parts · ${edges.length} relations · ${rowsUsed.length} layers`
        + (isolated.length ? ` · ${isolated.length} standalone` : ""),
    });

  return K.page({ title: `${graph.root} — cutaway`, body, w: sheetW, h: sheetH });
}

const [, , graphPath, outPath = "out/sheet.html", ...rest] = process.argv;
if (graphPath && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = rest.indexOf("--level");
  const level = i >= 0 ? rest[i + 1] : "auto";
  if (!["auto", "module", "district"].includes(level)) {
    console.error(`unknown --level ${level} (auto | module | district)`);
    process.exit(1);
  }
  const g = JSON.parse(readFileSync(graphPath, "utf8"));
  mkdirSync(dirname(outPath), { recursive: true });
  const m = model(g, { level });
  writeFileSync(outPath, render(g, { level }));
  console.log(`wrote ${outPath} (${m.zoom} level, ${m.flow.length} parts)`);
  // The dashed relations are the most actionable thing on the sheet and are
  // derived here rather than stored in graph.json. Print them, so a reading
  // can name them without anyone having to look at a screenshot.
  const cyc = [...m.cyclic];
  console.log(cyc.length ? `  ${cyc.length} cyclic relation${cyc.length === 1 ? "" : "s"}, drawn dashed:` : "  no import cycles");
  for (const c of cyc.slice(0, 12)) console.log(`    ${c.replace("\u0000", " -> ")}`);
  if (cyc.length > 12) console.log(`    ...and ${cyc.length - 12} more`);
}
