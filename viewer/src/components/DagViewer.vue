<template>
  <div class="dag-viewer" :class="{ 'dag-viewer--tablet': tablet }">
    <svg
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
      </defs>

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
          @click="emitClick(node.id)"
        >
          <rect
            :width="node.width"
            :height="node.height"
            rx="4"
            ry="4"
            class="node-rect"
          />
          <text :x="8" :y="18" class="node-id">{{ node.id }}</text>
          <text v-if="!tablet" :x="8" :y="36" class="node-status">{{ node.status }}</text>
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

import { computed, ref } from "vue";
import type { ComputedRef, Ref } from "vue";
import type { DagLayout, LaidOutEdge, LaidOutNode } from "../composables/useDagLayout";

interface Props {
  layout: DagLayout;
  tablet?: boolean;
}

const props = withDefaults(defineProps<Props>(), { tablet: false });
const emit = defineEmits<{ (event: "node-selected", nodeId: string): void }>();

const hoveredId: Ref<string | null> = ref<string | null>(null);

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

function emitClick(nodeId: string): void {
  emit("node-selected", nodeId);
}
</script>

<style scoped>
.dag-viewer {
  overflow: auto;
  width: 100%;
  height: 100%;
  background: var(--chrome-05, #0a0a0a);
  border: 1px solid var(--chrome-25, #333);
}
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
