// Drafting primitives. Everything here implements references/craft.md;
// if the two disagree, craft.md is right and this file is the bug.

export const INSET = 18;          // frame inset from the sheet edge
export const ZONE = 180;          // zone division size

// Four weights, one meaning each. A fifth weight is a bug.
export const W = { thick: 1.6, medium: 0.9, thin: 0.5, fine: 0.3 };
export const DASH = { region: "6 2 1 2", cycle: "4 3" };

export const CSS = `
  :root{--ground:#13304f;--ink:#e8eef5;--accent:#ff5d4a}
  :root[data-theme="vellum"]{--ground:#f2ede2;--ink:#1e242b;--accent:#c0392b}
  html,body{margin:0;background:var(--ground)}
  svg{display:block;margin:0 auto;width:100%;height:auto}
  text{fill:var(--ink);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .t-part{font-size:10px}
  .t-anno{font-size:9px;text-transform:uppercase;letter-spacing:.08em}
  .t-list{font-size:9px;font-variant-numeric:tabular-nums}
  .i1{opacity:1}.i72{opacity:.72}.i45{opacity:.45}.i22{opacity:.22}
  line,path,rect,circle,polyline{fill:none;stroke:var(--ink)}
  .w-thick{stroke-width:${W.thick}}.w-med{stroke-width:${W.medium}}
  .w-thin{stroke-width:${W.thin}}.w-fine{stroke-width:${W.fine}}
  .part{fill:var(--ground)}
  .accent{stroke:var(--accent)}
  .accent-f{fill:var(--accent);stroke:none}
  .theme-btn{position:fixed;right:14px;top:12px;font:9px ui-monospace,monospace;
    letter-spacing:.08em;text-transform:uppercase;color:var(--ground);
    background:var(--ink);border:0;padding:5px 9px;cursor:pointer;opacity:.75}
`;

export const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Hatch densities encode churn. Spacing, never hue.
export const HATCH = [
  ["h-hot", 3], ["h-warm", 5], ["h-mild", 8],
];

