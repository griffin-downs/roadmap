<script setup lang="ts">
// Roadmap viewer shell — composes the DAG renderer (hierarchical default,
// force topology selectable) with a side pane for full node detail and a
// collapsible field-expander for raw head.json / completed / intentEvals.
//
// §Dumb-components: this shell composes; DagViewer/DagTopology are pure
// props-in/events-out. No fetch/state-derivation lives in their script
// setup. Click on any node bubbles up to open NodeSidePanel here.
//
// r2-hero: ?print=1 URL toggle drives a poster-grade aesthetic mode with
// chrome hidden and the side panel always-on for a single pinned node
// (?pin=<node-id>).

import { computed, nextTick, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import FieldExpander from "./components/FieldExpander.vue";
import NodeSidePanel from "./components/NodeSidePanel.vue";
import type { InspectedNode } from "./components/NodeSidePanel.vue";
import DagViewer from "./components/DagViewer.vue";
import DagTopology from "./components/DagTopology.vue";
import NodeTooltipPane from "./components/NodeTooltipPane.vue";
import { onMounted, onUnmounted } from "vue";
import type { AnchorRect } from "./composables/useTooltipPosition";
import { useDagPayload } from "./services/dagReader";
import { DEFAULT_LAYOUT_OPTIONS, useDagLayout } from "./composables/useDagLayout";
import {
  DEFAULT_FORCE_OPTIONS,
  useForceLayout,
  type ForceLayoutOptions,
} from "./composables/useForceLayout";

const payload = useDagPayload();

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
const showTooltipInPrint: Ref<boolean> = ref<boolean>(
  url.searchParams.get("tooltip") !== "0",
);

// view mode: hierarchical is the parity-with-dashboard default
const viewMode: Ref<"hierarchical" | "topology"> = ref<"hierarchical" | "topology">(
  "hierarchical",
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

// topology layout (force-directed alt view)
const completedSet: ComputedRef<Set<string>> = computed<Set<string>>(() => {
  const p = payload.value;
  return new Set<string>(p === null ? [] : p.completed);
});
const groupBy: Ref<"depth" | "cluster"> = ref<"depth" | "cluster">("depth");
const forceOptions: Ref<ForceLayoutOptions> = ref<ForceLayoutOptions>({
  ...DEFAULT_FORCE_OPTIONS,
  groupBy: groupBy.value,
});
watch(groupBy, (next) => {
  forceOptions.value = { ...forceOptions.value, groupBy: next };
});
const force = useForceLayout(payload, completedSet, forceOptions);
watch(viewMode, (next) => {
  if (next === "topology") force.start();
  else force.stop();
});

// node selection → side panel
const selectedNodeId: Ref<string> = ref<string>("");
const selectedNode: ComputedRef<InspectedNode | null> = computed(() => {
  const p = payload.value;
  if (p === null || !selectedNodeId.value) return null;
  const n = p.head.nodes[selectedNodeId.value];
  if (!n) return null;
  return n as unknown as InspectedNode;
});

// Tooltip-pane state
const tooltipNodeId: Ref<string> = ref<string>("");
const tooltipAnchor: Ref<AnchorRect | null> = ref<AnchorRect | null>(null);
const tooltipExpanded: Ref<boolean> = ref<boolean>(false);
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
  // Both modes: clicking a node updates BOTH selection AND tooltip target.
  // Print mode previously early-returned after setting only selectedNodeId,
  // leaving the tooltip frozen on the URL-pin · fix: drop the early return.
  selectedNodeId.value = nodeId;
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

function pinTooltipToSide(): void {
  // Hoist tooltip's node into the persistent side panel BEFORE dismissing,
  // since dismissTooltip clears tooltipNodeId — read it first into a local.
  const id = tooltipNodeId.value;
  if (id) selectedNodeId.value = id;
  dismissTooltip();
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
    selectedNodeId.value = printPin.value;
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
  () => [printMode.value, selectedNodeId.value, layout.value?.nodes.length] as const,
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

// Selection cleared · clear pinned-side endpoint too
watch(
  () => selectedNodeId.value,
  (next) => {
    if (next === "") pinnedScreenPos.value = null;
  },
);
onUnmounted(() => {
  window.removeEventListener("resize", updateConnectorAnchors);
  window.removeEventListener("dag-tooltip-rect-change", updateConnectorAnchors);
  window.removeEventListener("click", onGlobalClick, true);
  window.removeEventListener("keydown", onGlobalKey);
});

// raw inspector (collapsed by default — DAG is the headline)
const detailsOpen: Ref<boolean> = ref<boolean>(false);
const tab: Ref<"head" | "completed" | "intent"> = ref("head");
const search: Ref<string> = ref<string>("");
const searchDebounced: Ref<string> = ref<string>("");
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, (q) => {
  if (searchTimer !== null) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { searchDebounced.value = q; }, 80);
});

const tabData: ComputedRef<unknown> = computed(() => {
  const p = payload.value;
  if (p === null) return null;
  if (tab.value === "head") return p.head;
  if (tab.value === "completed") return { ids: p.completed, entries: p.completedEntries };
  return p.intentEvals;
});
const tabPath: ComputedRef<string> = computed(() => `$.${tab.value}`);

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

// r2-hero · animated SVG sparkle starfield (print mode only)
interface Star {
  x: number; y: number; size: number;
  tier: "small" | "mid" | "big" | "huge";
  dur: number; delay: number; color: string;
}
// r2-hero · stars are computed ONCE on mount · static positions (no flicker)
const stars: Ref<Star[]> = ref<Star[]>([]);
function buildStars(): Star[] {
  const arr: Star[] = [];
  const palette = ["#F5E5D0", "#FFC8DC", "#A8C0E8", "#FFFFFF"];
  for (let i = 0; i < 100; i++) {
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
    });
  }
  return arr;
}
</script>

