// Collapse modules into their districts, for repos too large to draw module
// by module. hono is 237 modules and 531 relations: drawn in full it is a
// 4300px wall poster nobody reads. Drawn as districts it is 40 parts that
// answer the question an architecture sheet is actually asked -- what areas
// exist here, and which lean on which.
import { districtMap } from "./layout.mjs";

export function toDistricts(nodes, edges, { max = 36 } = {}) {
  const dm = districtMap(nodes.map((n) => n.id), { max });

  const member = new Map();
  for (const n of nodes) {
    const d = dm.get(n.id);
    if (!member.has(d)) member.set(d, []);
    member.get(d).push(n);
  }

  const dNodes = [...member].map(([id, mods]) => ({
    id,
    path: id,
    loc: mods.reduce((a, m) => a + m.loc, 0),
    churn: mods.reduce((a, m) => a + m.churn, 0),
    modules: mods.length,
    // The members become the district's symbol list, so a reader can still
    // find which part of the sheet a given module landed in.
    symbols: mods.map((m) => m.id.split("/").pop()).sort(),
    role: "source",
  }));

  // Relations inside a district are internal detail at this zoom and are
  // dropped; relations between districts carry the summed import count, so
  // the heavy-relation weight still means what it means on a module sheet.
  const w = new Map();
  for (const e of edges) {
    const a = dm.get(e.from), b = dm.get(e.to);
    if (a == null || b == null || a === b) continue;
    const k = `${a}\u0000${b}`;
    w.set(k, (w.get(k) ?? 0) + e.weight);
  }
  const dEdges = [...w].map(([k, weight]) => {
    const [from, to] = k.split("\u0000");
    return { from, to, weight };
  });

  return { nodes: dNodes, edges: dEdges };
}
