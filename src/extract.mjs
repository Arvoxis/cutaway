// Build graph.json from a repo: modules, import edges, churn.
// Python and JS/TS share the walk, churn, roles and graph assembly; only
// parsing and import resolution differ per language.
// ponytail: regex instead of tree-sitter. Import syntax in both languages is
// regular enough. Swap in web-tree-sitter when a repo shows the regex missing
// edges that matter.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SKIP = new Set([
  ".git", "node_modules", "__pycache__", ".venv", "venv", "env",
  "site-packages", "dist", "build", ".tox", ".mypy_cache", ".pytest_cache",
  ".eggs", "migrations", ".next", "coverage", "out", ".cache", "storybook-static",
  "flow-typed", "typings", "__snapshots__",
]);

const EXT = { ".py": "py", ".ts": "js", ".tsx": "js", ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js" };
const extOf = (p) => { const i = p.lastIndexOf("."); return i < 0 ? "" : p.slice(i); };
export const langOf = (p) => EXT[extOf(p)] ?? null;
// A declaration file describes another module rather than being one.
const isSource = (p) => langOf(p) !== null && !p.endsWith(".d.ts");

function walk(dir, root, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, root, out);
    else if (isSource(name)) out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

// "pkg/mod.py" -> "pkg/mod"; "pkg/__init__.py" -> "pkg"; "dir/index.ts" -> "dir".
// An entry file names the directory it sits in, in both languages.
export const moduleId = (p) => {
  const bare = p.slice(0, p.length - extOf(p).length);
  const base = bare.slice(bare.lastIndexOf("/") + 1);
  if (base !== "__init__" && base !== "index") return bare;
  const i = bare.lastIndexOf("/");
  // An entry file at the repo root has no directory to name, so it keeps its
  // own name. Returning "" here produced a part with no label at all.
  return i < 0 ? bare : bare.slice(0, i);
};

// ponytail: path heuristics, not config. A repo that needs overrides can add them later.
const ROLE = [
  [/(^|\/)(vendor|third_party|_vendor)(\/|$)/, "vendor"],
  [/(^|\/)(tests?|__tests__|__mocks__|e2e|spec)(\/|$)|(^|\/)test_[^/]*$|_test$|\.(test|spec)$/, "test"],
  [/(^|\/)(docs?_src|docs?|examples?|samples?|demos?|tutorials?|stories|playground|website)(\/|$)|\.stories$/, "example"],
  [/(^|\/)(scripts?|tools?|bin|ci|config|benchmarks?)(\/|$)/, "script"],
];
const roleOf = (id) => ROLE.find(([re]) => re.test(id))?.[1] ?? "source";

const IMPORT_FROM = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]/;
const IMPORT_PLAIN = /^[ \t]*import[ \t]+([\w.,  ]+)/;
const DEF = /^(class|def|async def)[ \t]+(\w+)/;

function parse(src) {
  const imports = [], symbols = [];
  let loc = 0;
  for (const line of src.split("\n")) {
    if (line.trim() && !line.trim().startsWith("#")) loc++;
    let m = line.match(IMPORT_FROM);
    if (m) { imports.push({ dots: m[1].length, path: m[2] }); continue; }
    m = line.match(IMPORT_PLAIN);
    if (m) {
      for (const part of m[1].split(","))
        imports.push({ dots: 0, path: part.trim().split(/[ \t]+as[ \t]+/)[0] });
      continue;
    }
    m = line.match(DEF);
    if (m) symbols.push(m[2]);
  }
  return { imports, symbols, loc };
}

// The package a file's relative imports resolve against. For a package's
// __init__.py that is the package itself; for a module it is the parent dir.
export function packageOf(file) {
  const id = moduleId(file);
  const isInit = file === "__init__.py" || file.endsWith("/__init__.py");
  return (isInit ? id : id.slice(0, id.lastIndexOf("/") + 1)).split("/").filter(Boolean);
}

// Map a dotted import to an internal module id, or null if external.
export function resolve(imp, pkg, fromId, known) {
  let base;
  if (imp.dots > 0) {
    // relative: one dot = current package, each extra dot climbs one level
    const parts = pkg.slice();
    for (let i = 1; i < imp.dots; i++) parts.pop();
    base = [...parts, ...(imp.path ? imp.path.split(".") : [])].filter(Boolean).join("/");
  } else {
    base = imp.path.split(".").join("/");
  }
  // Longest prefix that is a real module: "a/b/c" may be a symbol inside "a/b".
  // Stop at the first (longest) match. Falling through to a shorter prefix would
  // invent a dependency on the parent package that the source never declared.
  const parts = base.split("/");
  for (let n = parts.length; n > 0; n--) {
    const cand = parts.slice(0, n).join("/");
    if (known.has(cand)) return cand === fromId ? null : cand;
  }
  return null;
}

