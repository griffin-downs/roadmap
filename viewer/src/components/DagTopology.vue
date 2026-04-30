<!--
  DagTopology.vue · DUMB component (props in · events out).
  Renders force-directed positions supplied by useForceLayout. Holds NO
  simulation state, NO fetch logic, NO derived data. Template binds refs.

  §Dumb-components rule: intelligence lives in the composable, not <script setup>.
-->
<template>
  <div class="dag-topology">
    <div class="dag-topology__controls">
      <button
        type="button"
        class="dag-topology__btn"
        :class="{ 'is-active': groupBy === 'depth' }"
        @click="$emit('update:groupBy', 'depth')"
      >
        depth
      </button>
      <button
        type="button"
        class="dag-topology__btn"
        :class="{ 'is-active': groupBy === 'cluster' }"
        @click="$emit('update:groupBy', 'cluster')"
      >
        cluster
      </button>
      <button type="button" class="dag-topology__btn" @click="$emit('reheat')">
        reheat
      </button>
      <button
        v-if="hasGraph"
        type="button"
        class="dag-topology__btn"
        :disabled="exporting"
        @click="onExportSvg"
      >Export SVG</button>
      <button
        v-if="hasGraph"
        type="button"
        class="dag-topology__btn"
        :disabled="exporting"
        @click="onExportPng"
      >Export PNG</button>
    </div>

    <svg
      ref="svgRef"
      :viewBox="`0 0 ${width} ${height}`"
      :width="width"
      :height="height"
      class="dag-topology__svg"
      role="img"
      aria-label="Force-directed DAG topology"
      @wheel.prevent="$emit('zoom', $event)"
    >
      <g :transform="`translate(${pan.x}, ${pan.y}) scale(${zoom})`">
        <g class="links">
          <line
            v-for="(edge, idx) in edges"
            :key="idx"
            :x1="edge.x1"
            :y1="edge.y1"
            :x2="edge.x2"
            :y2="edge.y2"
            class="link"
          />
        </g>
        <g class="nodes">
          <g
            v-for="node in nodes"
            :key="node.id"
            :transform="`translate(${node.x ?? 0}, ${node.y ?? 0})`"
            class="node"
            :class="[`node--${node.status}`, { 'node--frontier': node.isFrontier }]"
            @click="$emit('select', node.id)"
            @mouseenter="$emit('hover', node.id)"
            @mouseleave="$emit('hover', null)"
          >
            <circle :r="14" class="node-circle" />
            <text :y="28" text-anchor="middle" class="node-label">
              {{ node.id }}
            </text>
          </g>
        </g>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ComputedRef, Ref } from "vue";
import type { ForceNode, ForceLink } from "../composables/useForceLayout";
import { useGraphExport } from "../composables/useGraphExport";

interface Props {
  nodes: ForceNode[];
  links: ForceLink[];
  width: number;
  height: number;
  groupBy: "depth" | "cluster";
  zoom: number;
  pan: { x: number; y: number };
  exportName?: string;
}

const props = withDefaults(defineProps<Props>(), { exportName: "roadmap-dag" });

const svgRef: Ref<SVGSVGElement | null> = ref<SVGSVGElement | null>(null);
const { exporting, exportSvg, exportPng } = useGraphExport();
const hasGraph: ComputedRef<boolean> = computed<boolean>(() => props.nodes.length > 0);

async function onExportSvg(): Promise<void> {
  await exportSvg(svgRef.value, `${props.exportName}-topology`);
}
async function onExportPng(): Promise<void> {
  await exportPng(svgRef.value, `${props.exportName}-topology`);
}

defineEmits<{
  (e: "select", id: string): void;
  (e: "hover", id: string | null): void;
  (e: "update:groupBy", value: "depth" | "cluster"): void;
  (e: "reheat"): void;
  (e: "zoom", event: WheelEvent): void;
}>();

interface RenderEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const edges = computed<RenderEdge[]>(() =>
  props.links.map((link) => ({
    x1: endpointX(link.source),
    y1: endpointY(link.source),
    x2: endpointX(link.target),
    y2: endpointY(link.target),
  })),
);

function endpointX(end: ForceLink["source"]): number {
  if (typeof end === "string") return 0;
  return end.x ?? 0;
}

function endpointY(end: ForceLink["source"]): number {
  if (typeof end === "string") return 0;
  return end.y ?? 0;
}
</script>

<style scoped>
.dag-topology {
  position: relative;
  width: 100%;
  height: 100%;
}
.dag-topology__controls {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  gap: 4px;
  z-index: 1;
}
.dag-topology__btn {
  padding: 4px 8px;
  font-size: 12px;
  background: #1a1a1a;
  color: #ddd;
  border: 1px solid #333;
  cursor: pointer;
}
.dag-topology__btn.is-active {
  background: #2a4a6a;
  border-color: #4a7aaa;
}
.dag-topology__svg {
  display: block;
  background: #0a0a0a;
}
.link {
  stroke: #444;
  stroke-width: 1;
}
.node {
  cursor: pointer;
}
.node-circle {
  fill: #2a2a2a;
  stroke: #666;
  stroke-width: 1.5;
}
.node--done .node-circle {
  fill: #2a5a3a;
  stroke: #5aaa6a;
}
.node--in-progress .node-circle {
  fill: #5a4a2a;
  stroke: #aa8a4a;
}
.node--blocked .node-circle {
  fill: #2a2a2a;
  stroke: #555;
}
.node--plan-mode .node-circle {
  fill: #3a2a4a;
  stroke: #6a5a8a;
}
.node--frontier .node-circle {
  filter: drop-shadow(0 0 4px #ffaa00);
}
.node-label {
  fill: #ccc;
  font-size: 9px;
  pointer-events: none;
}
</style>
