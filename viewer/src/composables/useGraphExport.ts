// useGraphExport — SVG/PNG export of an in-DOM <svg> element.
//
// §Dumb-components: components hold an svg ref + emit click. Export logic
// (style inlining, blob download, canvas rasterization) lives here.
//
// SVG path: clone svg · inline computed styles on every node · serialize ·
// blob+download. Result is standalone (opens in a browser without 404s).
//
// PNG path: build the standalone SVG · render to canvas at 2x DPR · toBlob.

import { ref } from "vue";
import type { Ref } from "vue";

export type ExportFormat = "svg" | "png";

export interface UseGraphExport {
  exporting: Ref<boolean>;
  exportSvg: (svgEl: SVGSVGElement | null, baseName: string) => Promise<void>;
  exportPng: (svgEl: SVGSVGElement | null, baseName: string) => Promise<void>;
}

export function useGraphExport(): UseGraphExport {
  const exporting: Ref<boolean> = ref<boolean>(false);

  async function exportSvg(svgEl: SVGSVGElement | null, baseName: string): Promise<void> {
    if (svgEl === null) throw new Error("useGraphExport.exportSvg: svgEl is null");
    exporting.value = true;
    try {
      const standalone = buildStandaloneSvg(svgEl);
      const blob = new Blob([standalone], { type: "image/svg+xml;charset=utf-8" });
      triggerDownload(blob, `${baseName}-${isoStamp()}.svg`);
    } finally {
      exporting.value = false;
    }
  }

  async function exportPng(svgEl: SVGSVGElement | null, baseName: string): Promise<void> {
    if (svgEl === null) throw new Error("useGraphExport.exportPng: svgEl is null");
    exporting.value = true;
    try {
      const standalone = buildStandaloneSvg(svgEl);
      const blob = await rasterize(standalone, svgEl);
      triggerDownload(blob, `${baseName}-${isoStamp()}.png`);
    } finally {
      exporting.value = false;
    }
  }

  return { exporting, exportSvg, exportPng };
}

// Build a self-contained SVG string: clone, inline computed styles, add xmlns.
function buildStandaloneSvg(source: SVGSVGElement): string {
  const clone = source.cloneNode(true) as SVGSVGElement;
  inlineStyles(source, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  if (clone.getAttribute("width") === null || clone.getAttribute("height") === null) {
    const rect = source.getBoundingClientRect();
    clone.setAttribute("width", String(rect.width));
    clone.setAttribute("height", String(rect.height));
  }
  const xml = new XMLSerializer().serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${xml}`;
}

// Walk source + clone in lockstep · copy resolved styles onto clone.
// Scoped CSS doesn't follow into a serialized SVG, so we materialize it.
const STYLE_PROPS: readonly string[] = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray",
  "stroke-opacity", "opacity", "font-family", "font-size", "font-weight",
  "letter-spacing", "text-anchor", "dominant-baseline", "filter", "visibility",
  "color", "cursor",
];

function inlineStyles(source: Element, target: Element): void {
  const sourceChildren = source.children;
  const targetChildren = target.children;
  if (source instanceof SVGElement && target instanceof SVGElement) {
    const computed = window.getComputedStyle(source);
    let inline = "";
    for (const prop of STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value !== "" && value !== "normal") inline += `${prop}:${value};`;
    }
    if (inline !== "") target.setAttribute("style", inline);
  }
  for (let i = 0; i < sourceChildren.length; i += 1) {
    inlineStyles(sourceChildren[i], targetChildren[i]);
  }
}

// Rasterize standalone SVG to PNG blob at 2x DPR.
async function rasterize(svgString: string, svgEl: SVGSVGElement): Promise<Blob> {
  const rect = svgEl.getBoundingClientRect();
  const dpr = Math.max(2, window.devicePixelRatio);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("useGraphExport.rasterize: 2d context unavailable");
  ctx.scale(dpr, dpr);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  await drawImage(ctx, url, width, height);
  return await canvasToBlob(canvas);
}

function drawImage(ctx: CanvasRenderingContext2D, url: string, w: number, h: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      ctx.drawImage(img, 0, 0, w, h);
      resolve();
    };
    img.onerror = (): void => reject(new Error("useGraphExport.drawImage: image load failed"));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob): void => {
      if (blob === null) reject(new Error("useGraphExport.canvasToBlob: toBlob returned null"));
      else resolve(blob);
    }, "image/png");
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout((): void => URL.revokeObjectURL(url), 1000);
}

function isoStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
}
