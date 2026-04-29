<template>
  <div class="dag-viewer" :class="{ 'dag-viewer--tablet': tablet }">
    <div v-if="hasGraph" class="dag-viewer__toolbar">
      <button
        type="button"
        class="dag-viewer__btn"
        :disabled="exporting"
        @click="onExportSvg"
      >Export SVG</button>
      <button
        type="button"
        class="dag-viewer__btn"
        :disabled="exporting"
        @click="onExportPng"
      >Export PNG</button>
    </div>
    <svg
      ref="svgRef"
      :viewBox="`0 0 ${layout.width} ${layout.height}`"
      :width="layout.width"
      :height="layout.height"
      class="dag-svg"
      role="img"
      aria-label="Roadmap DAG"
    >
      <defs>
        <filter id="dag-frontier-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="dag-rainbow-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#C68080" />
          <stop offset="20%" stop-color="#C69870" />
          <stop offset="40%" stop-color="#C6BC70" />
          <stop offset="60%" stop-color="#80C690" />
          <stop offset="80%" stop-color="#70AAC6" />
          <stop offset="100%" stop-color="#9080C6" />
        </linearGradient>
        <linearGradient id="dag-rainbow-text" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#C68080" />
          <stop offset="33%" stop-color="#C6BC70" />
          <stop offset="66%" stop-color="#80C690" />
          <stop offset="100%" stop-color="#9080C6" />
        </linearGradient>
      </defs>

      <g ref="zoomGroupRef" class="zoom-pan-group">
      <g class="edges">
        <path
          v-for="edge in layout.edges"
          :key="`${edge.from}->${edge.to}`"
          :d="edge.dFromPath"
          class="edge"
          :class="edgeClass(edge)"
          fill="none"
        />
      </g>

      <g class="nodes">
        <g
          v-for="node in layout.nodes"
          :key="node.id"
          class="node"
          :class="nodeClass(node)"
          :transform="`translate(${node.x}, ${node.y})`"
          :filter="node.isFrontier ? 'url(#dag-frontier-glow)' : undefined"
          @mouseenter="hoveredId = node.id"
          @mouseleave="clearHover"
          @click.stop="emitClick(node.id, $event)"
        >
          <rect
            :width="node.width"
            :height="node.height"
            rx="0"
            ry="0"
            class="node-rect"
          />
          <rect
            v-if="node.status === 'in-progress'"
            :width="node.width"
            :height="node.height"
            rx="0"
            ry="0"
            class="node-rainbow-rect"
          />
          <text :x="8" :y="18" class="node-id">{{ node.id }}</text>
          <text
            v-if="selectedNodeId === node.id"
            :x="8"
            :y="18"
            class="node-id-shimmer"
          >{{ node.id }}</text>
          <text v-if="!tablet" :x="8" :y="36" class="node-status">{{ node.status }}</text>
        </g>
      </g>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
// DagViewer — DUMB component (§Dumb-components). Props in, events out.
// No fetch / no state derivation / no fleet-specific assumptions. Layout
// is computed upstream by useDagLayout(payload, options).
//
// Ported from fleet/dashboard at r1.5 (viewer-port-dag-component).

import { computed, onMounted, ref } from "vue";
import type { ComputedRef, Ref } from "vue";
import * as d3 from "d3-selection";
import { zoom, type D3ZoomEvent } from "d3-zoom";
import type { DagLayout, LaidOutEdge, LaidOutNode } from "../composables/useDagLayout";
import { useGraphExport } from "../composables/useGraphExport";

interface Props {
  layout: DagLayout;
  tablet?: boolean;
  exportName?: string;
  selectedNodeId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  tablet: false,
  exportName: "roadmap-dag",
  selectedNodeId: "",
});
const emit = defineEmits<{
  (event: "node-selected", nodeId: string, anchorRect: DOMRect): void;
}>();

const hoveredId: Ref<string | null> = ref<string | null>(null);
const svgRef: Ref<SVGSVGElement | null> = ref<SVGSVGElement | null>(null);
const zoomGroupRef: Ref<SVGGElement | null> = ref<SVGGElement | null>(null);
const transform: Ref<{ k: number; x: number; y: number }> = ref({ k: 1, x: 0, y: 0 });
const { exporting, exportSvg, exportPng } = useGraphExport();

onMounted(() => {
  if (!svgRef.value || !zoomGroupRef.value) return;
  const sel = d3.select(svgRef.value as SVGSVGElement);
  const z = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 4])
    .on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
      const t = e.transform;
      transform.value = { k: t.k, x: t.x, y: t.y };
      zoomGroupRef.value!.setAttribute("transform", `translate(${t.x},${t.y}) scale(${t.k})`);
    });
  sel.call(z);
});

defineExpose({ transform });
const hasGraph: ComputedRef<boolean> = computed<boolean>(() => props.layout.nodes.length > 0);

