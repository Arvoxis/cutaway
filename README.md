<div align="center">

# cutaway

**A cutaway drawing of your codebase.**

[![audit](https://github.com/Arvoxis/cutaway/actions/workflows/audit.yml/badge.svg)](https://github.com/Arvoxis/cutaway/actions/workflows/audit.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-1e3a5f.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-1e3a5f.svg?style=flat-square)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-1e3a5f.svg?style=flat-square)](package.json)

[Try it](#try-it-in-thirty-seconds) · [Gallery](#the-gallery) · [Reading the drawing](#reading-the-drawing) · [How it compares](#how-it-compares) · [Limits](#limits) · [Questions](#questions)

Point a coding agent at a repository and get one self-contained HTML page,
drawn like an engineering sheet. See an unfamiliar codebase's shape in ten
seconds, and find its import cycles without reading a line.

<img src="docs/hero.png" width="100%" alt="A detail of the fastapi sheet: numbered parts, routed relations, district frames, churn hatching">

</div>

## What it is

An agent skill. Install it, then ask your agent about a codebase's
architecture and it draws one instead of guessing.

The code owns the truth and the geometry; the agent supplies the reading. The
extractor parses imports, the layout places parts by dependency depth with
directories as columns, and an **audit proves the drawing before anyone sees
it**: no part overlapping another, no relation crossing a part it does not
connect to, no label escaping its box, no balloon without a parts-list row.
Ten checks, all of which must read zero. CI runs cutaway on cutaway — if it
cannot satisfy its own spec on its own source, it has no business drawing
yours.

```console
$ node src/audit.mjs graph.json

graph.json
   ok      0  part-overlap
   ok      0  relation-through-part
   ok      0  loose-end
   ok      0  label-overflow
   ok      0  region-excludes-member
   ok      0  region-holds-foreigner
   ok      0  region-overlap
   ok      0  crosses-frame
   ok      0  duplicate-balloon
   ok      0  balloon-gap

audit passed
```

## Try it in thirty seconds

**The core has no dependencies.** No `npm install`, no build, no API key, and
nothing leaves your machine.

```bash
git clone https://github.com/Arvoxis/cutaway && cd cutaway
node src/extract.mjs /path/to/your/repo --out graph.json
node src/render.mjs graph.json sheet.html
```

Open `sheet.html`. Puppeteer is needed only if you want
`scripts/capture.mjs` to screenshot a sheet for you.

## Install as a skill

```bash
git clone https://github.com/Arvoxis/cutaway ~/.claude/skills/cutaway
```

Then ask: *"draw the architecture of this repo"*.

Written and tested against Claude Code. It is one `SKILL.md` plus plain Node
scripts, so it should drop into any agent that reads skills from a directory —
untested elsewhere, and reports are welcome.

## The gallery

Every sheet below is generated from the real repository by
`scripts/gallery.mjs`, not drawn by hand. Click through for the interactive
page; each ships both themes — cyanotype and vellum — with a toggle in the
corner.

<table>
<tr>
<td width="50%"><a href="examples/fastapi/sheet.html"><img src="examples/fastapi/sheet.png" width="100%" alt="fastapi"></a><br><sub><b>fastapi</b> — 41 parts, 130 relations</sub></td>
<td width="50%"><a href="examples/axios/sheet.html"><img src="examples/axios/sheet.png" width="100%" alt="axios"></a><br><sub><b>axios</b> — 70 parts, 160 relations</sub></td>
</tr>
<tr>
<td width="50%"><a href="examples/flask/sheet.html"><img src="examples/flask/sheet.png" width="100%" alt="flask"></a><br><sub><b>flask</b> — 23 parts, 92 relations</sub></td>
<td width="50%"><a href="examples/httpx/sheet.html"><img src="examples/httpx/sheet.png" width="100%" alt="httpx"></a><br><sub><b>httpx</b> — 23 parts, 87 relations</sub></td>
</tr>
<tr>
<td width="50%"><a href="examples/hono/sheet.html"><img src="examples/hono/sheet.png" width="100%" alt="hono"></a><br><sub><b>hono</b> — 237 modules, drawn as 22 districts</sub></td>
<td width="50%"><a href="examples/zod/sheet.html"><img src="examples/zod/sheet.png" width="100%" alt="zod"></a><br><sub><b>zod</b> — 246 modules, drawn as 17 districts</sub></td>
</tr>
<tr>
<td width="50%"><a href="examples/requests/sheet.html"><img src="examples/requests/sheet.png" width="100%" alt="requests"></a><br><sub><b>requests</b> — 18 parts, 72 relations</sub></td>
<td width="50%"><a href="examples/express/sheet.html"><img src="examples/express/sheet.png" width="100%" alt="express"></a><br><sub><b>express</b> — 7 parts, 7 relations</sub></td>
</tr>
</table>

## Reading the drawing

| Mark | Meaning |
|---|---|
| Box with a balloon number | A module. The number indexes the parts list |
| Row | Dependency depth — entry point on top, foundations at the bottom |
| Continuous relation | A direct import |
| Heavier relation | Three or more imports between the same pair |
| Dashed relation | An import that creates a cycle |
| Dash-dot frame | A district: one directory |
| Hatching | Churn — tighter hatch, more commits touching it |
| Red accent | The part at the top of the stack with the most dependencies — the entry point in an application, whatever sits highest in a library |

Dashed relations are the useful ones: not every edge inside a cycle, but a
set whose removal breaks every cycle in the repository.

## Two zoom levels

A sheet drawn module by module stops being readable somewhere past a hundred
modules — hono's 237 would be a 4300px wall poster. So above that the drawing
zooms out on its own: one part per district, each labelled with how many
modules it stands for, relations carrying the summed import count.

```bash
node src/render.mjs graph.json sheet.html --level district   # force it
node src/render.mjs graph.json sheet.html --level module     # or override
```

## Limits

Stated plainly, because a drawing that hides what it cannot see is worse than
no drawing.

- **Python and JavaScript/TypeScript only.**
- **Imports, not calls.** Two modules that talk through a registry or
  dependency injection show no relation between them.
- **TypeScript path aliases** (`@/x`) are not resolved — a repo leaning on them
  will show fewer relations than it really has.
- **The district overview is a summary.** Above 120 modules the sheet zooms
  out, and relations inside a district stop being drawn. Pass `--level module`
  for every module, and expect a very large sheet.
- **Churn** comes from the last 2000 commits, and is zero outside a git
  repository.
- Only `source` modules are drawn. Tests, examples, scripts and vendored code
  are counted and set aside; the extractor prints the split so you can see what
  was left out.

## How it compares

None of these are trying to do the same thing, and two of them are better than
cutaway at what they are for.

| | Languages | Needs | What you get |
|---|---|---|---|
| **cutaway** | Python, JS/TS | Node | A drafting sheet: depth rows, district frames, cycles, churn |
| [madge](https://github.com/pahen/madge) | JS (and Sass/Less/Stylus) | graphviz, for images | A dependency graph and a circular-dependency list |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | JS/TS/CoffeeScript | graphviz, for images | Rule validation first — the graph is, in its own words, a side effect |
| [pydeps](https://github.com/thebjorn/pydeps) | Python | graphviz | A Python module graph as SVG or PNG |
| [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) | any | nothing, it is hosted | An LLM's reading of the repo as a Mermaid diagram |

If you want a dependency rule enforced in CI, use dependency-cruiser. If you
want one import cycle listed in a terminal, `madge --circular` is a shorter
path than drawing anything. cutaway is for the case where you want to *look*
at a repository: it is the only one of these that lays modules out by
dependency depth, frames directories, and puts churn on the page. It is also
the only one that checks its own output geometrically before showing it to
you, and the only one that draws Python and JS/TS through the same pipeline.

Unlike GitDiagram, nothing here is generated by a model — every line comes
from an import the parser actually found, so the drawing is wrong only where
the parser is.

## Questions

**Does any of this leave my machine?** No. Extraction and drawing are local,
and the HTML makes no network calls — open it on a plane. The optional
screenshot step launches a headless browser against the local file.

**The extractor says `source` is near zero. What now?** The role heuristics
misread a repo that nests its real code somewhere unusual. Point the extractor
at the package directory rather than the repository root:
`node src/extract.mjs repo/src --out graph.json`.

**A module I know imports another shows no relation.** Three things are
invisible to an import parser: anything wired through a registry or dependency
injection, TypeScript path aliases (`@/x`), and dynamic imports whose
specifier is not a plain string.

**Do I need an agent to use it?** No. It is two `node` commands and a `.json`
file. The skill exists so an agent can run them and read the result back to
you, which is the part that is hard to automate.

**It drew a wall poster.** Past 120 modules it should zoom out on its own; if
you forced `--level module` on a large repo, that is what you asked for. Pass
`--level district`.

## License

MIT.
