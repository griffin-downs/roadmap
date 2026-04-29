<template>
  <aside class="node-panel dag-foil-halo" :aria-label="node ? `Node ${node.id}` : 'No node selected'">
    <div v-if="node === null" class="node-panel-empty">
      <p>select a node from the DAG</p>
    </div>

    <div v-else class="node-panel-body">
      <header class="node-panel-head">
        <span class="status-badge" :data-status="status">{{ status }}</span>
        <h2 class="node-id">{{ node.id }}</h2>
        <button v-if="!printMode" type="button" class="close-btn" aria-label="close panel" @click="emitClose">×</button>
      </header>

      <p class="node-desc">{{ node.desc }}</p>

      <section v-if="hasProduces" class="panel-section">
        <h3 class="section-title">produces</h3>
        <ul class="produces-list">
          <li v-for="path in node.produces" :key="path">
            <code>{{ path }}</code>
          </li>
        </ul>
      </section>

      <section v-if="hasValidators" class="panel-section">
        <h3 class="section-title">validators</h3>
        <ul class="validator-list">
          <li
            v-for="(check, index) in validatorChecks"
            :key="`${check.rule}-${index}`"
            class="validator-row"
            :class="{ 'validator-row--pass': check.passed, 'validator-row--fail': !check.passed }"
          >
            <span class="validator-icon" aria-hidden="true">{{ check.passed ? "✓" : "✗" }}</span>
            <span class="validator-rule">{{ check.rule }}</span>
            <span v-if="check.evidence" class="validator-evidence">{{ check.evidence }}</span>
          </li>
        </ul>
      </section>

      <section v-if="receipt !== undefined && receipt !== null" class="panel-section">
        <h3 class="section-title">receipt</h3>
        <ReceiptTree :node="receipt" :depth="0" :path="''" />
      </section>

      <section class="panel-section">
        <h3 class="section-title">
          <button type="button" class="raw-toggle" @click="rawOpen = !rawOpen">
            raw fields {{ rawOpen ? '−' : '+' }}
          </button>
        </h3>
        <div v-if="rawOpen" class="raw-block">
          <input
            v-model="rawSearch"
            type="search"
            class="raw-search"
            placeholder="filter keys/values…"
            aria-label="filter raw fields"
          />
          <FieldExpander
            :data="node"
            :path="`$.nodes[${JSON.stringify(node.id)}]`"
            :search="rawSearchDebounced"
          />
        </div>
      </section>

      <section v-if="commits.length > 0" class="panel-section">
        <h3 class="section-title">git log (produces)</h3>
        <ul class="commit-list">
          <li v-for="commit in commits" :key="commit.sha" class="commit-row">
            <code class="commit-sha">{{ commit.sha.slice(0, 8) }}</code>
            <span class="commit-subject">{{ commit.subject }}</span>
            <span class="commit-date">{{ commit.date }}</span>
          </li>
        </ul>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
// NodeSidePanel — DUMB inspector. Props: typed node + validators + receipt
// + git log + live status (computed upstream from realtimeBridge stream).
// Events out: close. No fetch / no setInterval / no JSON parse here —
// all data shaping happens in the parent wiring layer (§Dumb-components).
//
// New for r1.5 (viewer-build-node-side-panel) — NICER feature #2.

import { computed, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import ReceiptTree from "./ReceiptTree.vue";
import FieldExpander from "./FieldExpander.vue";

export type NodeStatus = "pending" | "in-progress" | "green" | "red";

export interface ValidatorCheck {
  rule: string;
  passed: boolean;
  evidence?: string;
}

export interface CommitEntry {
  sha: string;
  subject: string;
  date: string;
}

export interface InspectedNode {
  id: string;
  desc: string;
  produces?: string[];
  validators?: ValidatorCheck[];
}

interface Props {
  node: InspectedNode | null;
  status?: NodeStatus;
  /** parsed receipt JSON object — not the raw string */
  receipt?: unknown | null;
  commits?: CommitEntry[];
  printMode?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  status: "pending",
  receipt: undefined,
  commits: () => [],
  printMode: false,
});

