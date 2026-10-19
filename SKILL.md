---
name: cutaway
description: Draw a repository as an engineering drafting sheet — a single self-contained HTML page showing its real module structure, which parts depend on which, where the import cycles are, and which modules churn most. Use this whenever someone wants to see, explain, document or review the architecture of a codebase: an architecture diagram, a dependency graph, a module map, an onboarding picture of an unfamiliar repo, a figure for a README or a design doc, or an answer to "how is this project put together", "what depends on what here", "where are the import cycles", "what is the hot part of this code". Works on Python and JavaScript/TypeScript repositories.
license: MIT
compatibility: Written for Claude Code; also runs in Codex, Gemini CLI, OpenCode and other coding agents. Needs Node.js 20+, and Chrome or Chromium only for the screenshot step.
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

Run these from the skill directory, with the target repository as an argument.

### 1. Extract

```bash
node src/extract.mjs <repo-path> --out graph.json
```

Prints a summary: modules found, how they split by role (source / test /
example / script / vendor), and how many the sheet will actually draw. Only
`source` modules are drawn; everything else is counted and set aside.

**Read that summary before going on.** If `source` is near zero but `test` or
`example` is large, the repository nests its real code somewhere the role
heuristics misread — point the extractor at the package directory instead of
the repository root (`node src/extract.mjs repo/src --out graph.json`) and say
in your reply that you did.

### 2. Draw

```bash
node src/render.mjs graph.json out/sheet.html
```

One self-contained HTML file. No network, no build step, both themes inside it
(cyanotype and vellum, with a toggle in the corner).

It prints which zoom level it drew at. Past 120 modules a module-level sheet
is unreadably large, so the drawing zooms out by itself to one part per
district, each labelled with the module count it stands for. Override with
`--level module` or `--level district` when the reader asked for one
specifically — someone who wants "the whole thing" on a big repo is asking
for `--level module`, and should be warned the sheet will be very large.

### 3. Prove it

```bash
node src/audit.mjs graph.json
```

Ten geometric checks from `references/craft.md`: parts that overlap, a relation
crossing a part it does not connect to, a label escaping its box, a district
region holding a module that is not its own, a balloon with no parts-list row.

**Every line must read 0 and the run must print `audit passed`.** A failure is
a bug in the layout, never something to draw around. If one persists, say so
plainly rather than shipping a sheet that violates its own spec.

### 4. Look at it

```bash
node scripts/capture.mjs out/sheet.html shots
```

Writes a full-size PNG of the sheet and a phone-width one. **Read both.** The
audit proves the geometry is legal; only your eyes tell you whether the drawing
reads. Check that the entry point is at the top, that the spine down the middle
matches what you know of the project, and that no region is a nearly-empty box.

## What to say about the sheet

This is the part the pipeline cannot do. Having drawn it, tell the reader:

- **The spine.** The chain from the entry point down to the foundations, named
  in plain words. For a web framework that is usually app → routing →
  request handling → utilities.
- **What each district is for.** The directory names are on the sheet; what
  they *do* is not. One clause each.
- **The cycles.** Dashed relations are the imports that create import cycles —
  the minimal set whose removal would break every cycle. Name them; they are
  usually the most actionable thing on the sheet.
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
