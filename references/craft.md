# Craft — the drafting sheet

The rules that separate a drafted sheet from a graph render. Implementation
follows this file; where code and this file disagree, this file is right.

## The one idea that matters

**It is a drawing, not a visualisation of a graph.** A reader should take it for
a scan of a real engineering drawing before they notice it was generated. Every
convention below exists in actual drafting practice, and the sheet earns its
look by obeying them consistently — not by decorating a graph with a border.

Two ways this fails, both seen in the v0 renders:

- **Rainbow.** A hue per district reads as a dashboard. Drafting is ink on
  ground. Information comes from weight, pattern and position, never from hue.
- **Floating.** Boxes and lines centred in empty space read as a diagram tool's
  output. A drawing fills its frame and is anchored by a title block.

## Ground and ink

Monochrome, two themes, both first-class. One accent only.

| | Ground | Ink | Accent |
|---|---|---|---|
| `cyanotype` (dark) | Prussian blue `#13304f` | paper white `#e8eef5` | signal red `#ff5d4a` |
| `vellum` (light) | warm paper `#f2ede2` | graphite `#1e242b` | signal red `#c0392b` |

Ink renders at four opacities and nothing else: `1.0` subject, `0.72` ordinary,
`0.45` secondary, `0.22` construction. No gradients, no glow, no shadow, no
blur. The accent appears at most **three times** on a sheet — the entry module,
and nothing else unless the reader is being pointed somewhere.

## Line weights

The core of the craft. Exactly four weights, used for one thing each. A sheet
that uses a fifth weight, or uses one of these for two different meanings, is
wrong.

| Weight | px | Used for, and only for |
|---|---|---|
| thick | 1.6 | Module outlines — the parts themselves |
| medium | 0.9 | Load-bearing dependencies (weight ≥ 3 imports) |
| thin | 0.5 | Ordinary dependencies, leaders, the frame, hatching |
| fine | 0.3 | Zone ticks, grid, parts-list rules |

Dash patterns carry meaning and are not decoration:

- **Continuous** — a real, direct dependency.
- **Dash-dot** (`6 2 1 2`) — a district boundary. Borrowed from the centre-line
  convention: it marks a region's extent, not a physical edge.
- **Dashed** (`4 3`) — an edge that participates in an import cycle. These are
  the hidden edges of the drawing and a reader should be able to find every
  cycle in the codebase by looking for dashes.

## Frame, zones, title block

- **Frame.** A thin ruled border inset 18px from the sheet edge. The drawing
  lives inside it. Nothing crosses it.
- **Zones.** Letters `A…` down the left margin, numbers `1…` along the top, tick
  marks at every division, fine weight. Zones make a module addressable: a
  reader can say "`routing`, C-4". Divisions are ~180px.
- **Title block.** Bottom-right, inside the frame, ruled cells, thin weight:

  ```
  ┌──────────────────────────┬────────────┐
  │ REPOSITORY   fastapi     │ SHEET 1/1  │
  ├──────────────────────────┼────────────┤
  │ COMMIT  e5fc7ef5         │ DRAWN      │
  │ DATE    2026-10-19       │ cutaway    │
  ├──────────────────────────┴────────────┤
  │ 41 PARTS · 130 RELATIONS · 11 LAYERS  │
  └───────────────────────────────────────┘
  ```

  Labels in the title block are uppercase and letter-spaced; values are not.

## Modules as parts

- A rectangle, thick outline, square corners (radius 0 — a 2px radius already
  reads as a UI card, not a part).
- **Balloon.** A small circle on the top-left corner of every part carrying its
  number, thin weight. The number indexes the parts list. Balloons are what let
  the boxes stay small while full paths stay available.
- **Label** inside the part: the short module name. Never the full path — the
  path belongs in the parts list.
- **Hatching by churn.** Parts are filled with 45° hatching whose spacing
  encodes how often the module changes. This is the one place the drawing
  carries information that no directory listing could give.

  | Churn percentile | Hatch | Reads as |
  |---|---|---|
  | top 10% | 3px spacing | worked constantly |
  | top 25% | 5px | active |
  | top 50% | 8px | ordinary |
  | rest | none | settled |

  Hatch lines are thin weight at `0.22` opacity, clipped to the part.

## Districts as regions

A district is a dash-dot rectangle enclosing its parts, with the directory name
set in the top-left corner just inside the boundary, uppercase, letter-spaced,
`0.45` ink. Regions may not overlap; where the layout would overlap two, the
layout is wrong and gets fixed in the layout, never by dropping a region.

A district of one module gets no region — a frame around a single part is noise.

## Relations

- Routed as orthogonal-with-fillet or as a shallow curve, consistently; never a
  mix on one sheet.
- Weight by import count, per the table above.
- Every relation **terminates on an outline**, never in space and never
  overlapping a part it does not connect to.
- An arrowhead at the dependency end only: open, 6px, thin. A relation reads
  "depends on" in one direction and the sheet must never be ambiguous about it.

## Parts list

Bottom-left, inside the frame, above nothing. Ruled columns, fine weight:

```
№   MODULE                      LOC   CHURN
01  fastapi/applications       1 204   112
02  fastapi/routing              946    52
```

Numbered in reading order of the drawing — top-left to bottom-right — so a
reader scanning the list walks the architecture in dependency order. Right-align
numerics. If the list would run past the sheet, it continues in a second column
before it ever shrinks the type.

## Typography

One family: the system monospace stack. No web fonts — the sheet is a single
self-contained file that must render offline and identically forever.

- Part labels: 10px, normal case.
- Annotations, district names, title-block labels: 9px, uppercase, `0.08em`
  letter-spacing.
- Parts list: 9px, tabular numerics.

## Forbidden

Rounded corners above 0. Hue as a channel. Gradients, glow, shadows, blur.
Emoji. Icons. More than four line weights. A relation that ends in space. A
label floating outside a part with no leader. Any element that overlaps the
frame. Decorative anything.

## Verification

A sheet is finished when all of these hold, checked with
`node src/audit.mjs` and by reading the PNGs at 4×:

1. No two parts overlap; no part overlaps a district region it is not inside.
2. No relation passes through a part it does not terminate on.
3. Every relation terminates on an outline at both ends.
4. Every part label fits inside its part.
5. Every district region contains exactly its own parts and no others.
6. Nothing crosses the frame.
7. Every balloon number appears exactly once in the parts list, and vice versa.
8. Both themes render; neither has an element that vanishes into its ground.
9. The sheet reads as a drawing at 1× and rewards a 4× look with real detail —
   hatching, ticks, ruled cells, balloons — rather than going blank.
