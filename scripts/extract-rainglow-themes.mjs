// @module scripts/extract-rainglow-themes
// One-shot: read curated rainglow VS Code themes and emit viewer-shape JSON
// (oklch palettes) into viewer/src/themes/theme-rg-<name>.json.
//
// Run: node scripts/extract-rainglow-themes.mjs
//
// Mapping rationale:
//   GLOBAL settings.background    -> --chrome-bg base · derive --chrome-* shades
//   GLOBAL settings.foreground    -> --text-primary
//   Comment fg                    -> --text-meta
//   String / Keyword / Class fg   -> accent candidates (gold/orange/foil)
//   Number / Constant / Tag fg    -> --status-* candidates
//   Invalid / Bracket fg          -> --accent-red / --status-blocked

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const RAINGLOW = "/home/griffin/.vscode/extensions/daylerees.rainglow-1.5.2/themes";
const OUT_DIR = path.join(REPO, "viewer", "src", "themes");

// curated set: name -> { source, label }
const CURATED = [
  { src: "azure",            label: "Rainglow · Azure (deep blue)" },
  { src: "earthsong",        label: "Rainglow · Earthsong (warm earth)" },
  { src: "lavender",         label: "Rainglow · Lavender (violet dusk)" },
  { src: "hawaii",           label: "Rainglow · Hawaii (tropical)" },
  { src: "heroku",           label: "Rainglow · Heroku (royal purple)" },
  { src: "hyrule",           label: "Rainglow · Hyrule (forest)" },
  { src: "iceberg",          label: "Rainglow · Iceberg (cold steel)" },
  { src: "joker",            label: "Rainglow · Joker (green / purple)" },
  { src: "mintchoc",         label: "Rainglow · Mintchoc (mint + cocoa)" },
  { src: "peacock",          label: "Rainglow · Peacock (teal)" },
  { src: "peacocks-in-space",label: "Rainglow · Peacocks in Space" },
  { src: "rainbow",          label: "Rainglow · Rainbow" },
  { src: "shrek",            label: "Rainglow · Shrek (swamp green)" },
  { src: "solarflare",       label: "Rainglow · Solarflare (amber)" },
  { src: "tron",             label: "Rainglow · Tron (cyan grid)" },
  { src: "github",           label: "Rainglow · GitHub (slate)" },
  { src: "monzo",            label: "Rainglow · Monzo (hot coral)" },
  { src: "darkside",         label: "Rainglow · Darkside (crimson dark)" },
  { src: "iceberg-light",    label: "Rainglow · Iceberg Light" },
  // user-requested specific themes
  { src: "codecourse",       label: "Rainglow · Codecourse (sky)" },
  { src: "yitzchok",         label: "Rainglow · Yitzchok (paper)" },
  { src: "apotheosis-theme", label: "Apotheosis · Charles VI (custom)", out: "apotheosis" },
];

// ────── color math ──────────────────────────────────────────────────────────

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const srgbToLinear = (c) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

// sRGB → OKLab → OKLCh per https://bottosson.github.io/posts/oklab/
const rgbToOklch = ([r, g, b]) => {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
};

const fmt = (n, d = 3) => Number(n.toFixed(d)).toString();
const oklchStr = ([L, C, H], alpha) => {
  const base = `oklch(${fmt(L)} ${fmt(C)} ${fmt(H, 1)}`;
  return alpha == null ? `${base})` : `${base} / ${alpha})`;
};

// shift L while preserving C, H — used to derive panel/code/rule shades from bg
const shiftL = ([L, C, H], dL) => [Math.max(0, Math.min(1, L + dL)), C, H];

// ────── token extraction ────────────────────────────────────────────────────

const findToken = (tokens, names) => {
  const lower = names.map((n) => n.toLowerCase());
  for (const tc of tokens) {
    const n = (tc.name || tc.scope || "").toString().toLowerCase();
    if (lower.some((x) => n.includes(x))) {
      const fg = tc.settings && tc.settings.foreground;
      if (fg) return fg;
    }
  }
  return null;
};

