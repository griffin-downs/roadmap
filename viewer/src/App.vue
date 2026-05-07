<script setup lang="ts">
// Roadmap viewer shell — composes the hierarchical DAG renderer with a
// hover/click tooltip-pane for per-node detail. The tooltip-pane is the
// only per-node detail surface.
//
// §Dumb-components: this shell composes; DagViewer is a pure props-in/
// events-out component. No fetch/state-derivation lives in its script
// setup. Click on any node bubbles up to anchor the tooltip pane here.
//
// r2-hero: ?print=1 URL toggle drives a poster-grade aesthetic mode with
// chrome hidden and a single pinned node (?pin=<node-id>).

import { computed, nextTick, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import DagViewer from "./components/DagViewer.vue";
import NodeTooltipPane from "./components/NodeTooltipPane.vue";
import LineagePane from "./components/LineagePane.vue";
import type { RepoRoadmap } from "./services/roadmapReader";

// Local type — was previously exported from the now-removed NodeSidePanel.
interface InspectedNode {
  id: string;
  desc: string;
  produces?: string[];
  validators?: { rule: string; passed: boolean; evidence?: string }[];
}
import { onMounted, onUnmounted } from "vue";
import type { AnchorRect } from "./composables/useTooltipPosition";
import { useDagPayload } from "./services/dagReader";
import { DEFAULT_LAYOUT_OPTIONS, useDagLayout } from "./composables/useDagLayout";
import { applyTheme, defaultTheme, findTheme, themes, type Theme } from "./themes";

// Selected repo path · drives /api/roadmap-dag?repo=<path> re-fetch.
// Default empty → server falls back to host repo. Initialized from the
// first roadmap-list entry once that loads (see watcher below).
const selectedRepo: Ref<string> = ref<string>("");
// g-lineage-pane · clicking a thumbnail sets selectedDag, which feeds the
// dag query param via useDagPayload's selection ref. Cleared whenever the
// repo changes so we don't carry a stale dagId across repos.
const selectedDag: Ref<string> = ref<string>("");
const dagSelection: Ref<{ dag?: string }> = ref<{ dag?: string }>({});
watch(selectedDag, (id) => { dagSelection.value = id ? { dag: id } : {}; });
const payload = useDagPayload(dagSelection, selectedRepo);
watch(selectedRepo, () => { selectedDag.value = ""; });
function onLineageSelect(dagId: string): void { selectedDag.value = dagId; }

// Print mode — opt-in via ?print=1, optional ?pin=<node-id> pre-selects
const url = new URL(window.location.href);
const printMode: Ref<boolean> = ref<boolean>(url.searchParams.get("print") === "1");
const printPin: Ref<string> = ref<string>(url.searchParams.get("pin") ?? "");
const showTitle: Ref<boolean> = ref<boolean>(url.searchParams.get("title") !== "0");
const milestoneIds: Ref<string[]> = ref<string[]>(
  (url.searchParams.get("milestones") ?? "").split(",").map(s => s.trim()).filter(Boolean)
);
// r2-hero · ?tooltip=0 disables tooltip + connector for print/hero capture.
// Default true · interactive print mode still gets the floating panel + arrow.
// Focus mode · collapse repo-rail + lineage strip so canvas owns the screen.
// Distinct from printMode (no poster styling, just hides the side UI).
const focusMode: Ref<boolean> = ref<boolean>(false);
// Calm mode · disables animations across the viewer. localStorage-backed.
// Bound as data-calm on the .viewer-shell root for CSS to gate animations.
const calm: Ref<boolean> = ref<boolean>(
  (() => { try { return localStorage.getItem("viewer.calm") === "true"; } catch { return false; } })(),
);
watch(calm, (v) => { try { localStorage.setItem("viewer.calm", String(v)); } catch { /* ignore */ } });
// DAG-info panel · shows head-level metadata (id, desc, init, term, progress).
// Toggled from the toolbar; closed by default so it doesn't compete with the
// canvas. Persists per-session via localStorage.
const dagInfoOpen: Ref<boolean> = ref<boolean>(
  (() => { try { return localStorage.getItem("viewer-dag-info-open") === "1"; } catch { return false; } })(),
);
function toggleDagInfo(): void {
  dagInfoOpen.value = !dagInfoOpen.value;
  try { localStorage.setItem("viewer-dag-info-open", dagInfoOpen.value ? "1" : "0"); } catch { /* ignore */ }
}
const showTooltipInPrint: Ref<boolean> = ref<boolean>(
  url.searchParams.get("tooltip") !== "0",
);

// hierarchical layout · print mode flips to LR (landscape canvas) + bumps
// node dimensions and gaps for poster breathing room. Default TB unchanged.
const layoutOptions = computed(() => {
  if (printMode.value) {
    return {
      ...DEFAULT_LAYOUT_OPTIONS,
      direction: 'LR' as const,
      nodeWidth: 280,
      nodeHeight: 160,
      levelGap: 100,
      columnGap: 140,
      marginX: 60,
      marginY: 60,
    };
  }
  return { ...DEFAULT_LAYOUT_OPTIONS };
});
const layout = useDagLayout(payload, layoutOptions);

// All roadmaps available on the system (host repo · or fleet members
// when host has fleet.json). Live-updated via /api/events 'roadmap' stream.
//
// p-defer-discovery (r4): /api/roadmap walks ~/src and is the first-paint
// bottleneck. The canvas only needs /api/roadmap-dag to render — so this
// fetch is deferred to requestIdleCallback (or setTimeout(_, 0) fallback)
// after onMounted, letting the DAG paint immediately. While pending we
// surface an isLoading flag so the aside can show a "loading roadmaps…"
// state instead of being silently absent.
const allRoadmaps: Ref<RepoRoadmap[]> = ref<RepoRoadmap[]>([]);
const roadmapsLoading: Ref<boolean> = ref<boolean>(true);
let roadmapsEventSource: EventSource | null = null;
let roadmapsTimer: ReturnType<typeof setInterval> | null = null;
const ROADMAPS_POLL_MS = 30_000;

async function fetchRoadmaps(): Promise<void> {
  try {
    const response = await fetch("/api/roadmap");
    if (!response.ok) return;
    allRoadmaps.value = (await response.json()) as RepoRoadmap[];
  } catch {
    // network error · retain last known state
  } finally {
    roadmapsLoading.value = false;
  }
}

function openRoadmapsEventStream(): void {
  try {
    const source = new EventSource("/api/events");
    source.addEventListener("roadmap", () => void fetchRoadmaps());
    roadmapsEventSource = source;
  } catch {
    // EventSource unavailable · poll fallback covers us
  }
}

onMounted(() => {
  const kick = (): void => {
    void fetchRoadmaps();
    openRoadmapsEventStream();
    roadmapsTimer = setInterval(() => void fetchRoadmaps(), ROADMAPS_POLL_MS);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => kick());
  } else {
    setTimeout(() => kick(), 0);
  }
});

