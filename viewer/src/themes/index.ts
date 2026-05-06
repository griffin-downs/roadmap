// @module viewer/themes
// @exports Theme, themes, defaultTheme, applyTheme, findTheme
//
// Pre-baked oklch palettes derived offline by running node-vibrant against
// the ML Prague poster set + the Compiling-Agent-State whitepaper PDF.
// Each entry overrides only the CSS variables it has values for · missing
// variables fall through to the defaults declared in viewer/index.html.
//
// Generation pipeline (offline, not run by the viewer):
//   pdftoppm -jpeg -r 80 mlprague-poster-X.pdf poster-X
//   node /tmp/theme-render/extract.mjs poster-X-1.jpg poster-x "<label>"
// → JSON dropped here verbatim. To add a theme, run the same pipeline and
// import the resulting JSON below.
//
// Default = poster-h · matches the existing hand-tuned palette in
// viewer/index.html so the picker only adds alternates without rewriting
// the canonical look.

export interface Theme {
  name: string;
  label: string;
  vars: Record<string, string>;
}

import posterA from "./theme-poster-a.json";
import posterB from "./theme-poster-b.json";
import posterD from "./theme-poster-d.json";
import posterF from "./theme-poster-f.json";
import posterH from "./theme-poster-h.json";
import whitepaper from "./theme-whitepaper.json";

export const themes: Theme[] = [
  posterH as Theme,
  posterA as Theme,
  posterB as Theme,
  posterD as Theme,
  posterF as Theme,
  whitepaper as Theme,
];

export const defaultTheme: Theme = posterH as Theme;

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v);
  }
}

export function findTheme(name: string): Theme | undefined {
  return themes.find((t) => t.name === name);
}
