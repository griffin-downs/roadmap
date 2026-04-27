<script setup lang="ts">
// Roadmap viewer shell — minimal composition exposing field-expander panels
// for roadmap-level + node-level inspection. Real DAG composition still
// lands in the dedicated port nodes; this shell is a usable inspector now.

import { computed, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import FieldExpander from "./components/FieldExpander.vue";
import NodeSidePanel from "./components/NodeSidePanel.vue";
import type { InspectedNode } from "./components/NodeSidePanel.vue";
import { useDagPayload } from "./services/dagReader";

const payload = useDagPayload();
const detailsOpen: Ref<boolean> = ref<boolean>(true);
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

const selectedNodeId: Ref<string> = ref<string>("");
const selectedNode: ComputedRef<InspectedNode | null> = computed(() => {
  const p = payload.value;
  if (p === null || !selectedNodeId.value) return null;
  const n = p.head.nodes[selectedNodeId.value];
  if (!n) return null;
  return n as unknown as InspectedNode;
});
const nodeIds: ComputedRef<string[]> = computed(() => {
  const p = payload.value;
  return p === null ? [] : Object.keys(p.head.nodes);
});
</script>

<template>
  <main class="viewer-shell">
    <header class="viewer-head">
      <h1>roadmap viewer</h1>
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

    <section class="node-pick">
      <label>
        node:
        <select v-model="selectedNodeId">
          <option value="">— select —</option>
          <option v-for="id in nodeIds" :key="id" :value="id">{{ id }}</option>
        </select>
      </label>
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
  background: var(--chrome-00, #050505);
  min-height: 100vh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.viewer-head { display: flex; justify-content: space-between; align-items: baseline; }
.viewer-head h1 { margin: 0; font-size: 16px; }
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
  max-height: 50vh;
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
.node-pick { font-size: 12px; }
.node-pick select {
  background: var(--chrome-10, #161616);
  border: 1px solid var(--chrome-25, #333);
  color: var(--text-primary, #eee);
  font: inherit;
  padding: 3px 6px;
}
</style>
