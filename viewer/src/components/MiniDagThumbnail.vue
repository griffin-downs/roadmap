<!--
  MiniDagThumbnail — read-only, dimensionally-constrained SVG preview of a
  DAG. Used by the gallery lineage pane (g-lineage-pane) so each archived
  round shows a recognizable shape at a glance. Reuses useDagLayout from
  DagViewer's stack to guarantee shape parity with the full viewer.

  Constraints:
    · single prop  : head (HeadJson)
    · ~240 × 140 px viewport, scaled to fit
    · dots for nodes, thin lines for edges, no labels, no tooltip
    · click bubbles up so the parent can navigate
-->

<template>
  <svg
    class="mini-dag-thumbnail"
    :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
    :width="VIEW_W"
    :height="VIEW_H"
    role="img"
    :aria-label="`DAG preview: ${props.head.id}`"
    @click="onClick"
  >
    <g :transform="transform">
      <path
        v-for="edge in layout.edges"
        :key="`${edge.from}->${edge.to}`"
        :d="edge.dFromPath"
        class="mini-edge"
      />
      <circle
        v-for="node in layout.nodes"
        :key="node.id"
        :cx="node.x + node.width / 2"
        :cy="node.y + node.height / 2"
        :r="DOT_R"
        :class="['mini-node', `mini-node--${node.status}`]"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { HeadJson, DagPayload } from "../services/dagReader";
import { useDagLayout, DEFAULT_LAYOUT_OPTIONS } from "../composables/useDagLayout";
import type { LayoutOptions } from "../composables/useDagLayout";

const props = defineProps<{ head: HeadJson }>();
const emit = defineEmits<{ (e: "click", dagId: string): void }>();

const VIEW_W = 240;
const VIEW_H = 140;
const DOT_R = 4;

// Synthesize a minimal DagPayload — mini view ignores completion / intent.
// Empty completed array means useDagLayout classifies nodes per its own
// rules; that is correct preview semantics (we show shape, not progress).
const payload = computed<DagPayload | null>(() => ({
  head: props.head,
  completed: [],
  completedEntries: {},
  intentEvals: {},
  dagId: props.head.id,
}));

// Tighter spacing than the default — we are drawing dots, not cards.
const options = computed<LayoutOptions>(() => ({
  ...DEFAULT_LAYOUT_OPTIONS,
  nodeWidth: 40,
  nodeHeight: 24,
  levelGap: 36,
  columnGap: 12,
  marginX: 12,
  marginY: 12,
}));

const layout = useDagLayout(payload, options);

// Uniform-scale the layout into the 240×140 viewport, centered.
const transform = computed(() => {
  const w = layout.value.width || 1;
  const h = layout.value.height || 1;
  const scale = Math.min(VIEW_W / w, VIEW_H / h);
  const tx = (VIEW_W - w * scale) / 2;
  const ty = (VIEW_H - h * scale) / 2;
  return `translate(${tx} ${ty}) scale(${scale})`;
});

function onClick(): void {
  emit("click", props.head.id);
}
</script>

<style scoped>
.mini-dag-thumbnail {
  display: block;
  cursor: pointer;
  background: oklch(0.18 0.02 270);
  border-radius: 6px;
}

.mini-edge {
  fill: none;
  stroke: oklch(0.55 0.02 270 / 0.5);
  stroke-width: 1;
}

.mini-node {
  stroke: oklch(0.95 0.01 270);
  stroke-width: 0.75;
}

.mini-node--done       { fill: #5BC97A; }
.mini-node--in-progress{ fill: #FFB07A; }
.mini-node--blocked    { fill: #9D7EE6; }
.mini-node--ready      { fill: #FF8FB5; }
.mini-node--plan-mode  { fill: #70AAC6; }
</style>