const buildVars = (rg) => {
  const tokens = rg.tokenColors || [];
  const global = tokens[0]?.settings || {};
  const bgHex = global.background || "#181818";
  const fgHex = global.foreground || "#ffffff";

  const commentHex = findToken(tokens, ["comment"]) || fgHex;
  const stringHex  = findToken(tokens, ["string"]) || fgHex;
  const keywordHex = findToken(tokens, ["keyword"]) || fgHex;
  const classHex   = findToken(tokens, ["class name", "class"]) || stringHex;
  const numberHex  = findToken(tokens, ["number", "constant.numeric", "numeric"]) || stringHex;
  const tagHex     = findToken(tokens, ["tag name", "tag"]) || keywordHex;
  const fnHex      = findToken(tokens, ["function name", "function"]) || classHex;
  const invalidHex = findToken(tokens, ["invalid", "deprecated", "bracket"]) || "#c43535";

  const bg     = rgbToOklch(hexToRgb(bgHex));
  const fg     = rgbToOklch(hexToRgb(fgHex));
  const cmt    = rgbToOklch(hexToRgb(commentHex));
  const str    = rgbToOklch(hexToRgb(stringHex));
  const kw     = rgbToOklch(hexToRgb(keywordHex));
  const cls    = rgbToOklch(hexToRgb(classHex));
  const num    = rgbToOklch(hexToRgb(numberHex));
  const tag    = rgbToOklch(hexToRgb(tagHex));
  const fn     = rgbToOklch(hexToRgb(fnHex));
  const inv    = rgbToOklch(hexToRgb(invalidHex));

  // for light themes (bg.L > 0.7), shift panels darker; else lighter.
  const isLight = bg[0] > 0.7;
  const dir = isLight ? -1 : 1;
  const panel  = shiftL(bg, dir * 0.012);
  const code   = shiftL(bg, dir * -0.018);
  const c10    = shiftL(bg, dir * 0.022);
  const c15    = shiftL(bg, dir * 0.034);
  const c25    = shiftL(bg, dir * 0.05);
  const c30    = shiftL(bg, dir * 0.045);
  const rule   = shiftL(bg, dir * 0.04);
  const ruleS  = shiftL(bg, dir * 0.06);

  // text-secondary slightly less intense than primary
  const textSec = [Math.max(0, fg[0] - 0.04), fg[1], fg[2]];

  // status-fresh = a faint tint of bg (close to bg, slightly shifted)
  const statusFresh = shiftL(bg, dir * 0.018);

  return {
    "--chrome-bg":      oklchStr(bg),
    "--chrome-panel":   oklchStr(panel),
    "--chrome-code":    oklchStr(code),
    "--chrome-00":      oklchStr(bg),
    "--chrome-05":      oklchStr(panel),
    "--chrome-10":      oklchStr(c10),
    "--chrome-15":      oklchStr(c15),
    "--chrome-25":      oklchStr(c25),
    "--chrome-30":      oklchStr(c30),
    "--rule":           oklchStr(rule),
    "--rule-strong":    oklchStr(ruleS),
    "--text-primary":   oklchStr(fg),
    "--text-secondary": oklchStr(textSec),
    "--text-meta":      oklchStr(cmt),
    "--accent-gold":    oklchStr(kw),
    "--accent-orange":  oklchStr(fn),
    "--accent-red":     oklchStr(inv),
    "--accent":         oklchStr(kw),
    "--foil":           oklchStr(cls),
    "--status-active":  oklchStr(kw),
    "--status-done":    oklchStr(str),
    "--status-fresh":   oklchStr(statusFresh),
    "--status-blocked": oklchStr(inv),
    "--status-nominal": oklchStr(tag),
    "--glass-bg-rest":   oklchStr(panel, 0.4),
    "--glass-bg-hover":  oklchStr(panel, 0.78),
    "--glass-bg-faded":  oklchStr(panel, 0.12),
    "--glass-border-rest":  oklchStr(c15, 0.25),
    "--glass-border-hover": oklchStr(c25, 0.55),
  };
};

// ────── main ────────────────────────────────────────────────────────────────

const outNames = [];
for (const item of CURATED) {
  const { src, label } = item;
  const file = path.join(RAINGLOW, `${src}.json`);
  if (!fs.existsSync(file)) {
    console.error(`miss: ${src}`);
    continue;
  }
  const rg = JSON.parse(fs.readFileSync(file, "utf8"));
  const vars = buildVars(rg);
  // Allow override via { out: "..." } · used for non-rg names like apotheosis.
  const name = item.out ? item.out : `rg-${src}`;
  const theme = { name, label, vars };
  const outFile = path.join(OUT_DIR, `theme-${name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(theme, null, 2) + "\n");
  outNames.push(name);
  console.log(`wrote ${path.relative(REPO, outFile)}`);
}

console.log(`\n${outNames.length} themes:`, outNames.join(", "));
