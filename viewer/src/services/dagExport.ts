// dagExport — PNG / SVG export of the current DAG topology view.
//
// Pure browser service. Two entry points:
//
//   exportSvg(svgEl, opts)  -> Blob (image/svg+xml)
//   exportPng(svgEl, opts)  -> Promise<Blob> (image/png)
//
// SVG export inlines computed CSS for nodes/edges so the file renders
// standalone (no <link> dependency on viewer stylesheet). PNG export
// rasterises the inlined SVG via an off-screen <img> + <canvas> at a
// caller-specified scale (default 2× for paper figures).
//
// Caller is responsible for providing the live <svg> element and for
// triggering the actual download (e.g. via downloadBlob helper).
//
// Guards first. One concern: serialise current SVG state -> blob.

export interface ExportOptions {
  /** background fill written into the exported document; null = transparent */
  background?: string | null;
  /** export pixel scale (PNG only); default 2 */
  scale?: number;
  /** override width/height; default uses svg viewBox/getBoundingClientRect */
  width?: number;
  height?: number;
}

const DEFAULT_BG: string | null = null;
const DEFAULT_SCALE = 2;

export function exportSvg(svgEl: SVGSVGElement, opts: ExportOptions = {}): Blob {
  const cloned = cloneAndInline(svgEl, opts);
  const xml = new XMLSerializer().serializeToString(cloned);
  const doc = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
  return new Blob([doc], { type: "image/svg+xml;charset=utf-8" });
}

export async function exportPng(
  svgEl: SVGSVGElement,
  opts: ExportOptions = {},
): Promise<Blob> {
  const svgBlob = exportSvg(svgEl, opts);
  const { width, height } = resolveDimensions(svgEl, opts);
  const scale = opts.scale ?? DEFAULT_SCALE;
  const dataUrl = await blobToDataUrl(svgBlob);
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("dagExport: 2d context unavailable");
  if (opts.background !== null && opts.background !== undefined) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function cloneAndInline(
  svgEl: SVGSVGElement,
  opts: ExportOptions,
): SVGSVGElement {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const { width, height } = resolveDimensions(svgEl, opts);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  inlineComputedStyles(svgEl, clone);
  applyBackground(clone, opts.background ?? DEFAULT_BG, width, height);
  return clone;
}

function resolveDimensions(
  svgEl: SVGSVGElement,
  opts: ExportOptions,
): { width: number; height: number } {
  if (opts.width && opts.height) return { width: opts.width, height: opts.height };
  const rect = svgEl.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }
  const vb = svgEl.viewBox.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { width: vb.width, height: vb.height };
  }
  return { width: 1200, height: 800 };
}

function inlineComputedStyles(src: SVGSVGElement, dst: SVGSVGElement): void {
  const srcEls = src.querySelectorAll<SVGElement>("*");
  const dstEls = dst.querySelectorAll<SVGElement>("*");
  if (srcEls.length !== dstEls.length) return;
  for (let i = 0; i < srcEls.length; i = i + 1) {
    const computed = window.getComputedStyle(srcEls[i]);
    const inline = serializeRelevantStyles(computed);
    if (inline.length > 0) dstEls[i].setAttribute("style", inline);
  }
}

const RELEVANT_PROPS: ReadonlyArray<string> = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "color",
];

function serializeRelevantStyles(computed: CSSStyleDeclaration): string {
  const parts: string[] = [];
  for (const prop of RELEVANT_PROPS) {
    const v = computed.getPropertyValue(prop);
    if (v && v !== "none" && v !== "normal") parts.push(`${prop}:${v}`);
  }
  return parts.join(";");
}

function applyBackground(
  el: SVGSVGElement,
  bg: string | null,
  width: number,
  height: number,
): void {
  if (!bg) return;
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", "0");
  rect.setAttribute("y", "0");
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("fill", bg);
  el.insertBefore(rect, el.firstChild);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("blob read failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("image load failed"));
    img.onload = () => resolve(img);
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("canvas toBlob returned null"));
    }, "image/png");
  });
}

export const _internals = {
  cloneAndInline,
  resolveDimensions,
  serializeRelevantStyles,
};
