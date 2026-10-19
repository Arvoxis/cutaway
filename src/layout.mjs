// Layered layout. Rows are dependency depth (foundations at the bottom),
// columns keep a district's modules adjacent. Barycenter sweeps cut crossings.
// ponytail: districts are directories. Real repos already encode their own
// community structure; Louvain is unearned until a repo's dirs demonstrably lie.

export function districtOf(id) {
  return id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "(root)";
}

// A package's __init__ belongs to the package it names, not to the parent
// directory. Without this, `fastapi` (from fastapi/__init__.py) lands in a
// "(root)" district of its own, gets its own column at the far edge of the
// sheet, and every one of its relations crosses the whole drawing.
export function districtMap(ids, { max = 8 } = {}) {
  const isPackage = (id) => ids.some((o) => o.startsWith(id + "/"));
  const full = new Map(ids.map((id) => [id, isPackage(id) ? id : districtOf(id)]));

  // One column per district stops working past roughly eight columns -- the
  // sheet grows wider than any screen and scales down until labels vanish.
  // Fold the smallest, deepest districts into their parents rather than
  // truncating every district to the same depth: lib/platform/browser/classes
  // should become lib/platform without dragging lib/core down with it.
  const out = new Map(full);
  const tally = () => {
    const c = new Map();
    for (const [, d] of out) c.set(d, (c.get(d) ?? 0) + 1);
    return c;
  };
  for (let guard = 0; guard < 200; guard++) {
    const count = tally();
    if (count.size <= max) break;
    const mergeable = [...count.keys()].filter((d) => d.includes("/"));
    if (!mergeable.length) break;
    mergeable.sort((a, b) =>
      b.split("/").length - a.split("/").length || count.get(a) - count.get(b));
    const victim = mergeable[0];
    const parent = victim.slice(0, victim.lastIndexOf("/"));
    for (const [id, d] of out) if (d === victim) out.set(id, parent);
  }
  return out;
}

// depth = longest chain of internal dependencies beneath a module.
// Leaves (import nothing internal) sit at 0 and read as the foundation.
export function depths(nodes, edges) {
  const deps = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) deps.get(e.from)?.push(e.to);

  const depth = new Map(), state = new Map();
  const walk = (id) => {
    if (depth.has(id)) return depth.get(id);
    if (state.get(id) === 1) return 0;          // back edge: cycle, treat as floor
    state.set(id, 1);
    let d = 0;
    for (const t of deps.get(id) ?? []) if (t !== id) d = Math.max(d, walk(t) + 1);
    state.set(id, 2);
    depth.set(id, d);
    return d;
  };
  for (const n of nodes) walk(n.id);
  return depth;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

export function layout(nodes, edges, { sweeps = 6 } = {}) {
  const depth = depths(nodes, edges);
  const rows = new Map();
  for (const n of nodes) {
    const d = depth.get(n.id);
    if (!rows.has(d)) rows.set(d, []);
    rows.get(d).push(n.id);
  }

  // Neighbours in both directions, for barycenter ordering.
  const nbr = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) { nbr.get(e.from)?.push(e.to); nbr.get(e.to)?.push(e.from); }

  const order = new Map();                       // id -> x index within its row
  // Seed: group each row by district so members start adjacent.
  for (const [, ids] of rows) {
    ids.sort((a, b) => districtOf(a).localeCompare(districtOf(b)) || a.localeCompare(b));
    ids.forEach((id, i) => order.set(id, i));
  }

  // Barycenter sweeps, but a node may not leave its district's block:
  // sort districts by their barycenter, then nodes inside each district.
  const depthList = [...rows.keys()].sort((a, b) => a - b);
  for (let s = 0; s < sweeps; s++) {
    for (const d of (s % 2 ? [...depthList].reverse() : depthList)) {
      const ids = rows.get(d);
      const bary = (id) => {
        const xs = (nbr.get(id) ?? []).filter((t) => order.has(t)).map((t) => order.get(t));
        return xs.length ? mean(xs) : order.get(id);
      };
      const blocks = new Map();
      for (const id of ids) {
        const k = districtOf(id);
        if (!blocks.has(k)) blocks.set(k, []);
        blocks.get(k).push(id);
      }
      const sorted = [...blocks.entries()]
        .map(([k, v]) => [k, v.sort((a, b) => bary(a) - bary(b)), mean(v.map(bary))])
        .sort((a, b) => a[2] - b[2]);
      let i = 0;
      const next = [];
      for (const [, v] of sorted) for (const id of v) { order.set(id, i++); next.push(id); }
      rows.set(d, next);
    }
  }

  return { depth, rows, order, maxRow: Math.max(...rows.values(), []).length };
}

