// Rebuild every example sheet from its repo. The gallery is the README, so it
// has to be reproducible rather than a folder of stale screenshots.
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync, renameSync } from "node:fs";

const REPOS = [
  ["fastapi", "https://github.com/fastapi/fastapi"],
  ["flask", "https://github.com/pallets/flask"],
  ["requests", "https://github.com/psf/requests"],
  ["httpx", "https://github.com/encode/httpx"],
  ["axios", "https://github.com/axios/axios"],
  ["express", "https://github.com/expressjs/express"],
];

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

mkdirSync("examples", { recursive: true });
const rows = [];

for (const [name, url] of REPOS) {
  const repo = `.corpus/${name}`;
  if (!existsSync(repo)) {
    process.stdout.write(`cloning ${name}\n`);
    run("git", ["clone", "-q", "--filter=blob:none", url, repo]);
  }
  const dir = `examples/${name}`;
  mkdirSync(dir, { recursive: true });

  const summary = run("node", ["src/extract.mjs", repo, "--out", `${dir}/graph.json`]);
  run("node", ["src/render.mjs", `${dir}/graph.json`, `${dir}/sheet.html`]);
  run("node", ["src/audit.mjs", `${dir}/graph.json`]);          // throws if it fails
  run("node", ["scripts/capture.mjs", `${dir}/sheet.html`, dir]);
  renameSync(`${dir}/sheet-sheet.png`, `${dir}/sheet.png`);

  const parts = /(\d+) modules, (\d+) edges  <- what the sheet draws/.exec(summary);
  rows.push({ name, url, modules: +(parts?.[1] ?? 0), edges: +(parts?.[2] ?? 0) });
  process.stdout.write(`  ${name}: ${parts?.[1]} modules, ${parts?.[2]} relations, audit passed\n`);
}

writeFileSync("examples/index.json", JSON.stringify(rows, null, 2));
console.log(`\n${rows.length} sheets rebuilt, all audits green`);