onUnmounted(() => {
  if (roadmapsTimer !== null) clearInterval(roadmapsTimer);
  if (roadmapsEventSource !== null) roadmapsEventSource.close();
});

// Default selectedRepo to host repo (first entry) once roadmaps load.
// Only sets once, when still empty — user clicks override afterwards.
watch(allRoadmaps, (rows) => {
  if (selectedRepo.value === "" && rows.length > 0) {
    selectedRepo.value = rows[0].path;
  }
}, { immediate: true });

// g-repo-rail · group allRoadmaps by repo path (one row per repo) and
// derive a sortable status badge. Most repos have one current head; if
// scan finds multiple, the head row carries lineage[] for the whole
// timeline (most-recent first per d-lineage-walk).
type RepoRailStatus = "active" | "fresh" | "complete" | "no-dag";

interface RepoRailRow {
  repo: string;
  path: string;
  dagId: string | null;
  status: RepoRailStatus;
  done: number;
  total: number;
  mtime: number;
  lineage: import("./services/roadmapReader").LineageEntry[];
}

function classifyRepoRail(r: RepoRoadmap, head: RepoRailRow["lineage"][number] | undefined): RepoRailStatus {
  if (r.status === "no-dag" || r.status === "error") return "no-dag";
  if (r.completionPct === 100) return "complete";
  if (head !== undefined && head.doneCount === 0) return "fresh";
  return "active";
}

const repoRailRows: ComputedRef<RepoRailRow[]> = computed<RepoRailRow[]>(() => {
  const rows: RepoRailRow[] = allRoadmaps.value.map((r) => {
    const lineage = r.lineage ?? [];
    const head = lineage[0];
    const total = head?.nodeCount ?? 0;
    const done = head?.doneCount ?? 0;
    const mtime = head?.mtime ?? 0;
    return {
      repo: r.repo,
      path: r.path,
      dagId: r.dagId ?? head?.id ?? null,
      status: classifyRepoRail(r, head),
      done,
      total,
      mtime,
      lineage,
    };
  });
  // Two buckets: active first (mtime DESC), then everything else (mtime DESC).
  // User wants the active batch visually prominent at top — fresh/complete/no-dag
  // collapse into a single recency-sorted tail beneath.
  rows.sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return b.mtime - a.mtime;
  });
  return rows;
});

// Lineage hook for next node (g-lineage-pane) · selected repo's lineage[].
const selectedRepoLineage: ComputedRef<RepoRailRow["lineage"]> = computed(() => {
  const row = repoRailRows.value.find((r) => r.path === selectedRepo.value);
  return row?.lineage ?? [];
});