<template>
  <main class="viewer-shell" :class="{ 'viewer-shell--print': printMode }">
    <div v-if="printMode" class="starfield" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <symbol id="sparkle" viewBox="-12 -12 24 24">
            <path
              d="M 0,-10 L 1.2,-1.2 L 10,0 L 1.2,1.2 L 0,10 L -1.2,1.2 L -10,0 L -1.2,-1.2 Z"
              fill="currentColor"
            />
            <circle cx="0" cy="0" r="2" fill="#FFFFFF" opacity="0.9"/>
          </symbol>
          <filter id="sparkle-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="1.2"/>
          </filter>
        </defs>
        <g class="sparkles">
          <use
            v-for="(s, i) in stars"
            :key="i"
            href="#sparkle"
            :x="s.x"
            :y="s.y"
            :width="s.size"
            :height="s.size"
            :class="['star', `star--${s.tier}`]"
            :style="{
              animationDuration: s.dur + 's',
              animationDelay: s.delay + 's',
              color: s.color,
            }"
            filter="url(#sparkle-glow)"
          />
        </g>
      </svg>
    </div>
    <header v-if="showTitle" class="viewer-head dag-foil-halo">
      <h1>roadmap viewer · <span class="dag-id">{{ dagId }}</span></h1>
      <div v-if="!printMode" class="view-toggle">
        <button
          type="button"
          class="toggle-btn"
          :class="{ 'toggle-btn--active': viewMode === 'hierarchical' }"
          @click="viewMode = 'hierarchical'"
        >hierarchical</button>
        <button
          type="button"
          class="toggle-btn"
          :class="{ 'toggle-btn--active': viewMode === 'topology' }"
          @click="viewMode = 'topology'"
        >topology</button>
      </div>
    </header>

    <section class="dag-pane">
      <DagViewer
        v-if="viewMode === 'hierarchical'"
        :layout="layout"
        :selected-node-id="tooltipNodeId || selectedNodeId"
        :print-mode="printMode"
        :milestones="milestoneIds"
        export-name="roadmap-dag"
        @node-selected="onNodeSelected"
      />
      <NodeTooltipPane
        v-if="!printMode || showTooltipInPrint"
        :node-data="tooltipNodeData"
        :anchor-rect="tooltipAnchor"
        :expanded="printMode ? false : tooltipExpanded"
        :print-mode="printMode"
        :root-intent="rootIntent"
        :class="{ 'dag-tooltip--print': printMode }"
        @close="dismissTooltip"
        @expand="tooltipExpanded = !tooltipExpanded"
        @pin-to-side="pinTooltipToSide"
      />
      <DagTopology
        v-if="viewMode === 'topology' && !printMode"
        :nodes="force.nodes.value"
        :links="force.links.value"
        :width="1200"
        :height="700"
        :group-by="groupBy"
        :zoom="1"
        :pan="{ x: 0, y: 0 }"
        export-name="roadmap-dag"
        @select="onNodeSelected"
        @update:group-by="groupBy = $event"
        @reheat="force.reheat()"
      />
    </section>

    <header v-if="!printMode" class="details-head">
      <button type="button" class="head-toggle" @click="detailsOpen = !detailsOpen">
        roadmap details {{ detailsOpen ? '▾' : '▸' }}
      </button>
    </header>
    <section v-if="detailsOpen && !printMode" class="details">
      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ 'tab--active': tab === 'head' }"
          @click="tab = 'head'"
        >head.json</button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab--active': tab === 'completed' }"
          @click="tab = 'completed'"
        >completed</button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab--active': tab === 'intent' }"
          @click="tab = 'intent'"
        >intentEvals</button>
      </div>
      <input
        v-model="search"
        type="search"
        class="search"
        placeholder="filter keys/values…"
      />
      <FieldExpander
        v-if="tabData !== null"
        :data="tabData"
        :path="tabPath"
        :search="searchDebounced"
      />
      <p v-else class="placeholder">loading head.json…</p>
    </section>

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

    <NodeSidePanel
      v-if="selectedNode !== null && !printMode"
      :node="selectedNode"
      :print-mode="printMode"
      class="side-panel-floating"
      :class="{ 'node-panel--print': printMode }"
      @close="selectedNodeId = ''"
    />
  </main>