export function crossings(edges, depth, order) {
  // Count pairs of edges that cross between adjacent layers. The layout's score.
  const byGap = new Map();
  for (const e of edges) {
    const k = `${depth.get(e.from)}|${depth.get(e.to)}`;
    if (!byGap.has(k)) byGap.set(k, []);
    byGap.get(k).push(e);
  }
  let n = 0;
  for (const [, es] of byGap) {
    for (let i = 0; i < es.length; i++)
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i], b = es[j];
        const a1 = order.get(a.from), a2 = order.get(a.to);
        const b1 = order.get(b.from), b2 = order.get(b.to);
        if ((a1 - b1) * (a2 - b2) < 0) n++;
      }
  }
  return n;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Give every node an x in one shared coordinate space, so an edge's ends sit
// near each other and long sweeps straighten out. Median-of-neighbours,
// relaxed, with the row's left-to-right order held fixed.
export function coords(nodes, edges, { rows, order }, widthOf, { gap = 18, passes = 24 } = {}) {
  const x = new Map();
  for (const [, ids] of rows) {
    let cx = 0;
    for (const id of ids) { x.set(id, cx + widthOf(id) / 2); cx += widthOf(id) + gap; }
  }

  const up = new Map(nodes.map((n) => [n.id, []]));
  const down = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) { up.get(e.from)?.push(e.to); down.get(e.to)?.push(e.from); }

  const rowList = [...rows.keys()].sort((a, b) => a - b);
  for (let p = 0; p < passes; p++) {
    const dirs = p % 2 ? [...rowList].reverse() : rowList;
    for (const d of dirs) {
      const ids = rows.get(d);
      for (const id of ids) {
        const nb = [...(up.get(id) ?? []), ...(down.get(id) ?? [])].map((t) => x.get(t)).filter((v) => v != null);
        const m = median(nb);
        if (m != null) x.set(id, (x.get(id) + m) / 2);     // damped, avoids oscillation
      }
      // Restore minimum spacing without changing the row's order.
      const sorted = [...ids].sort((a, b) => order.get(a) - order.get(b));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], cur = sorted[i];
        const need = x.get(prev) + widthOf(prev) / 2 + gap + widthOf(cur) / 2;
        if (x.get(cur) < need) x.set(cur, need);
      }
      for (let i = sorted.length - 2; i >= 0; i--) {
        const next = sorted[i + 1], cur = sorted[i];
        const cap = x.get(next) - widthOf(next) / 2 - gap - widthOf(cur) / 2;
        if (x.get(cur) > cap) x.set(cur, cap);
      }
    }
  }
  return x;
}

// Shortest unambiguous label: "utils" when unique, else "openapi/utils".
export function labels(ids) {
  const seen = new Map();
  for (const id of ids) {
    const base = id.split("/").pop();
    seen.set(base, (seen.get(base) ?? 0) + 1);
  }
  return new Map(ids.map((id) => {
    const parts = id.split("/"), base = parts.pop();
    return [id, seen.get(base) > 1 && parts.length ? `${parts.pop()}/${base}` : base];
  }));
}

// Which imports actually create the cycles. Marking every edge inside a
// strongly-connected component is correct but useless -- one big SCC dashes
// 80-90% of a real sheet. The back edges of a DFS are the minimal set whose
// removal breaks every cycle, which is the thing a reader can act on.
export function cyclicEdges(nodes, edges) {
  const succ = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) succ.get(e.from)?.push(e.to);

  const back = new Set(), seen = new Set(), onPath = new Set();
  for (const root of nodes.map((n) => n.id)) {
    if (seen.has(root)) continue;
    const work = [[root, 0]];
    seen.add(root); onPath.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const kids = succ.get(frame[0]) ?? [];
      if (frame[1] < kids.length) {
        const w = kids[frame[1]++];
        if (onPath.has(w)) back.add(`${frame[0]} ${w}`);
        else if (!seen.has(w)) { seen.add(w); onPath.add(w); work.push([w, 0]); }
      } else { onPath.delete(frame[0]); work.pop(); }
    }
  }
  return back;
}

