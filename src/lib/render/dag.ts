// @module render/dag
// @exports renderDagLayers, renderCriticalPath
// @entry roadmap

import type { DagLayer, RenderOpts } from './types.ts';
import { STATUS_EMOJI, styled, emoji, ANSI } from './style.ts';
import { truncate } from './layout.ts';
import { progressBar } from './bars.ts';

/** Render layered DAG view with progress header and per-layer node listing. */
export function renderDagLayers(layers: DagLayer[], opts: RenderOpts, total: number, done: number): string {
  const lines: string[] = [];

  // Header
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const bar = progressBar(done, total, 20);
  lines.push(`Progress: ${done}/${total} [${bar}] ${pct}%`);
  lines.push('');

  // Layers
  for (const layer of layers) {
    const sorted = [...layer.nodes].sort((a, b) => a.id.localeCompare(b.id));
    const nodeStrs = sorted.map(dn => {
      const icon = emoji(STATUS_EMOJI[dn.status] ?? '', opts);
      const label = dn.status === 'current'
        ? styled(dn.id, ANSI.bold, opts)
        : dn.id;
      const desc = dn.desc ? styled(` ${truncate(dn.desc, 40)}`, ANSI.dim, opts) : '';
      return `${icon}${icon ? ' ' : ''}${label}${desc}`;
    });
    const levelTag = styled(`L${String(layer.level).padStart(2, '0')}`, ANSI.gray, opts);
    lines.push(`${levelTag}  ${nodeStrs.join('  ')}`);
  }

  return lines.join('\n');
}

/** Render critical path as arrow-separated node chain. */
export function renderCriticalPath(path: string[], opts: RenderOpts): string {
  if (path.length === 0) return '';
  const arrow = styled(' \u2192 ', ANSI.dim, opts);
  return `Critical Path: ${path.join(arrow)}`;
}