async function onExportSvg(): Promise<void> {
  await exportSvg(svgRef.value, `${props.exportName}-hierarchical`);
}
async function onExportPng(): Promise<void> {
  await exportPng(svgRef.value, `${props.exportName}-hierarchical`);
}

const directDeps: ComputedRef<Set<string>> = computed<Set<string>>(() => {
  const current = hoveredId.value;
  if (current === null) return new Set<string>();
  const node = props.layout.nodes.find((entry) => entry.id === current);
  if (node === undefined) return new Set<string>();
  return new Set<string>(node.deps);
});

const directDependents: ComputedRef<Set<string>> = computed<Set<string>>(() => {
  const current = hoveredId.value;
  if (current === null) return new Set<string>();
  return new Set<string>(
    props.layout.nodes.filter((entry) => entry.deps.includes(current)).map((entry) => entry.id),
  );
});

function nodeClass(node: LaidOutNode): Record<string, boolean> {
  const id = node.id;
  return {
    [`node--${node.status}`]: true,
    "node--frontier": node.isFrontier,
    "node--selected": props.selectedNodeId === id,
    "node--hovered": hoveredId.value === id,
    "node--related":
      hoveredId.value !== null && (directDeps.value.has(id) || directDependents.value.has(id)),
    "node--dim":
      hoveredId.value !== null &&
      hoveredId.value !== id &&
      !directDeps.value.has(id) &&
      !directDependents.value.has(id),
  };
}

function edgeClass(edge: LaidOutEdge): Record<string, boolean> {
  const hovered = hoveredId.value;
  const touchesHover = hovered !== null && (edge.from === hovered || edge.to === hovered);
  return {
    "edge--active": touchesHover,
    "edge--dim": hovered !== null && !touchesHover,
  };
}

function clearHover(): void {
  hoveredId.value = null;
}

function emitClick(nodeId: string, ev: MouseEvent): void {
  const target = ev.currentTarget as SVGGraphicsElement | null;
  const rect = target ? target.getBoundingClientRect() : new DOMRect(ev.clientX, ev.clientY, 0, 0);
  emit("node-selected", nodeId, rect);
}
</script>

<style scoped>
.dag-viewer {
  position: relative;
  overflow: auto;
  width: 100%;
  height: 100%;
  background: var(--chrome-05, #0a0a0a);
  border: 1px solid var(--chrome-25, #333);
}
.dag-viewer__toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 2;
}
.dag-viewer__btn {
  padding: 4px 8px;
  font-size: 11px;
  font-family: var(--font-mono, ui-monospace, monospace);
  background: var(--chrome-10, #151515);
  color: var(--text-primary, #eee);
  border: 1px solid var(--chrome-25, #333);
  cursor: pointer;
}
.dag-viewer__btn:hover { border-color: var(--accent-red, #d33); }
.dag-viewer__btn:disabled { opacity: 0.5; cursor: wait; }
.dag-svg { display: block; font-family: var(--font-mono, ui-monospace, monospace); }
.edge {
  stroke: var(--chrome-30, #444);
  stroke-width: 1.5;
  transition: stroke 120ms, opacity 120ms;
}
.edge--active { stroke: var(--accent-red, #d33); stroke-width: 2.25; }
.edge--dim { opacity: 0.25; }
.node { cursor: pointer; transition: opacity 120ms; }
.node-rect {
  stroke: var(--chrome-30, #444);
  stroke-width: 1;
  fill: var(--chrome-10, #151515);
  transition: fill 120ms, stroke 120ms;
}
.node--done .node-rect {
  fill: var(--status-nominal, oklch(0.28 0.09 150));
  stroke: oklch(0.55 0.14 150);
}
.node--in-progress .node-rect {
  fill: var(--status-active, oklch(0.32 0.12 60));
  stroke: var(--accent-red, #d33);
  stroke-width: 2;
}
.node--blocked .node-rect { fill: var(--chrome-10, #151515); stroke: var(--chrome-25, #333); }
.node--plan-mode .node-rect {
  fill: transparent;
  stroke: var(--accent-red, #d33);
  stroke-dasharray: 4 3;
}
.node--frontier .node-rect { stroke-width: 2.5; }
.node--hovered .node-rect { stroke: var(--accent-red, #d33); stroke-width: 2.5; }
.node--related .node-rect { stroke: var(--accent-red, #d33); }
.node--dim { opacity: 0.3; }
.node-id {
  fill: var(--text-primary, #eee);
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
}
.node-status {
  fill: var(--text-meta, #888);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  pointer-events: none;
}
.dag-viewer--tablet .node-id { font-size: 10px; }
@media (prefers-reduced-motion: reduce) {
  .edge, .node, .node-rect { transition: none; }
}
</style>