</template>

<style scoped>
.viewer-shell {
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--text-primary, #eee);
  background: var(--chrome-00, #000);
  min-height: 100vh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
}
.viewer-shell > .viewer-head,
.viewer-shell > .dag-pane,
.viewer-shell > .details-head,
.viewer-shell > .details {
  position: relative;
  z-index: 1;
}
.viewer-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 12px;
}
.viewer-head h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--foil, #D7A432);
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.55);
}
.viewer-head .dag-id { color: var(--text-meta, #888); font-weight: 400; }
.view-toggle { display: flex; gap: 4px; }
.toggle-btn {
  background: var(--chrome-05, #0a0a0a);
  border: 1px solid var(--chrome-25, #333);
  color: var(--text-secondary, #ccc);
  font: inherit;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
}
.toggle-btn--active {
  border-color: var(--accent-red, #d33);
  color: var(--text-primary, #eee);
}
.dag-pane {
  flex: 1 1 auto;
  min-height: 70vh;
  border: 1px solid var(--chrome-25, #333);
  background: var(--chrome-00, #000);
  position: relative;
}
/* Default-mode side panel — fixed-positioned floating card so it doesn't
   collapse into the flex column when pinned. Print mode overrides via
   .node-panel--print in dag-theme.css. */
.side-panel-floating {
  position: fixed;
  right: 16px;
  top: 64px;
  width: 380px;
  max-height: calc(100vh - 96px);
  z-index: 50;
  border: 1px solid var(--chrome-25, #333);
  background: var(--chrome-05, #0a0a0a);
  overflow-y: auto;
}
.details-head {
  display: flex;
  justify-content: flex-start;
}
.head-toggle {
  background: var(--chrome-05, #0a0a0a);
  border: 1px solid var(--chrome-25, #333);
  color: var(--text-secondary, #ccc);
  padding: 4px 10px;
  font: inherit;
  cursor: pointer;
}
.details {
  border: 1px solid var(--chrome-25, #333);
  padding: 10px;
  max-height: 40vh;
  overflow: auto;
  background: var(--chrome-05, #0a0a0a);
}
.tabs { display: flex; gap: 4px; margin-bottom: 6px; }
.tab {
  background: var(--chrome-05, #0a0a0a);
  border: 1px solid var(--chrome-25, #333);
  color: var(--text-secondary, #ccc);
  font: inherit;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}
.tab--active { border-color: var(--accent-red, #d33); color: var(--text-primary, #eee); }
.search {
  background: var(--chrome-10, #161616);
  border: 1px solid var(--chrome-25, #333);
  color: var(--text-primary, #eee);
  font: inherit;
  padding: 4px 6px;
  width: 100%;
  margin-bottom: 6px;
}
.search:focus { outline: 1px solid var(--accent-red, #d33); }
.placeholder { color: var(--text-meta, #888); font-style: italic; }
.viewer-shell--print .tooltip-connector-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}
</style>