// Districts as columns, dependency depth as rows. Regions cannot overlap when
// a district owns a column outright, which is what the craft spec requires and
// what a free barycentre layout can never guarantee.
export function columns(nodes, edges, widthOf, { gapX = 16, gapCol = 46, maxPerRow = 5, district } = {}) {
  const depth = depths(nodes, edges);
  const dm = district ?? districtMap(nodes.map((n) => n.id));
  const byDistrict = new Map();
  for (const n of nodes) {
    const d = dm.get(n.id);
    if (!byDistrict.has(d)) byDistrict.set(d, []);
    byDistrict.get(d).push(n.id);
  }

  const nbr = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) { nbr.get(e.from)?.push(e.to); nbr.get(e.to)?.push(e.from); }

  // Columns ordered by mean depth: deep foundations to one side, the entry
  // district to the other, and the core — which spans every layer — in between.
  const meanDepth = (ids) => ids.reduce((a, id) => a + depth.get(id), 0) / ids.length;
  const order = [...byDistrict.entries()].sort((a, b) => meanDepth(b[1]) - meanDepth(a[1]));

  const place = new Map();                     // id -> { col, row, slot, x, w }
  const colWidth = new Map();
  const rowsOf = new Map();                    // district -> depth -> ids
  for (const [d, ids] of order) {
    const rows = new Map();
    for (const id of ids) {
      const r = depth.get(id);
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r).push(id);
    }
    for (const [, rowIds] of rows) rowIds.sort((a, b) => a.localeCompare(b));
    rowsOf.set(d, rows);
  }

  // A layer with thirty modules in it would make one column wider than any
  // sheet, and the whole drawing then scales down until the labels vanish.
  // Wrap a long layer across sub-rows instead, the way a parts shelf wraps.
  const depthsDesc = [...new Set(nodes.map((n) => depth.get(n.id)))].sort((a, b) => b - a);
  const subRows = new Map();                   // depth -> how many sub-rows it needs
  for (const r of depthsDesc) {
    let n = 1;
    for (const [d] of order) n = Math.max(n, Math.ceil((rowsOf.get(d).get(r)?.length ?? 0) / maxPerRow));
    subRows.set(r, n);
  }
  const slotBase = new Map();
  let slot = 0;
  for (const r of depthsDesc) { slotBase.set(r, slot); slot += subRows.get(r); }
  const slotCount = slot;

  const colXs = new Map();
  let sheetSpan = 0;

  // Chunk membership changes when a row is reordered, so a column's width is
  // order-dependent and has to be recomputed with the placement. Computing it
  // once up front let a reshuffled chunk overflow into the next column.
  const assign = () => {
    for (const [d] of order) {
      let w = 0;
      for (const [, rowIds] of rowsOf.get(d))
        for (let i = 0; i < rowIds.length; i += maxPerRow) {
          const chunk = rowIds.slice(i, i + maxPerRow);
          w = Math.max(w, chunk.reduce((a, id) => a + widthOf(id), 0) + gapX * (chunk.length - 1));
        }
      colWidth.set(d, w);
    }
    let cx = 0;
    for (const [d] of order) { colXs.set(d, cx); cx += colWidth.get(d) + gapCol; }
    sheetSpan = Math.max(0, cx - gapCol);

    for (const [d] of order) {
      const w = colWidth.get(d);
      for (const [r, rowIds] of rowsOf.get(d)) {
        for (let i = 0; i < rowIds.length; i += maxPerRow) {
          const chunk = rowIds.slice(i, i + maxPerRow);
          const total = chunk.reduce((a, id) => a + widthOf(id), 0) + gapX * (chunk.length - 1);
          let x = colXs.get(d) + (w - total) / 2;
          for (const id of chunk) {
            place.set(id, { col: d, row: r, slot: slotBase.get(r) + i / maxPerRow, x, w: widthOf(id) });
            x += widthOf(id) + gapX;
          }
        }
      }
    }
  };
  assign();

  // Order inside a row by where that module's neighbours actually sit.
  // Alphabetical order here was costing a lot of horizontal travel: two modules
  // that talk to each other ended up at opposite ends of their column.
  const centre = (id) => { const p = place.get(id); return p.x + p.w / 2; };
  for (let pass = 0; pass < 8; pass++) {
    for (const [d] of order)
      for (const [, rowIds] of rowsOf.get(d))
        rowIds.sort((a, b) => {
          const bary = (id) => {
            const xs = (nbr.get(id) ?? []).map(centre).filter((v) => v != null);
            return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : centre(id);
          };
          return bary(a) - bary(b);
        });
    assign();
  }

  return { depth, place, colX: colXs, colWidth, slotCount, order: order.map(([d]) => d), width: sheetSpan };
}
