// @module viewer/themes
// @exports Theme, themes, defaultTheme, applyTheme, findTheme
//
// Two palette families ship in the picker:
//
//   poster-* / whitepaper  — pre-baked oklch palettes derived offline by
//                            running node-vibrant against the ML Prague poster
//                            set + the Compiling-Agent-State whitepaper PDF.
//   rg-*                   — extracted from Dayle Rees's rainglow VS Code
//                            theme set. See scripts/extract-rainglow-themes.mjs
//                            for the mapping (TextMate token colors → CSS vars,
//                            sRGB → OKLCh inline conversion).
//
// Each entry overrides only the CSS variables it has values for · missing
// variables fall through to the defaults declared in viewer/index.html.
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

import rgAzure from "./theme-rg-azure.json";
import rgEarthsong from "./theme-rg-earthsong.json";
import rgLavender from "./theme-rg-lavender.json";
import rgHawaii from "./theme-rg-hawaii.json";
import rgHeroku from "./theme-rg-heroku.json";
import rgHyrule from "./theme-rg-hyrule.json";
import rgIceberg from "./theme-rg-iceberg.json";
import rgIcebergLight from "./theme-rg-iceberg-light.json";
import rgJoker from "./theme-rg-joker.json";
import rgMintchoc from "./theme-rg-mintchoc.json";
import rgPeacock from "./theme-rg-peacock.json";
import rgPeacocksInSpace from "./theme-rg-peacocks-in-space.json";
import rgRainbow from "./theme-rg-rainbow.json";
import rgShrek from "./theme-rg-shrek.json";
import rgSolarflare from "./theme-rg-solarflare.json";
import rgTron from "./theme-rg-tron.json";
import rgGithub from "./theme-rg-github.json";
import rgMonzo from "./theme-rg-monzo.json";
import rgDarkside from "./theme-rg-darkside.json";
import rgCodecourse from "./theme-rg-codecourse.json";
import rgYitzchok from "./theme-rg-yitzchok.json";
import apotheosis from "./theme-apotheosis.json";
import monokai from "./theme-monokai.json";

export const themes: Theme[] = [
  // poster-derived (the project's own canonical palettes)
  posterH as Theme,
  posterA as Theme,
  posterB as Theme,
  posterD as Theme,
  posterF as Theme,
  whitepaper as Theme,
  // user-named picks (curated specific themes)
  apotheosis as Theme,
  monokai as Theme,
  rgCodecourse as Theme,
  rgYitzchok as Theme,
  // rainglow curated set
  rgTron as Theme,
  rgAzure as Theme,
  rgIceberg as Theme,
  rgIcebergLight as Theme,
  rgPeacock as Theme,
  rgPeacocksInSpace as Theme,
  rgHyrule as Theme,
  rgShrek as Theme,
  rgJoker as Theme,
  rgEarthsong as Theme,
  rgSolarflare as Theme,
  rgMonzo as Theme,
  rgDarkside as Theme,
  rgLavender as Theme,
  rgHeroku as Theme,
  rgHawaii as Theme,
  rgMintchoc as Theme,
  rgRainbow as Theme,
  rgGithub as Theme,
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
