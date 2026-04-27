<script setup lang="ts">
// Roadmap viewer shell — composes the DAG renderer (hierarchical default,
// force topology selectable) with a side pane for full node detail and a
// collapsible field-expander for raw head.json / completed / intentEvals.
//
// §Dumb-components: this shell composes; DagViewer/DagTopology are pure
// props-in/events-out. No fetch/state-derivation lives in their script
// setup. Click on any node bubbles up to open NodeSidePanel here.

import { computed, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import FieldExpander from "./components/FieldExpander.vue";
import NodeSidePanel from "./components/NodeSidePanel.vue";
import type { InspectedNode } from "./components/NodeSidePanel.vue";
import DagViewer from "./components/DagViewer.vue";
import DagTopology from "./components/DagTopology.vue";
import { useDagPayload } from "./services/dagReader";
import { DEFAULT_LAYOUT_OPTIONS, useDagLayout } from "./composables/useDagLayout";
import {
  DEFAULT_FORCE_OPTIONS,
  useForceLayout,
  type ForceLayoutOptions,
} from "./composables/useForceLayout";

const payload = useDagPayload();

// view mode: hierarchical is the parity-with-dashboard default
const viewMode: Ref<"hierarchical" | "topology"> = ref<"hierarchical" | "topology">(
  "hierarchical",
);

// hierarchical layout
const layoutOptions = ref(DEFAULT_LAYOUT_OPTIONS);
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

function onNodeSelected(nodeId: string): void {
  selectedNodeId.value = nodeId;
}

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
</script>

<template>
  <main class="viewer-shell">
    <header class="viewer-head">
      <h1>roadmap viewer · <span class="dag-id">{{ dagId }}</span></h1>
      <div class="view-toggle">
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
        export-name="roadmap-dag"
        @node-selected="onNodeSelected"
      />
      <DagTopology
        v-else
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

    <header class="details-head">
      <button type="button" class="head-toggle" @click="detailsOpen = !detailsOpen">
        roadmap details {{ detailsOpen ? '▾' : '▸' }}
      </button>
    </header>
    <section v-if="detailsOpen" class="details">
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

    <NodeSidePanel
      :node="selectedNode"
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
}
.viewer-head { display: flex; justify-content: space-between; align-items: baseline; }
.viewer-head h1 { margin: 0; font-size: 16px; font-weight: 600; }
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
</style>