const emit = defineEmits<{ (event: "close"): void }>();

const hasProduces: ComputedRef<boolean> = computed<boolean>(() => {
  const list = props.node?.produces;
  return Array.isArray(list) && list.length > 0;
});

const hasValidators: ComputedRef<boolean> = computed<boolean>(() => validatorChecks.value.length > 0);

const validatorChecks: ComputedRef<ValidatorCheck[]> = computed<ValidatorCheck[]>(() => {
  const list = props.node?.validators;
  return Array.isArray(list) ? list : [];
});

const rawOpen: Ref<boolean> = ref<boolean>(false);
const rawSearch: Ref<string> = ref<string>("");
const rawSearchDebounced: Ref<string> = ref<string>("");
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(rawSearch, (q) => {
  if (searchTimer !== null) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { rawSearchDebounced.value = q; }, 80);
});

function emitClose(): void {
  emit("close");
}
</script>

<style scoped>
.node-panel {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--chrome-05, #0a0a0a);
  color: var(--text-primary, #eee);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  border-left: 1px solid var(--chrome-25, #333);
  overflow-y: auto;
}
.node-panel-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-meta, #888);
}
.node-panel-body { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.node-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.node-id { margin: 0; font-size: 14px; flex: 1; }
.status-badge {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border: 1px solid var(--chrome-30, #444);
  color: var(--text-meta, #888);
}
.status-badge[data-status="green"] { color: oklch(0.65 0.14 150); border-color: oklch(0.55 0.14 150); }
.status-badge[data-status="red"] { color: var(--accent-red, #d33); border-color: var(--accent-red, #d33); }
.status-badge[data-status="in-progress"] { color: oklch(0.7 0.14 60); border-color: oklch(0.55 0.14 60); }
.close-btn {
  background: transparent;
  border: 1px solid var(--chrome-30, #444);
  color: var(--text-primary, #eee);
  font: inherit;
  padding: 0 8px;
  cursor: pointer;
}
.close-btn:hover { border-color: var(--accent-red, #d33); }
.node-desc { margin: 0; line-height: 1.5; }
.panel-section { display: flex; flex-direction: column; gap: 6px; }
.section-title {
  margin: 0;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-meta, #888);
  border-bottom: 1px solid var(--chrome-25, #333);
  padding-bottom: 2px;
}
.produces-list, .validator-list, .commit-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.produces-list code { font-size: 11px; word-break: break-all; }
.validator-row {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 6px;
  align-items: start;
  padding: 2px 0;
}
.validator-row--pass .validator-icon { color: oklch(0.65 0.14 150); }
.validator-row--fail .validator-icon { color: var(--accent-red, #d33); }
.validator-rule { font-size: 11px; word-break: break-all; }
.validator-evidence {
  grid-column: 2;
  font-size: 10px;
  color: var(--text-meta, #888);
  word-break: break-all;
}
.commit-row {
  display: grid;
  grid-template-columns: 64px 1fr 80px;
  gap: 6px;
  align-items: baseline;
}
.commit-sha { color: var(--accent-red, #d33); }
.commit-subject { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.commit-date { color: var(--text-meta, #888); font-size: 10px; text-align: right; }
.raw-toggle {
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  padding: 0;
  letter-spacing: inherit;
  text-transform: inherit;
}
.raw-toggle:hover { color: var(--accent-red, #d33); }
.raw-block { display: flex; flex-direction: column; gap: 4px; }
.raw-search {
  background: var(--chrome-10, #161616);
  border: 1px solid var(--chrome-25, #333);
  color: var(--text-primary, #eee);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  padding: 3px 5px;
  width: 100%;
}
.raw-search:focus { outline: 1px solid var(--accent-red, #d33); }
</style>
