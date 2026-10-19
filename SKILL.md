---
name: cutaway
description: Draw a repository as an engineering drafting sheet — a single self-contained HTML page showing its real module structure, which parts depend on which, where the import cycles are, and which modules churn most. Use this whenever someone wants to see, explain, document or review the architecture of a codebase: an architecture diagram, a dependency graph, a module map, an onboarding picture of an unfamiliar repo, a figure for a README or a design doc, or an answer to "how is this project put together", "what depends on what here", "where are the import cycles", "what is the hot part of this code". Works on Python and JavaScript/TypeScript repositories.
license: MIT
compatibility: Written and tested against Claude Code. It is one SKILL.md plus plain Node scripts with no dependencies, so it should work in any agent that reads skills from a directory, though that is untested. Needs Node.js 20+. The optional screenshot step also needs puppeteer, which the skill does not ship.
---

# cutaway

A cutaway drawing of a codebase. The pipeline reads the repository and emits a
drafting sheet: parts (modules) with balloon numbers, relations (imports)
routed orthogonally, districts (directories) framed in dash-dot, hatching by
churn, a numbered parts list and a title block.

**The code owns the truth and the geometry. You own the judgment.** Do not
hand-draw a diagram and do not edit the SVG. Run the pipeline, then read the
sheet and say what it means.

## Workflow

Four commands. Two things to get right before the first one:

- **Run from the user's repository, not from the skill directory.** The
  scripts take paths, so there is no reason to change directory, and running
  them from the installation drops `graph.json` and `out/` inside
  `~/.claude/skills/cutaway`.
- **Write every output under `cutaway/` in the working directory**, and say at
  the end where the sheet is so the user can open it. Mention that `cutaway/`
  is throwaway and can be deleted or gitignored.

Below, `$SKILL` is the skill's base directory — the absolute path printed when
this skill loads. Substitute it; do not rely on a shell variable surviving
between calls.

### 1. Extract

```bash
node $SKILL/src/extract.mjs <repo-path> --out cutaway/graph.json
```

`<repo-path>` is usually `.`. Missing directories are created.

Prints a summary: modules found, how they split by role (source / test /
example / script / vendor), and how many the sheet will actually draw. Only
`source` modules are drawn; everything else is counted and set aside.

**Read that summary before going on.** If `source` is near zero but `test` or
`example` is large, the repository nests its real code somewhere the role
heuristics misread — point the extractor at the package directory instead of
the repository root (`... src/extract.mjs ./src --out cutaway/graph.json`) and
say in your reply that you did.

### 2. Draw

```bash
node $SKILL/src/render.mjs cutaway/graph.json cutaway/sheet.html
```

One self-contained HTML file. No network, no build step, both themes inside it
(cyanotype and vellum, with a toggle in the corner).

It prints which zoom level it drew at, and lists the relations it drew
dashed — the import cycles. Keep that list; it is the most useful thing you
will say about the sheet, and it is derived here rather than stored in
`graph.json`.

Past 120 modules a module-level sheet
is unreadably large, so the drawing zooms out by itself to one part per
district, each labelled with the module count it stands for. Override with
`--level module` or `--level district` when the reader asked for one
specifically — someone who wants "the whole thing" on a big repo is asking
for `--level module`, and should be warned the sheet will be very large.

### 3. Prove it

```bash
node $SKILL/src/audit.mjs cutaway/graph.json
```

**If you passed `--level` to the renderer, pass the same `--level` here.**
Without it the audit re-picks the zoom by itself and will happily pass a sheet
it never looked at.

Ten geometric checks from `references/craft.md`: parts that overlap, a relation
crossing a part it does not connect to, a label escaping its box, a district
region holding a module that is not its own, a balloon with no parts-list row.

**Every line must read 0 and the run must print `audit passed`.** A failure is
a bug in the layout, never something to draw around. If one persists, say so
plainly rather than shipping a sheet that violates its own spec.

### 4. Look at it

```bash
node $SKILL/scripts/capture.mjs cutaway/sheet.html cutaway/shots
```

Writes a full-size PNG of the sheet and a phone-width one. **Read both.** The
audit proves the geometry is legal; only your eyes tell you whether the drawing
reads. Check that the entry point is at the top, that the spine down the middle
matches what you know of the project, and that no region is a nearly-empty box.

This step needs puppeteer, which the skill deliberately does not ship — the
first three steps have no dependencies at all. If it reports puppeteer
missing, do not install it unasked: hand the user the sheet, say you could not
view it yourself, and offer `npm install puppeteer` in the skill directory as a
one-time setup if they want you to from now on.

You can still write the reading without it: the cycles come from step 2's
output and everything else from `cutaway/graph.json`. Just do not claim the
drawing reads well when you have not seen it.

## What to say about the sheet

This is the part the pipeline cannot do. Having drawn it, tell the reader:

- **The spine.** The chain from the entry point down to the foundations, named
  in plain words. For a web framework that is usually app → routing →
  request handling → utilities.
- **What each district is for.** The directory names are on the sheet; what
  they *do* is not. One clause each.
- **The cycles.** Dashed relations are the imports that create import cycles:
  a set whose removal breaks every cycle in the repository, found by walking
  the graph, not the smallest such set. Name them; they are usually the most
  actionable thing on the sheet.
- **The hot parts.** Dense hatching marks the modules that change most often.
  A heavily-hatched module deep in the foundations is worth a comment: churn
  low in the stack is where breakage comes from.
- **What was left out.** The standalone strip holds modules with no internal
  relation either way, usually re-export shims. Say how many, and say the test
  and example counts from step 1, so nobody thinks the sheet is the whole repo.

Do not narrate the drawing's features back to the reader. They can see the
balloons. Tell them what the architecture *is*.

## Reading the drawing

| Mark | Meaning |
|---|---|
| Box, thick outline | A module. Balloon number indexes the parts list |
| Row | Dependency depth. Entry point on top, foundations at the bottom |
| Continuous relation | A direct import |
| Heavier relation | Three or more imports between the same pair |
| Dashed relation | An import that creates a cycle |
| Dash-dot frame | A district: one directory |
| Hatching | Churn — tighter hatch, more commits touching it |
| Red accent | The entry point |

## Limits

State these when they apply rather than letting the reader assume otherwise.

- Python and JavaScript/TypeScript only.
- Imports, not calls. Two modules that talk through a registry or dependency
  injection show no relation.
- TypeScript path aliases (`@/x`) are not resolved; a repo that uses them
  heavily will show fewer relations than it really has.
- Dynamic imports are caught only when the specifier is a plain string.
- Churn comes from the last 2000 commits of `git log`, and is zero outside a
  git repository.
