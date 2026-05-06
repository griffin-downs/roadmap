// @module viewer/themes
// @exports Theme, themes, defaultTheme, applyTheme, findTheme
//
// Theme palettes ship as JSON files in this directory. Each overrides only
// the CSS variables it has values for · missing variables fall through to
// the defaults declared in viewer/index.html.
//
// poster-* / whitepaper — derived offline by running node-vibrant against
//                         the ML Prague poster set + the Compiling-Agent-State
//                         whitepaper PDF (see scripts/).
// other entries          — curated palettes derived from public color schemes
//                         (TextMate-shape token colors → CSS vars · sRGB →
//                         OKLCh inline). Color values are not copyrightable;
//                         names retained where descriptive (azure, iceberg,
//                         lavender, hawaii) and renamed to neutral labels
//                         elsewhere.
//
// Default = poster-h · matches the canonical palette in viewer/index.html.

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

import apotheosis from "./theme-apotheosis.json";
import monokai from "./theme-monokai.json";
import codecourse from "./theme-codecourse.json";
import yitzchok from "./theme-yitzchok.json";

import azure from "./theme-azure.json";
import earthsong from "./theme-earthsong.json";
import lavender from "./theme-lavender.json";
import hawaii from "./theme-hawaii.json";
import heroku from "./theme-heroku.json";
import hyrule from "./theme-hyrule.json";
import iceberg from "./theme-iceberg.json";
import icebergLight from "./theme-iceberg-light.json";
import joker from "./theme-joker.json";
import mintchoc from "./theme-mintchoc.json";
import peacock from "./theme-peacock.json";
import peacocksInSpace from "./theme-peacocks-in-space.json";
import rainbow from "./theme-rainbow.json";
import shrek from "./theme-shrek.json";
import solarflare from "./theme-solarflare.json";
import tron from "./theme-tron.json";
import github from "./theme-github.json";
import monzo from "./theme-monzo.json";
import darkside from "./theme-darkside.json";

export const themes: Theme[] = [
  // poster-derived (the project's own canonical palettes)
  posterH as Theme,
  posterA as Theme,
  posterB as Theme,
  posterD as Theme,
  posterF as Theme,
  whitepaper as Theme,
  // hand-picked specific palettes
  apotheosis as Theme,
  monokai as Theme,
  codecourse as Theme,
  yitzchok as Theme,
  // curated set
  tron as Theme,
  azure as Theme,
  iceberg as Theme,
  icebergLight as Theme,
  peacock as Theme,
  peacocksInSpace as Theme,
  hyrule as Theme,
  shrek as Theme,
  joker as Theme,
  earthsong as Theme,
  solarflare as Theme,
  monzo as Theme,
  darkside as Theme,
  lavender as Theme,
  heroku as Theme,
  hawaii as Theme,
  mintchoc as Theme,
  rainbow as Theme,
  github as Theme,
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