export function defs() {
  const pats = HATCH.map(([id, gap]) =>
    `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
    + `<line x1="0" y1="0" x2="0" y2="${gap}" class="w-thin i22"/></pattern>`).join("");
  const arrow = `<marker id="dep" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`
    + `<polyline points="1,1 7,4 1,7" class="w-thin i72"/></marker>`;
  return `<defs>${pats}${arrow}</defs>`;
}

export const hatchFor = (pct) =>
  pct >= 0.90 ? "h-hot" : pct >= 0.75 ? "h-warm" : pct >= 0.50 ? "h-mild" : null;

// Frame plus zone ticks and letters. Nothing in the drawing crosses this.
export function frame(sw, sh) {
  const x0 = INSET, y0 = INSET, x1 = sw - INSET, y1 = sh - INSET;
  let s = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" class="w-thin i45"/>`;
  const cols = Math.max(1, Math.floor((x1 - x0) / ZONE));
  const rows = Math.max(1, Math.floor((y1 - y0) / ZONE));
  const cw = (x1 - x0) / cols, rh = (y1 - y0) / rows;
  for (let i = 1; i < cols; i++) {
    const x = x0 + i * cw;
    s += `<line x1="${x.toFixed(1)}" y1="${y0}" x2="${x.toFixed(1)}" y2="${y0 + 6}" class="w-fine i45"/>`
      + `<line x1="${x.toFixed(1)}" y1="${y1 - 6}" x2="${x.toFixed(1)}" y2="${y1}" class="w-fine i45"/>`;
  }
  for (let i = 0; i < cols; i++)
    s += `<text class="t-anno i45" x="${(x0 + i * cw + cw / 2).toFixed(1)}" y="${y0 - 5}" text-anchor="middle">${i + 1}</text>`;
  for (let i = 1; i < rows; i++) {
    const y = y0 + i * rh;
    s += `<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x0 + 6}" y2="${y.toFixed(1)}" class="w-fine i45"/>`
      + `<line x1="${x1 - 6}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}" class="w-fine i45"/>`;
  }
  for (let i = 0; i < rows; i++)
    s += `<text class="t-anno i45" x="${x0 - 7}" y="${(y0 + i * rh + rh / 2 + 3).toFixed(1)}" text-anchor="end">${String.fromCharCode(65 + i)}</text>`;
  return s;
}

const cell = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="w-thin i45"/>`;

// Bottom-right, inside the frame. The strongest signal that this is a drawing.
export function titleBlock(sw, sh, info) {
  const w = 330, h = 86;
  const x = sw - INSET - w, y = sh - INSET - h;
  const split = 228;
  const lab = (lx, ly, t) => `<text class="t-anno i45" x="${lx}" y="${ly}">${esc(t)}</text>`;
  const val = (lx, ly, t, cls = "t-part i1") => `<text class="${cls}" x="${lx}" y="${ly}">${esc(t)}</text>`;
  return cell(x, y, w, h)
    + `<line x1="${x}" y1="${y + 26}" x2="${x + w}" y2="${y + 26}" class="w-thin i45"/>`
    + `<line x1="${x}" y1="${y + 62}" x2="${x + w}" y2="${y + 62}" class="w-thin i45"/>`
    + `<line x1="${x + split}" y1="${y}" x2="${x + split}" y2="${y + 62}" class="w-thin i45"/>`
    + lab(x + 9, y + 11, "repository") + val(x + 9, y + 21, info.repo)
    + lab(x + split + 9, y + 11, "sheet") + val(x + split + 9, y + 21, info.sheet)
    + lab(x + 9, y + 38, "commit") + val(x + 9, y + 49, info.commit ?? "—")
    + lab(x + split + 9, y + 38, "drawn") + val(x + split + 9, y + 49, info.date)
    + `<text class="t-anno i72" x="${x + 9}" y="${y + 78}">${esc(info.summary)}</text>`;
}

// Bottom-left. Numbered in the drawing's reading order, so walking the list
// walks the architecture.
export function partsList(x, yBottom, rows, { colH = 11, maxRows = 26 } = {}) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += maxRows) chunks.push(rows.slice(i, i + maxRows));
  const colW = 300;
  const height = (Math.min(rows.length, maxRows) + 1) * colH + 8;
  const top = yBottom - height;
  let s = "";
  chunks.forEach((chunk, ci) => {
    const cx = x + ci * colW;
    s += `<text class="t-anno i45" x="${cx}" y="${top + colH}">№</text>`
      + `<text class="t-anno i45" x="${cx + 24}" y="${top + colH}">module</text>`
      + `<text class="t-anno i45" x="${cx + 240}" y="${top + colH}" text-anchor="end">loc</text>`
      + `<text class="t-anno i45" x="${cx + 276}" y="${top + colH}" text-anchor="end">chn</text>`
      + `<line x1="${cx}" y1="${top + colH + 4}" x2="${cx + 276}" y2="${top + colH + 4}" class="w-fine i45"/>`;
    chunk.forEach((r, i) => {
      const yy = top + colH * (i + 2) + 4;
      s += `<text class="t-list i72" x="${cx}" y="${yy}">${String(r.n).padStart(2, "0")}</text>`
        + `<text class="t-list i72" x="${cx + 24}" y="${yy}">${esc(r.module)}</text>`
        + `<text class="t-list i45" x="${cx + 240}" y="${yy}" text-anchor="end">${r.loc}</text>`
        + `<text class="t-list i45" x="${cx + 276}" y="${yy}" text-anchor="end">${r.churn}</text>`;
    });
  });
  return { svg: s, width: chunks.length * colW, height };
}

export function part({ x, y, w, h, label, n, hatch, accent }) {
  const cls = accent ? "part w-thick i1 accent" : "part w-thick i1";
  return `<g class="m">`
    + `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" class="${cls}"/>`
    + (hatch ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" fill="url(#${hatch})" stroke="none"/>` : "")
    + `<text class="t-part i1" x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + 3.5).toFixed(1)}" text-anchor="middle">${esc(label)}</text>`
    + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.5" class="part w-thin i72"/>`
    + `<text class="t-list i72" x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle">${String(n).padStart(2, "0")}</text>`
    + `</g>`;
}

export function region({ x, y, w, h, name }) {
  return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" `
    + `class="w-thin i45" stroke-dasharray="${DASH.region}"/>`
    + `<text class="t-anno i45" x="${(x + 7).toFixed(1)}" y="${(y + 13).toFixed(1)}">${esc(name)}</text></g>`;
}

export function page({ title, body, w, h }) {
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>${CSS}</style>
<button class="theme-btn" onclick="document.documentElement.dataset.theme=document.documentElement.dataset.theme==='vellum'?'':'vellum'">theme</button>
<svg viewBox="0 0 ${w} ${h}" style="max-width:${w}px" preserveAspectRatio="xMidYMid meet">${defs()}${body}</svg>`;
}
