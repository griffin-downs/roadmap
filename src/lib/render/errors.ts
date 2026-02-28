// @module render/errors
// @exports renderErrorPanel
// @entry roadmap

import type { RenderOpts } from './types.ts';

/** Render a boxed error panel with code, message, and optional fix steps. */
export function renderErrorPanel(error: { code: string; message: string; fix?: string[] }, opts: RenderOpts): string {
  const width = Math.min(opts.width || 80, 80);
  const inner = width - 4; // "│ " + content + " │"

  const titleStr = ` Error: ${error.code} `;
  const topFill = Math.max(0, inner - titleStr.length);
  const top = `\u250C\u2500${titleStr}${'\u2500'.repeat(topFill)}\u2500\u2510`;
  const bot = `\u2514${'\u2500'.repeat(width - 2)}\u2518`;

  const pad = (s: string) => {
    const trimmed = s.slice(0, inner);
    return `\u2502 ${trimmed.padEnd(inner)} \u2502`;
  };

  const lines: string[] = [top];

  // Message lines
  for (const ml of error.message.split('\n')) {
    lines.push(pad(ml));
  }

  // Fix steps
  if (error.fix && error.fix.length > 0) {
    lines.push(pad(''));
    lines.push(pad('Fix:'));
    for (const step of error.fix) {
      lines.push(pad(` \u2022 ${step}`));
    }
  }

  lines.push(bot);
  return lines.join('\n');
}