function formatRailMtime(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

// Tooltip-pane state
const tooltipNodeId: Ref<string> = ref<string>("");
const tooltipAnchor: Ref<AnchorRect | null> = ref<AnchorRect | null>(null);
const tooltipExpanded: Ref<boolean> = ref<boolean>(false);

// ── Toolbar state ──────────────────────────────────────────────────
// Global font scale for chrome text. Cycled by A−/A+; persists. The CSS
// var --font-scale is multiplied into chrome font-size declarations.
// SVG canvas text is NOT scaled (zoom controls handle that).
const FONT_SCALE_STEPS = [0.875, 1.0, 1.125, 1.25] as const;
function loadFontScale(): number {
  try {
    const v = localStorage.getItem("viewer-font-scale");
    const n = v ? Number(v) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch { return 1; }
}
const fontScale: Ref<number> = ref<number>(loadFontScale());
watch(fontScale, (v) => {
  document.documentElement.style.setProperty("--font-scale", String(v));
  try { localStorage.setItem("viewer-font-scale", String(v)); } catch { /* ignore */ }
}, { immediate: true });

function bumpFontScale(dir: 1 | -1): void {
  const idx = FONT_SCALE_STEPS.findIndex((s) => Math.abs(s - fontScale.value) < 1e-3);
  const cur = idx === -1 ? FONT_SCALE_STEPS.indexOf(1.0) : idx;
  const next = Math.max(0, Math.min(FONT_SCALE_STEPS.length - 1, cur + dir));
  fontScale.value = FONT_SCALE_STEPS[next];
}

// Element scale · independent of font scale. Multiplies UI dimensions
// (panel widths, button sizes, padding, gaps) so the chrome can grow or
// shrink without affecting text. Bound to --ui-scale on documentElement.
const UI_SCALE_STEPS = [0.875, 1.0, 1.125, 1.25] as const;
function loadUiScale(): number {
  try {
    const v = localStorage.getItem("viewer-ui-scale");
    const n = v ? Number(v) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch { return 1; }
}
const uiScale: Ref<number> = ref<number>(loadUiScale());
watch(uiScale, (v) => {
  document.documentElement.style.setProperty("--ui-scale", String(v));
  try { localStorage.setItem("viewer-ui-scale", String(v)); } catch { /* ignore */ }
}, { immediate: true });

function bumpUiScale(dir: 1 | -1): void {
  const idx = UI_SCALE_STEPS.findIndex((s) => Math.abs(s - uiScale.value) < 1e-3);
  const cur = idx === -1 ? UI_SCALE_STEPS.indexOf(1.0) : idx;
  const next = Math.max(0, Math.min(UI_SCALE_STEPS.length - 1, cur + dir));
  uiScale.value = UI_SCALE_STEPS[next];
}

// ── Theme picker ──────────────────────────────────────────────────
// Pre-baked oklch palettes (viewer/src/themes/) derived from poster +
// whitepaper images via node-vibrant. The toolbar 🎨 button opens a
// glass-surface popover · clicking a theme applies it via CSS variables
// on documentElement and persists the name in localStorage.
const THEME_KEY = "viewer-theme";
function loadTheme(): Theme {
  try {
    const name = localStorage.getItem(THEME_KEY);
    if (name) {
      const t = findTheme(name);
      if (t) return t;
    }
  } catch { /* ignore */ }
  return defaultTheme;
}
const currentTheme: Ref<Theme> = ref<Theme>(loadTheme());
const themePickerOpen: Ref<boolean> = ref<boolean>(false);
watch(
  currentTheme,
  (t) => {
    applyTheme(t);
    try { localStorage.setItem(THEME_KEY, t.name); } catch { /* ignore */ }
  },
  { immediate: true },
);
function pickTheme(t: Theme): void {
  currentTheme.value = t;
  themePickerOpen.value = false;
}
function toggleThemePicker(): void { themePickerOpen.value = !themePickerOpen.value; }

const tooltipNode: ComputedRef<InspectedNode | null> = computed(() => {
  const p = payload.value;
  if (p === null || !tooltipNodeId.value) return null;
  const n = p.head.nodes[tooltipNodeId.value];
  if (!n) return null;
  return n as unknown as InspectedNode;
});
const tooltipNodeData = computed<(Record<string, unknown> & { id: string }) | null>(() => {
  const n = tooltipNode.value;
  return n === null ? null : (n as unknown as Record<string, unknown> & { id: string });
});

function onNodeSelected(nodeId: string, anchorRect?: DOMRect): void {
  // §click-trace · helps users verify the pipeline in DevTools when the
  // tooltip doesn't appear · safe to leave (single console line per click).
  console.debug("[viewer] node-selected", { nodeId, hasAnchor: !!anchorRect });
  tooltipNodeId.value = nodeId;
  tooltipExpanded.value = false;
  if (anchorRect) {
    tooltipAnchor.value = {
      top: anchorRect.top,
      left: anchorRect.left,
      right: anchorRect.right,
      bottom: anchorRect.bottom,
      width: anchorRect.width,
      height: anchorRect.height,
    };
  }
}

// r2-hero · screen-pixel connector overlay · pinned-node-right → tooltip-left
interface ScreenPos { x: number; y: number }
interface ScreenRect extends ScreenPos { w: number; h: number }
const pinnedScreenPos: Ref<ScreenPos | null> = ref<ScreenPos | null>(null);
const tooltipScreenRect: Ref<ScreenRect | null> = ref<ScreenRect | null>(null);
const vpW: Ref<number> = ref<number>(typeof window !== "undefined" ? window.innerWidth : 1600);
const vpH: Ref<number> = ref<number>(typeof window !== "undefined" ? window.innerHeight : 900);

function updateConnectorAnchors(): void {
  const selectedEl = document.querySelector(".dag-svg .node--selected .node-rect")
    ?? document.querySelector(".dag-svg .node--selected rect")
    ?? document.querySelector(".dag-svg .node--selected");
  if (!selectedEl) {
    pinnedScreenPos.value = null;
  } else {
    const r = (selectedEl as Element).getBoundingClientRect();
    pinnedScreenPos.value = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  const tooltipEl = document.querySelector(".dag-tooltip--print");
  if (!tooltipEl) {
    tooltipScreenRect.value = null;
  } else {
    const tr = (tooltipEl as Element).getBoundingClientRect();
    tooltipScreenRect.value = { x: tr.left, y: tr.top, w: tr.width, h: tr.height };
  }
  vpW.value = window.innerWidth;
  vpH.value = window.innerHeight;
}

const connectorPath: ComputedRef<string> = computed<string>(() => {
  const p = pinnedScreenPos.value;
  const t = tooltipScreenRect.value;
  if (!p || !t) return "";
  // node-center → intersection with tooltip's bbox along the line between centers.
  const sx = p.x;
  const sy = p.y;
  const tcx = t.x + t.w / 2;
  const tcy = t.y + t.h / 2;
  const dx = tcx - sx;
  const dy = tcy - sy;
  const ax = dx === 0 ? Infinity : Math.abs((t.w / 2) / dx);
  const ay = dy === 0 ? Infinity : Math.abs((t.h / 2) / dy);
  const a = Math.min(ax, ay);
  const pad = 6;
  const ex = tcx - dx * a - Math.sign(dx) * pad * (ax <= ay ? 1 : 0);
  const ey = tcy - dy * a - Math.sign(dy) * pad * (ay < ax ? 1 : 0);
  // gentle S-curve: control points biased perpendicular to dominant axis
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const c1x = horizontal ? (sx + ex) / 2 : sx;
  const c1y = horizontal ? sy : (sy + ey) / 2;
  const c2x = horizontal ? (sx + ex) / 2 : ex;
  const c2y = horizontal ? ey : (sy + ey) / 2;
  return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`;
});

function computePinAnchor(): void {
  if (!printMode.value || !printPin.value) return;
  void nextTick(() => {
    setTimeout(() => {
      const el = document.querySelector<SVGGElement>(".dag-svg .node--selected");
      if (!el) return;
      const r = el.getBoundingClientRect();
      tooltipAnchor.value = {
        top: r.top, left: r.left, right: r.right,
        bottom: r.bottom, width: r.width, height: r.height,
      };
    }, 300);
  });
}

watch(
  () => [printMode.value, printPin.value, layout.value?.nodes.length] as const,
  () => computePinAnchor(),
  { immediate: true },
);

function dismissTooltip(): void {
  tooltipNodeId.value = "";
  tooltipAnchor.value = null;
  tooltipExpanded.value = false;
}

function onGlobalClick(ev: MouseEvent): void {
  if (!tooltipNodeId.value) return;
  const t = ev.target as HTMLElement | null;
  if (!t) return;
  if (t.closest(".dag-tooltip")) return;
  if (t.closest(".node")) return;
  dismissTooltip();
}
function onGlobalKey(ev: KeyboardEvent): void {
  if (ev.key === "Escape" && tooltipNodeId.value) dismissTooltip();
  if (ev.key === "h" || ev.key === "H") showTitle.value = !showTitle.value;
}
// Connector lifecycle: observe zoom-pan transform changes so the connector
// follows the pinned node when the user pans/zooms. Tear down on dismiss.
let zoomTransformObserver: MutationObserver | null = null;
function observeZoomTransform(): void {
  if (zoomTransformObserver !== null) return;
  const target = document.querySelector(".zoom-pan-group");
  if (!target) return;
  zoomTransformObserver = new MutationObserver(() => updateConnectorAnchors());
  zoomTransformObserver.observe(target, { attributes: true, attributeFilter: ["transform"] });
}

onMounted(() => {
  window.addEventListener("click", onGlobalClick, true);
  window.addEventListener("keydown", onGlobalKey);
  if (printMode.value) {
    stars.value = buildStars();
  }
  if (printMode.value && printPin.value) {
    tooltipNodeId.value = printPin.value;
    computePinAnchor();
  }
  // Expose for capture-hero.mjs · re-compute anchor after zoom/pan settles
  (window as unknown as { __recomputePinAnchor?: () => void }).__recomputePinAnchor =
    computePinAnchor;
  (window as unknown as { __updateConnector?: () => void }).__updateConnector =
    updateConnectorAnchors;
  // settle ticks · catch DOM mount + zoom centering
  setTimeout(updateConnectorAnchors, 100);
  setTimeout(() => { updateConnectorAnchors(); observeZoomTransform(); }, 300);
  setTimeout(updateConnectorAnchors, 800);
  window.addEventListener("resize", updateConnectorAnchors);
  window.addEventListener("dag-tooltip-rect-change", updateConnectorAnchors);
});

onUnmounted(() => {
  if (zoomTransformObserver !== null) {
    zoomTransformObserver.disconnect();
    zoomTransformObserver = null;
  }
});

watch(
  () => [printMode.value, tooltipNodeId.value, layout.value?.nodes.length] as const,
  () => { setTimeout(updateConnectorAnchors, 200); },
);

// Tooltip dismiss · immediately clear connector endpoints so no orphan arrow.
watch(
  () => tooltipNodeId.value,
  (next) => {
    if (next === "") {
      tooltipScreenRect.value = null;
    } else {
      // tooltip just opened or changed · update on next frame
      setTimeout(updateConnectorAnchors, 50);
    }
  },
);

onUnmounted(() => {
  window.removeEventListener("resize", updateConnectorAnchors);
  window.removeEventListener("dag-tooltip-rect-change", updateConnectorAnchors);
  window.removeEventListener("click", onGlobalClick, true);
  window.removeEventListener("keydown", onGlobalKey);
});

const dagId: ComputedRef<string> = computed<string>(() =>
  payload.value === null ? "loading…" : payload.value.dagId,
);

// Root intent · top-of-DAG description shown in print-mode tooltip footer
const rootIntent: ComputedRef<string> = computed<string>(() => {
  const p = payload.value;
  if (p === null) return "";
  const head = p.head as unknown as { desc?: string };
  return head.desc ?? "";
});

// DAG-info panel summary · counts done/total nodes from completedEntries.
const dagInfo: ComputedRef<{
  id: string;
  init: string;
  term: string;
  desc: string;
  done: number;
  total: number;
} | null> = computed(() => {
  const p = payload.value;
  if (p === null) return null;
  const head = p.head as unknown as { id?: string; init?: string; term?: string; desc?: string; nodes?: Record<string, unknown> };
  const total = head.nodes ? Object.keys(head.nodes).length : 0;
  const completed = (p as unknown as { completedEntries?: unknown[] }).completedEntries;
  const done = Array.isArray(completed) ? completed.length : 0;
  return {
    id: head.id ?? p.dagId ?? "",
    init: head.init ?? "",
    term: head.term ?? "",
    desc: head.desc ?? "",
    done: Math.min(done, total),
    total,
  };
});

// r2-hero · animated SVG sparkle starfield (print mode only)
interface Star {
  x: number; y: number; size: number;
  tier: "small" | "mid" | "big" | "huge";
  dur: number; delay: number; color: string;
  rot: number;
}
// r2-hero · stars are computed ONCE on mount · static positions (no flicker)
const stars: Ref<Star[]> = ref<Star[]>([]);
function buildStars(): Star[] {
  const arr: Star[] = [];
  const palette = ["#F5E5D0", "#FFC8DC", "#A8C0E8", "#FFFFFF"];
  for (let i = 0; i < 240; i++) {
    const r = Math.random();
    const tier: "small" | "mid" | "big" | "huge" =
      r < 0.55 ? "small" : (r < 0.88 ? "mid" : (r < 0.95 ? "big" : "huge"));
    const size =
      tier === "small" ? 10 : (tier === "mid" ? 18 : (tier === "big" ? 32 : 48));
    arr.push({
      x: Math.random() * 1600 - size / 2,
      y: Math.random() * 900 - size / 2,
      size,
      tier,
      dur: 3 + Math.random() * 5,
      delay: -Math.random() * 8,
      color: palette[Math.floor(Math.random() * palette.length)],
      rot: Math.random() * 360,
    });
  }
  return arr;
}
</script>

<template>
  <main class="viewer-shell" :class="{ 'viewer-shell--print': printMode }" :data-calm="calm ? 'true' : 'false'">
    <div v-if="printMode" class="starfield" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="star-halo">
            <stop offset="0%"   stop-color="white" stop-opacity="0.55"/>
            <stop offset="35%"  stop-color="white" stop-opacity="0.18"/>
            <stop offset="100%" stop-color="white" stop-opacity="0"/>
          </radialGradient>
          <symbol id="sparkle" viewBox="-12 -12 24 24">
            <path
              d="M 0,-10 L 1.2,-1.2 L 10,0 L 1.2,1.2 L 0,10 L -1.2,1.2 L -10,0 L -1.2,-1.2 Z"
              fill="currentColor"
            />
            <circle cx="0" cy="0" r="2" fill="#FFFFFF" opacity="0.9"/>
          </symbol>
          <filter id="sparkle-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="3" result="blur1"/>
            <feMerge>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="sparkle-bloom" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="6" result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <g class="sparkles">
          <template v-for="(s, i) in stars" :key="i">
            <!-- per-star diffuse halo · radial-gradient soft circular glow · NOT rotated -->
            <circle
              :cx="s.x + s.size/2"
              :cy="s.y + s.size/2"
              :r="s.size * (s.tier === 'huge' ? 2.4 : s.tier === 'big' ? 1.9 : s.tier === 'mid' ? 1.4 : 1.1)"
              fill="url(#star-halo)"
              :opacity="s.tier === 'huge' ? 0.85 : s.tier === 'big' ? 0.7 : s.tier === 'mid' ? 0.55 : 0.45"
            />
            <!-- sparkle · rotated around its own center -->
            <use
              href="#sparkle"
              :x="s.x"
              :y="s.y"
              :width="s.size"
              :height="s.size"
              :class="['star', `star--${s.tier}`]"
              :transform="`rotate(${s.rot} ${s.x + s.size/2} ${s.y + s.size/2})`"
              :style="{
                animationDuration: s.dur + 's',
                animationDelay: s.delay + 's',
                color: s.color,
              }"
              :filter="s.tier === 'huge' || s.tier === 'big' ? 'url(#sparkle-bloom)' : 'url(#sparkle-glow)'"
            />
          </template>
        </g>
      </svg>
    </div>
    <header v-if="showTitle" class="viewer-head dag-foil-halo" :class="{ 'glass-surface': !printMode }">
      <h1>roadmap viewer · <span class="dag-id">{{ dagId }}</span></h1>
      <div v-if="!printMode" class="viewer-head__tools" role="group" aria-label="viewer tools">
        <!-- prominent · the most likely thing the user wants to open -->
        <button
          type="button"
          class="viewer-head__btn viewer-head__btn--primary"
          :class="{ 'is-active': dagInfoOpen }"
          aria-label="show dag info"
          title="show dag-level metadata (description, init, term, progress)"
          @click="toggleDagInfo"
        >ⓘ DAG info</button>

        <!-- theme picker · 🎨 → popover of pre-baked oklch palettes -->
        <button
          type="button"
          class="viewer-head__btn"
          :class="{ 'is-active': themePickerOpen }"
          aria-label="theme picker"
          :title="`theme · ${currentTheme.label}`"
          @click="toggleThemePicker"
        >🎨</button>

        <!-- font scale · A−/A+ -->
        <div class="viewer-head__pair" role="group" aria-label="text size">
          <button
            type="button"
            class="viewer-head__btn viewer-head__btn--pair"
            aria-label="decrease text size"
            title="decrease text size"
            :disabled="fontScale <= 0.875"
            @click="bumpFontScale(-1)"
          >A−</button>
          <button
            type="button"
            class="viewer-head__btn viewer-head__btn--pair"
            aria-label="increase text size"
            title="increase text size"
            :disabled="fontScale >= 1.25"
            @click="bumpFontScale(1)"
          >A+</button>
        </div>

        <!-- element scale · ⊟−/⊟+ · independent of font scale -->
        <div class="viewer-head__pair" role="group" aria-label="element size">
          <button
            type="button"
            class="viewer-head__btn viewer-head__btn--pair"
            aria-label="decrease ui density"
            title="shrink ui (panel widths, padding, button sizes)"
            :disabled="uiScale <= 0.875"
            @click="bumpUiScale(-1)"
          >⊟−</button>
          <button
            type="button"
            class="viewer-head__btn viewer-head__btn--pair"
            aria-label="increase ui density"
            title="grow ui (panel widths, padding, button sizes)"
            :disabled="uiScale >= 1.25"
            @click="bumpUiScale(1)"
          >⊟+</button>
        </div>

        <button
          type="button"
          class="viewer-head__btn"
          :class="{ 'is-active': focusMode }"
          :aria-label="focusMode ? 'show side panes' : 'maximize canvas'"
          :title="focusMode ? 'show side panes' : 'maximize canvas (hide rail and lineage)'"
          @click="focusMode = !focusMode"
        >focus</button>

        <button
          type="button"
          class="viewer-head__btn"
          :class="{ 'is-active': calm }"
          :aria-pressed="calm"
          :title="calm ? 'disable calm mode' : 'enable calm mode (no animations)'"
          @click="calm = !calm"
        >calm</button>
      </div>
    </header>

    <!-- Theme picker popover · floating below toolbar, right side. -->
    <aside
      v-if="!printMode && themePickerOpen"
      class="theme-picker glass-surface"
      aria-label="theme picker"
    >
      <header class="theme-picker__head">
        <span class="theme-picker__label">theme</span>
        <button
          type="button"
          class="theme-picker__close"
          aria-label="close theme picker"
          @click="themePickerOpen = false"
        >×</button>
      </header>
      <ul class="theme-picker__rows">
        <li
          v-for="t in themes"
          :key="t.name"
          class="theme-row"
          :class="{ 'theme-row--current': t.name === currentTheme.name }"
          @click="pickTheme(t)"
        >
          <span
            class="theme-row__swatch"
            :style="{
              background: t.vars['--chrome-bg'],
              borderColor: t.vars['--rule-strong'] ?? t.vars['--accent-gold'],
            }"
          >
            <span class="theme-row__swatch-dot" :style="{ background: t.vars['--accent-gold'] }"></span>
            <span class="theme-row__swatch-dot" :style="{ background: t.vars['--accent-red'] }"></span>
            <span class="theme-row__swatch-dot" :style="{ background: t.vars['--status-done'] }"></span>
          </span>
          <span class="theme-row__label">{{ t.label }}</span>
        </li>
      </ul>
    </aside>

    <!-- DAG-info panel · floating right-side overlay · shows head-level
         metadata (id, init, term, desc, progress). Toggled from toolbar. -->
    <aside v-if="!printMode && dagInfoOpen && dagInfo" class="dag-info glass-surface" aria-label="DAG metadata">
      <header class="dag-info__head">
        <span class="dag-info__label">dag</span>
        <span class="dag-info__id">{{ dagInfo.id }}</span>
        <button
          type="button"
          class="dag-info__close"
          aria-label="close dag info"
          @click="toggleDagInfo"
        >×</button>
      </header>
      <dl class="dag-info__meta">
        <dt>init</dt><dd>{{ dagInfo.init }}</dd>
        <dt>term</dt><dd>{{ dagInfo.term }}</dd>
        <dt>progress</dt><dd>{{ dagInfo.done }} / {{ dagInfo.total }}</dd>
      </dl>
      <p
        v-for="(para, i) in dagInfo.desc.split(/\n\s*\n/).filter((p: string) => p.trim().length > 0)"
        :key="i"
        class="dag-info__para"
      >{{ para.trim() }}</p>
    </aside>

    <!-- g-canvas-as-ground · DagViewer fills the viewport · all chrome
         floats over it as absolute-positioned glass overlays. -->
    <DagViewer
      class="viewer-shell__canvas"
      :layout="layout"
      :selected-node-id="tooltipNodeId"
      :print-mode="printMode"
      :milestones="milestoneIds"
      export-name="roadmap-dag"
      @node-selected="onNodeSelected"
    />

    <!-- g-repo-rail · floating LEFT overlay. -->
    <aside v-if="!printMode && !focusMode" class="repo-rail glass-surface">
      <div class="repo-rail__head">
        <span class="repo-rail__label">repos</span>
        <span v-if="roadmapsLoading && repoRailRows.length === 0" class="repo-rail__loading">loading repos…</span>
        <span v-else class="repo-rail__count">{{ repoRailRows.length }}</span>
      </div>
      <ul v-if="repoRailRows.length > 0" class="repo-rail__rows">
        <li
          v-for="row in repoRailRows"
          :key="row.path"
          class="repo-row"
          :class="[
            `repo-row--${row.status}`,
            {
              'repo-row--current': row.path === selectedRepo,
              'repo-row--muted': row.status === 'complete' || row.status === 'no-dag',
            },
          ]"
          @click="selectedRepo = row.path"
        >
          <div class="repo-row__top">
            <span class="repo-row__repo">{{ row.repo }}</span>
            <span class="repo-row__mtime">{{ formatRailMtime(row.mtime) }}</span>
          </div>
          <div class="repo-row__bot">
            <span class="repo-row__badge" :class="`repo-row__badge--${row.status}`">{{ row.status }}</span>
            <span v-if="row.total > 0" class="repo-row__progress">{{ row.done }}/{{ row.total }}</span>
            <span v-else-if="row.dagId" class="repo-row__dag">{{ row.dagId }}</span>
          </div>
        </li>
      </ul>
    </aside>

    <!-- g-lineage-pane · floating TOP-RIGHT overlay (right of rail, below toolbar). -->
    <LineagePane v-if="!printMode && !focusMode"
      class="viewer-shell__lineage glass-surface"
      :lineage="selectedRepoLineage"
      :current-dag-id="payload?.dagId"
      @select="onLineageSelect"
    />

    <NodeTooltipPane
      v-if="!printMode || showTooltipInPrint"
      :node-data="tooltipNodeData"
      :anchor-rect="tooltipAnchor"
      :expanded="printMode ? false : tooltipExpanded"
      :print-mode="printMode"
      :root-intent="rootIntent"
      :class="{ 'dag-tooltip--print': printMode, 'glass-surface': !printMode }"
      @close="dismissTooltip"
    />

    <svg
      v-if="printMode && showTooltipInPrint && connectorPath"
      class="tooltip-connector-overlay"
      :viewBox="`0 0 ${vpW} ${vpH}`"
      :width="vpW"
      :height="vpH"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="tip-arrow-screen"
          viewBox="0 0 10 10"
          refX="9" refY="5"
          markerWidth="8" markerHeight="8"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="#F5E5D0"/>
        </marker>
      </defs>
      <path
        :d="connectorPath"
        stroke="#F5E5D0"
        stroke-width="3"
        stroke-dasharray="8 5"
        fill="none"
        opacity="0.85"
        marker-end="url(#tip-arrow-screen)"
      />
    </svg>

  </main>
</template>

<!-- UNSCOPED layout rules · canvas-as-ground positioning. These must apply
     to child component roots (DagViewer, LineagePane, NodeTooltipPane) which
     Vue 3 scoped CSS does not reliably reach. Layout-only · no theme. -->
<style>
.viewer-shell {
  position: relative;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
.viewer-shell > .viewer-shell__canvas,
.viewer-shell > .dag-viewer {
  position: absolute !important;
  inset: 0 !important;
  z-index: 1;
}
.viewer-shell > .viewer-head {
  position: absolute !important;
  top: 12px !important;
  left: 12px !important;
  right: 12px !important;
  z-index: 30;
}
.viewer-shell > .repo-rail {
  position: absolute !important;
  left: 12px !important;
  top: 64px !important;
  bottom: 12px !important;
  width: calc(280px * var(--ui-scale, 1)) !important;
  z-index: 20;
}
.viewer-shell > .viewer-shell__lineage {
  position: absolute !important;
  left: calc(24px + 280px * var(--ui-scale, 1)) !important;
  right: 12px !important;
  top: 64px !important;
  height: calc(96px * var(--ui-scale, 1)) !important;
  z-index: 20;
}
.viewer-shell:has(.viewer-shell__lineage):not(:has(.repo-rail)) > .viewer-shell__lineage {
  left: 12px !important;
}
.viewer-shell > .dag-info {
  position: absolute !important;
  right: 12px !important;
  top: calc(76px + 96px * var(--ui-scale, 1)) !important;
  bottom: 12px !important;
  width: calc(360px * var(--ui-scale, 1)) !important;
  z-index: 25;
  overflow: auto;
}
.viewer-shell > .theme-picker {
  position: absolute !important;
  right: 12px !important;
  top: 56px !important;
  width: calc(340px * var(--ui-scale, 1)) !important;
  z-index: 35;
  max-height: 70vh;
  overflow: auto;
}
.viewer-shell--print > .viewer-head,
.viewer-shell--print > .repo-rail,
.viewer-shell--print > .viewer-shell__lineage,
.viewer-shell--print > .dag-info,
.viewer-shell--print > .theme-picker {
  display: none !important;
}
</style>

<style scoped>
/* g-canvas-as-ground · viewer-shell is a positioning ancestor.
   Layout positioning is in the unscoped <style> block above (must apply
   to child component roots). This block carries theme-only rules. */
.viewer-shell {
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--text-primary, #eee);
  background: var(--chrome-00, #000);
}

/* Toolbar · flex content layout (positioning is unscoped) */
.viewer-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  gap: 12px;
}

/* DAG-info panel · floating right overlay below the lineage strip.
   Positioning in unscoped block above; this is theming + content layout. */
.dag-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  font-size: calc(11px * var(--font-scale, 1));
  line-height: 1.5;
}
.dag-info__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--rule, #4A3D6E);
}
.dag-info__label {
  font-size: calc(10px * var(--font-scale, 1));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent-gold, #FCF791);
  font-weight: 600;
}
.dag-info__id {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: calc(13px * var(--font-scale, 1));
  color: var(--text-primary, #F5F3BF);
  flex: 1 1 auto;
  word-break: break-all;
}
.dag-info__close {
  width: 22px;
  height: 22px;
  background: transparent;
  border: 1px solid var(--glass-border-rest, #444);
  color: var(--text-secondary, #ccc);
  cursor: pointer;
  border-radius: 2px;
  font-size: calc(14px * var(--font-scale, 1))px;
  line-height: 1;
}
.dag-info__close:hover { color: var(--accent-gold); border-color: var(--accent-gold); }

.dag-info__meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  margin: 0;
}
.dag-info__meta dt {
  font-size: calc(10px * var(--font-scale, 1));
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-meta);
}
.dag-info__meta dd {
  margin: 0;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: calc(11px * var(--font-scale, 1));
  color: var(--text-primary);
  word-break: break-all;
}
.dag-info__para {
  margin: 0;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: calc(13px * var(--font-scale, 1));
  line-height: 1.55;
  color: var(--text-primary);
}
.dag-info__para + .dag-info__para { margin-top: 4px; }
.viewer-head h1 {
  margin: 0;
  font-size: calc(16px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--foil, #D7A432);
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.55);
}
.viewer-head .dag-id {
  color: var(--text-meta, #888);
  text-shadow: var(--text-shadow-readable);
  font-weight: 400;
}
.viewer-head__tools {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--ui-scale, 1));
  margin-left: auto;
}
.viewer-head__seg {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--glass-border-rest);
  border-radius: 4px;
  overflow: hidden;
}
.viewer-head__seg.is-disabled { opacity: 0.45; }
.viewer-head__btn {
  background: transparent;
  border: 1px solid var(--glass-border-rest);
  color: var(--text-primary);
  font-family: inherit;
  font-weight: var(--font-weight-strong, 700);
  font-size: calc(12px * var(--font-scale, 1));
  letter-spacing: 0.04em;
  /* un-squished · larger padding, defined min height/width so buttons read
     as buttons, not text labels */
  padding: calc(8px * var(--ui-scale, 1)) calc(14px * var(--ui-scale, 1));
  min-height: calc(32px * var(--ui-scale, 1));
  min-width: calc(36px * var(--ui-scale, 1));
  cursor: pointer;
  border-radius: 4px;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.viewer-head__btn:hover:not(:disabled) {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}
.viewer-head__btn:focus-visible {
  outline: 2px solid var(--accent-gold);
  outline-offset: 2px;
}
.viewer-head__btn.is-active {
  color: var(--accent-gold);
  border-color: var(--accent-gold);
  background: var(--glass-bg-faded);
}
.viewer-head__btn:disabled {
  opacity: 0.4;
  cursor: default;
}
/* Primary · DAG info · gold OUTLINED at rest (panel closed); FILLED gold
   when active (panel open). Conventional toggle semantics:
     inactive  outlined  · panel closed · invitation to open
     active    filled    · panel open   · acknowledgement of state
*/
.viewer-head__btn--primary {
  background: transparent;
  color: var(--accent-gold);
  border: 2px solid var(--accent-gold);
  font-weight: var(--font-weight-strong, 700);
  font-size: calc(13px * var(--font-scale, 1));
  padding: calc(7px * var(--ui-scale, 1)) calc(17px * var(--ui-scale, 1));
  letter-spacing: 0.06em;
}
.viewer-head__btn--primary:hover:not(:disabled) {
  background: var(--accent-gold);
  border-color: var(--accent-gold);
  color: var(--chrome-bg);
}
.viewer-head__btn--primary.is-active {
  background: var(--accent-gold);
  color: var(--chrome-bg);
  border-color: var(--accent-gold);
}
.viewer-head__btn--primary.is-active:hover:not(:disabled) {
  background: var(--accent-orange);
  border-color: var(--accent-orange);
}
/* Paired buttons (font scale, ui scale) · grouped with shared border */
.viewer-head__pair {
  display: inline-flex;
  align-items: stretch;
  border-radius: 4px;
  gap: 1px;
  background: var(--glass-border-rest);
  padding: 1px;
}
.viewer-head__btn--pair {
  border-radius: 2px;
  border-color: transparent;
  min-width: calc(40px * var(--ui-scale, 1));
}
.viewer-head__btn--pair:first-child { border-radius: 3px 1px 1px 3px; }
.viewer-head__btn--pair:last-child { border-radius: 1px 3px 3px 1px; }
.viewer-head__btn--seg {
  border: none;
  border-radius: 0;
}
.viewer-head__btn--seg + .viewer-head__btn--seg {
  border-left: 1px solid var(--glass-border-rest);
}

/* g-repo-rail · LEFT overlay (positioning in canvas-as-ground block above) */
.repo-rail {
  display: flex;
  flex-direction: column;
  font-size: calc(11px * var(--font-scale, 1));
  line-height: 1.4;
  overflow: hidden;
}
.repo-rail__rows {
  overflow-y: auto;
}
.repo-rail__head {
  display: flex;
  gap: calc(6px * var(--ui-scale, 1));
  align-items: baseline;
  padding: calc(10px * var(--ui-scale, 1)) calc(12px * var(--ui-scale, 1));
  border-bottom: 1px solid var(--rule-strong);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: var(--font-weight-strong, 700);
  flex: 0 0 auto;
}
.repo-rail__label { font-weight: var(--font-weight-strong, 700); }
.repo-rail__loading {
  color: var(--text-meta);
  font-style: italic;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}
.repo-rail__count {
  background: var(--glass-bg-faded);
  border: 1px solid var(--glass-border-rest);
  padding: 0 calc(6px * var(--ui-scale, 1));
  border-radius: 3px;
  color: var(--text-primary);
}
.repo-rail__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1 1 auto;
}
.repo-row {
  display: flex;
  flex-direction: column;
  gap: calc(3px * var(--ui-scale, 1));
  padding: calc(10px * var(--ui-scale, 1)) calc(12px * var(--ui-scale, 1));
  color: var(--text-primary);
  cursor: pointer;
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--rule);
  font-weight: var(--font-weight-base, 500);
}
.repo-row:hover { background: var(--chrome-15, #1a1a1a); }
.repo-row--current {
  color: var(--text-primary, #eee);
  border-left-color: var(--foil, #D7A432);
  background: var(--chrome-15, #1a1a1a);
}
.repo-row--muted { opacity: 0.55; }
.repo-row--muted.repo-row--current { opacity: 1; }
.repo-row__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
}
.repo-row__repo {
  font-weight: 600;
  color: var(--text-primary, #eee);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.repo-row__mtime {
  color: var(--text-meta);
  text-shadow: var(--text-shadow-readable);
  font-size: calc(10px * var(--font-scale, 1));
  font-weight: var(--font-weight-base, 500);
  flex: 0 0 auto;
}
.repo-row__bot {
  display: flex;
  gap: calc(6px * var(--ui-scale, 1));
  align-items: baseline;
}
.repo-row__badge {
  padding: 0 calc(6px * var(--ui-scale, 1));
  border-radius: 3px;
  font-size: calc(10px * var(--font-scale, 1));
  font-weight: var(--font-weight-strong, 700);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border: 1px solid var(--glass-border-rest);
  background: var(--glass-bg-faded);
}
.repo-row__badge--active   { color: var(--foil, #D7A432); border-color: var(--foil, #D7A432); }
.repo-row__badge--fresh    { color: #6cb6ff; border-color: #2a4a6a; }
.repo-row__badge--complete { color: #7ec47e; border-color: #2f5a2f; }
.repo-row__badge--no-dag   { color: var(--text-meta, #888); }
.repo-row__progress {
  color: var(--text-secondary, #ccc);
  font-variant-numeric: tabular-nums;
}
.repo-row__dag { color: var(--text-meta, #888); font-style: italic; }

/* Theme picker · glass-surface popover under toolbar */
.theme-picker {
  display: flex;
  flex-direction: column;
  font-size: calc(11px * var(--font-scale, 1));
  padding: 8px 0;
  gap: 0;
}
.theme-picker__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px 8px;
  border-bottom: 1px solid var(--rule, #4A3D6E);
}
.theme-picker__label {
  font-size: calc(10px * var(--font-scale, 1));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent-gold);
  font-weight: 600;
}
.theme-picker__close {
  width: 22px; height: 22px;
  background: transparent;
  border: 1px solid var(--glass-border-rest, #444);
  color: var(--text-secondary, #ccc);
  cursor: pointer;
  border-radius: 2px;
  font-size: calc(14px * var(--font-scale, 1))px;
  line-height: 1;
}
.theme-picker__close:hover { color: var(--accent-gold); border-color: var(--accent-gold); }
.theme-picker__rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.theme-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  cursor: pointer;
  border-left: 2px solid transparent;
  color: var(--text-secondary, #ccc);
}
.theme-row:hover { background: var(--chrome-15, #1a1a1a); color: var(--text-primary); }
.theme-row--current {
  color: var(--text-primary, #eee);
  border-left-color: var(--foil, #D7A432);
  background: var(--chrome-15, #1a1a1a);
}
.theme-row__swatch {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  width: 60px;
  height: 22px;
  border: 1px solid;
  border-radius: 3px;
  padding: 0 6px;
  flex: 0 0 auto;
}
.theme-row__swatch-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.theme-row__label {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: calc(11px * var(--font-scale, 1));
  font-weight: var(--font-weight-base, 500);
  line-height: 1.35;
  flex: 1 1 auto;
  min-width: 0;
  /* allow wrapping rather than clipping · two lines max */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* .dag-pane retired · canvas-as-ground replaces flex-stack with absolute overlays. */
.viewer-shell--print .tooltip-connector-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}
</style>
