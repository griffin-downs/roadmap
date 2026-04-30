// useTooltipPosition — pure positioning function.
//
// Receives an anchor's bounding rect, the viewport size, and the tooltip
// pane's measured size; returns absolute {top, left} plus the chosen
// placement. Right is preferred; falls back to left, below, above when
// the right option would overflow. Always clamps inside the viewport
// with an 8px safety margin. Pure function — testable, no Vue deps.

const OFFSET = 16;
const MARGIN = 8;

export type Placement = "right" | "left" | "below" | "above";

export interface AnchorRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PositionInput {
  anchorRect: AnchorRect;
  viewport: { width: number; height: number };
  paneSize: { width: number; height: number };
}

export interface PositionResult {
  top: number;
  left: number;
  placement: Placement;
}

export function computeTooltipPosition(input: PositionInput): PositionResult {
  const { anchorRect: a, viewport: v, paneSize: p } = input;

  if (a.right + OFFSET + p.width + MARGIN <= v.width) {
    return clamp({ top: a.top, left: a.right + OFFSET, placement: "right" }, v, p);
  }
  if (a.left - OFFSET - p.width >= MARGIN) {
    return clamp({ top: a.top, left: a.left - OFFSET - p.width, placement: "left" }, v, p);
  }
  if (a.bottom + OFFSET + p.height + MARGIN <= v.height) {
    return clamp({ top: a.bottom + OFFSET, left: a.left, placement: "below" }, v, p);
  }
  return clamp({ top: a.top - OFFSET - p.height, left: a.left, placement: "above" }, v, p);
}

function clamp(
  r: PositionResult,
  v: { width: number; height: number },
  p: { width: number; height: number },
): PositionResult {
  const left = Math.max(MARGIN, Math.min(r.left, v.width - p.width - MARGIN));
  const top = Math.max(MARGIN, Math.min(r.top, v.height - p.height - MARGIN));
  return { top, left, placement: r.placement };
}