// --- JavaScript / TypeScript ---------------------------------------------

// ponytail: four targeted regexes over the whole file, not a parser. A
// specifier inside a string literal can produce a phantom import; that has
// not shown up on a real repo, and a parser is a big dependency to carry for it.
const JS_FROM = /\bfrom\s*['"]([^'"]+)['"]/g;
const JS_BARE = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;
const JS_DYN = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const JS_REQ = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const JS_SYM = /^[ \t]*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+(\w+)/gm;

function parseJs(src) {
  const imports = [], symbols = new Set();
  let loc = 0;
  for (const line of src.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")) loc++;
  }
  for (const re of [JS_FROM, JS_BARE, JS_DYN, JS_REQ]) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(src));) imports.push({ spec: m[1] });
  }
  JS_SYM.lastIndex = 0;
  for (let m; (m = JS_SYM.exec(src));) symbols.add(m[1]);
  return { imports, symbols: [...symbols], loc };
}

const normalize = (parts) => {
  const out = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
};

// Only relative specifiers are internal. A bare specifier is a package, and
// tsconfig path aliases ("@/x") are not read — they would need the tsconfig,
// and the repos drawn so far do not use them.
export function resolveJs(spec, fromFile, known) {
  if (!spec.startsWith(".")) return null;
  const dir = fromFile.slice(0, fromFile.lastIndexOf("/") + 1);
  let base = normalize((dir + spec).split("/"));
  const e = extOf(base);
  if (EXT[e]) base = base.slice(0, base.length - e.length);     // "./x.js" -> "x"
  const fromId = moduleId(fromFile);
  if (base === fromId) return null;
  return known.has(base) ? base : null;
}

function churnOf(root, files) {
  // ponytail: last 2000 commits only. Deep history costs seconds and changes nothing.
  const counts = new Map();
  try {
    const log = execFileSync("git", ["-C", root, "log", "-n", "2000", "--name-only", "--format="],
      { encoding: "utf8", maxBuffer: 1 << 28 });
    for (const line of log.split("\n")) {
      const p = line.trim();
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  } catch { /* not a git repo: churn stays 0 */ }
  return Object.fromEntries(files.map((f) => [f, counts.get(f) ?? 0]));
}

function head(root) {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch { return null; }
}

export function extract(root) {
  const files = walk(root, root);
  if (!files.length) throw new Error(`no Python or JS/TS source files under ${root}`);

  const parsed = new Map();
  for (const f of files) {
    const src = readFileSync(join(root, f), "utf8");
    parsed.set(f, langOf(f) === "js" ? parseJs(src) : parse(src));
  }

  const known = new Set(files.map(moduleId));
  const churn = churnOf(root, files);

  const nodes = files.map((f) => ({
    id: moduleId(f),
    path: f,
    loc: parsed.get(f).loc,
    symbols: parsed.get(f).symbols,
    churn: churn[f],
    role: roleOf(moduleId(f)),
  }));

  const edgeWeight = new Map();
  for (const f of files) {
    const from = moduleId(f);
    const js = langOf(f) === "js";
    const pkg = js ? null : packageOf(f);
    for (const imp of parsed.get(f).imports) {
      const to = js ? resolveJs(imp.spec, f, known) : resolve(imp, pkg, from, known);
      if (!to) continue;
      const key = `${from}\u0000${to}`;
      edgeWeight.set(key, (edgeWeight.get(key) ?? 0) + 1);
    }
  }
  const edges = [...edgeWeight].map(([k, weight]) => {
    const [from, to] = k.split("\u0000");
    return { from, to, weight };
  });

  return {
    root: root.split(sep).pop(),
    commit: head(root),
    generatedAt: new Date().toISOString().slice(0, 10),
    nodes, edges,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , repo, outFlag, outPath] = process.argv;
  if (!repo) { console.error("usage: node src/extract.mjs <repo> [--out graph.json]"); process.exit(1); }
  const g = extract(repo);
  const out = outFlag === "--out" ? outPath : "graph.json";
  writeFileSync(out, JSON.stringify(g, null, 2));
  const byRole = {};
  for (const n of g.nodes) byRole[n.role] = (byRole[n.role] ?? 0) + 1;
  const src = new Set(g.nodes.filter((n) => n.role === "source").map((n) => n.id));
  const srcEdges = g.edges.filter((e) => src.has(e.from) && src.has(e.to)).length;
  console.log(`${g.root}@${g.commit ?? "no-git"} -> ${out}`);
  console.log(`  ${g.nodes.length} modules, ${g.edges.length} edges`);
  console.log(`  by role: ${Object.entries(byRole).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`  source only: ${src.size} modules, ${srcEdges} edges  <- what the sheet draws`);
}
