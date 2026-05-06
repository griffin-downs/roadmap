<template>
  <Transition name="dag-tooltip">
    <div
      v-if="nodeData"
      ref="paneRef"
      class="dag-tooltip dag-foil-halo"
      :class="{
        'dag-tooltip--expanded': expanded,
      }"
      :style="paneStyle"
      role="dialog"
      :aria-label="`Node ${nodeData.id}`"
      @click.stop
    >
      <header
        class="dag-tooltip__head dag-tooltip__head--draggable"
        @mousedown="onHeaderMouseDown"
      >
        <span
          v-if="nodeData.status"
          class="dag-tooltip__status"
          :data-status="nodeData.status"
        >
          {{ nodeData.status }}
        </span>
        <span class="dag-tooltip__id">{{ nodeData.id }}</span>
        <span
          v-if="nodeData.mode && nodeData.mode !== 'execute'"
          class="dag-tooltip__mode"
          :data-mode="nodeData.mode"
        >
          {{ nodeData.mode }}
        </span>
        <button
          v-if="!printMode"
          type="button"
          class="dag-tooltip__close"
          aria-label="close"
          @click="emit('close')"
        >×</button>
      </header>

      <!-- Raw view · full JSON, copyable, single column -->
      <pre v-if="!printMode && viewMode === 'raw'" class="dag-tooltip__raw"><code>{{ rawJson }}</code></pre>

      <!-- Pretty (default, non-print) · two-panel inspector
           LEFT  schema tree (one row per present field) · click to select
           RIGHT selected field rendered with breathing room              -->
      <div v-if="!printMode && viewMode === 'pretty' && !expanded" class="dag-tooltip__panes">
        <ul
          class="dag-tooltip__tree"
          role="listbox"
          :aria-activedescendant="`tt-row-${selectedField}`"
        >
          <li
            v-for="row in fieldRows"
            :key="row.key"
            :id="`tt-row-${row.key}`"
            class="dag-tooltip__tree-row"
            :class="{ 'is-selected': row.key === selectedField }"
            role="option"
            :aria-selected="row.key === selectedField"
            tabindex="0"
            @click="selectedField = row.key"
            @keydown.enter.prevent="selectedField = row.key"
            @keydown.space.prevent="selectedField = row.key"
          >
            <span class="dag-tooltip__tree-key">{{ row.label }}</span>
            <span class="dag-tooltip__tree-preview">{{ row.preview }}</span>
          </li>
        </ul>

        <div class="dag-tooltip__detail" :data-field="selectedField">
          <template v-if="selectedField === 'id'">
            <div class="dag-tooltip__detail-id">{{ nodeData.id }}</div>
          </template>

          <template v-else-if="selectedField === 'desc'">
            <p
              v-for="(para, i) in descParagraphs"
              :key="i"
              class="dag-tooltip__detail-para"
            >{{ para }}</p>
          </template>

          <template v-else-if="selectedField === 'produces'">
            <ul class="dag-tooltip__detail-list">
              <li v-for="p in nodeData.produces" :key="p">{{ p }}</li>
            </ul>
          </template>

          <template v-else-if="selectedField === 'consumes'">
            <ul class="dag-tooltip__detail-list">
              <li v-for="c in nodeData.consumes" :key="c">{{ c }}</li>
            </ul>
          </template>

          <template v-else-if="selectedField === 'validate'">
            <div
              v-for="(v, i) in nodeData.validate"
              :key="i"
              class="dag-tooltip__detail-rule"
            >
              <div class="dag-tooltip__detail-rule-type">{{ v.type }}</div>
              <div v-if="v.target" class="dag-tooltip__detail-rule-body">{{ v.target }}</div>
              <div v-else-if="v.command" class="dag-tooltip__detail-rule-body">{{ v.command }}</div>
            </div>
          </template>

          <template v-else-if="selectedField === 'mode'">
            <div class="dag-tooltip__detail-mode" :data-mode="nodeData.mode || 'execute'">
              {{ nodeData.mode || 'execute' }}
            </div>
          </template>

          <template v-else-if="selectedField === 'sidecar'">
            <pre class="dag-tooltip__detail-json"><code>{{ sidecarPretty }}</code></pre>
          </template>
        </div>
      </div>

      <!-- Print mode · just the node description, generously sized -->
      <p v-if="printMode" class="dag-tooltip__print-desc">
        {{ nodeData.desc || nodeData.id }}
      </p>

      <!-- Footer · raw|pretty toggle (non-print) · LOCAL state, persisted -->
      <div
        v-if="!printMode"
        class="dag-tooltip__view-mode"
        role="tablist"
        aria-label="tooltip view mode"
      >
        <button
          type="button"
          role="tab"
          :aria-pressed="viewMode === 'pretty'"
          :class="{ 'is-active': viewMode === 'pretty' }"
          @click="viewMode = 'pretty'"
        >pretty</button>
        <button
          type="button"
          role="tab"
          :aria-pressed="viewMode === 'raw'"
          :class="{ 'is-active': viewMode === 'raw' }"
          @click="viewMode = 'raw'"
        >raw</button>
      </div>

      <div
        class="dag-tooltip__resize-handle"
        aria-label="resize tooltip"
        @mousedown="onResizeHandleMouseDown"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
// NodeTooltipPane — DUMB click-adjacent inspector. §Dumb-components.
//   props: nodeData, anchorRect, expanded
//   emits: close, expand
// No fetch / no timer / no derivation beyond pure computed. Position is
// computed once per nodeData/anchorRect change in the orchestrator and
// passed in via positionStyle for compositor-friendly transform/opacity.

import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import type { ComputedRef, Ref } from "vue";
import { computeTooltipPosition, type AnchorRect } from "../composables/useTooltipPosition";

// Loose shape · canonical v2 NodeSpec fields only. Engine-derived runtime
// fields (e.g. deps) live on the compiled head.json but aren't part of the
// spec contract — keep them out of the type so the tooltip can't surface
// them. Record<string, unknown> base lets the raw-mode filter still see
// extras at runtime if needed for forward compat.
type NodeData = Record<string, unknown> & {
  id: string;
  status?: string;
  desc?: string;
  consumes?: string[];
  produces?: string[];
  mode?: string;
  validate?: Array<{ type: string; command?: string; statement?: string; target?: string }>;
  sidecar?: Record<string, unknown>;
};

interface Props {
  nodeData: NodeData | null;
  anchorRect: AnchorRect | null;
  expanded?: boolean;
  printMode?: boolean;
  rootIntent?: string;
}

const props = withDefaults(defineProps<Props>(), {
  expanded: false,
  printMode: false,
  rootIntent: "",
});

// View-mode (raw vs pretty) · LOCAL state · persisted per-tooltip pref.
type ViewMode = "raw" | "pretty";
const VIEW_MODE_KEY = "viewer-tooltip-view-mode";
function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    return v === "raw" ? "raw" : "pretty";
  } catch { return "pretty"; }
}
const viewMode: Ref<ViewMode> = ref<ViewMode>(loadViewMode());
watch(viewMode, (v) => {
  try { localStorage.setItem(VIEW_MODE_KEY, v); } catch { /* ignore */ }
});
const emit = defineEmits<{
  (e: "close"): void;
}>();

// Raw-mode JSON · canonical v2 NodeSpec only (id, desc, produces, consumes,
// validate, mode?, sidecar?). The compiled head.json carries engine-derived
// fields like `deps` — those are runtime state, not part of the spec the
// author wrote. Raw view shows the spec, not the runtime materialization.
const CANONICAL_NODE_FIELDS = ["id", "desc", "produces", "consumes", "validate", "mode", "sidecar"] as const;
const rawJson: ComputedRef<string> = computed(() => {
  const n = props.nodeData as Record<string, unknown> | null;
  if (!n) return "";
  const canonical: Record<string, unknown> = {};
  for (const k of CANONICAL_NODE_FIELDS) {
    if (n[k] !== undefined) canonical[k] = n[k];
  }
  try { return JSON.stringify(canonical, null, 2); } catch { return "[unserializable]"; }
});

const paneRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(null);
const measuredSize: Ref<{ width: number; height: number }> = ref({ width: 320, height: 200 });

const firstLine: ComputedRef<string> = computed(() => {
  const d = props.nodeData?.desc ?? "";
  const newline = d.indexOf("\n");
  return newline === -1 ? d : d.slice(0, newline);
});

const hasProduces: ComputedRef<boolean> = computed(() =>
  Array.isArray(props.nodeData?.produces) && (props.nodeData?.produces?.length ?? 0) > 0,
);
const hasValidate: ComputedRef<boolean> = computed(() =>
  Array.isArray(props.nodeData?.validate) && (props.nodeData?.validate?.length ?? 0) > 0,
);
const hasConsumes: ComputedRef<boolean> = computed(() =>
  Array.isArray(props.nodeData?.consumes) && (props.nodeData?.consumes?.length ?? 0) > 0,
);
const hasSidecar: ComputedRef<boolean> = computed(() => {
  const s = props.nodeData?.sidecar;
  return s !== undefined && s !== null && typeof s === "object" && Object.keys(s as object).length > 0;
});
const sidecarKeys: ComputedRef<string[]> = computed(() => {
  const s = props.nodeData?.sidecar;
  if (!s || typeof s !== "object") return [];
  return Object.keys(s as object);
});
const sidecarOpen: Ref<boolean> = ref(false);

// Two-panel inspector · selected field drives the right-pane render.
type FieldKey = "id" | "desc" | "produces" | "consumes" | "validate" | "mode" | "sidecar";
const selectedField: Ref<FieldKey> = ref<FieldKey>("desc");

// Reset selection to "desc" whenever the tooltip targets a different node.
// (We watch id rather than nodeData itself so re-renders on irrelevant
// prop churn don't reset the user's chosen field.)
watch(
  () => props.nodeData?.id ?? null,
  (id) => {
    if (id === null) return;
    // Default to desc when present, else id (always present).
    selectedField.value = (props.nodeData?.desc ?? "").length > 0 ? "desc" : "id";
  },
  { immediate: true },
);

const descParagraphs: ComputedRef<string[]> = computed(() => {
  const d = props.nodeData?.desc ?? "";
  // Split on blank lines · preserves the scenario/Given-When-Then structure
  // already conventional in node descs.
  return d.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
});

const sidecarPretty: ComputedRef<string> = computed(() => {
  const s = props.nodeData?.sidecar;
  if (!s || typeof s !== "object") return "";
  try { return JSON.stringify(s, null, 2); } catch { return "[unserializable]"; }
});

// Tree rows · only fields actually present (or always-present id/desc).
// preview = truncated value for scalars · count for arrays · "{ k1, k2 }" for objects.
const fieldRows: ComputedRef<Array<{ key: FieldKey; label: string; preview: string }>> = computed(() => {
  const n = props.nodeData;
  if (!n) return [];
  const rows: Array<{ key: FieldKey; label: string; preview: string }> = [];
  const trim = (s: string, max = 40): string => s.length <= max ? s : s.slice(0, max - 1) + "…";

  rows.push({ key: "id", label: "id", preview: trim(n.id ?? "") });

  const desc = (n.desc ?? "").trim();
  if (desc.length > 0) {
    const firstSentence = desc.split(/\n/)[0];
    rows.push({ key: "desc", label: "desc", preview: trim(firstSentence, 48) });
  }

  if (Array.isArray(n.produces) && n.produces.length > 0) {
    rows.push({ key: "produces", label: "produces", preview: `[${n.produces.length}] ${trim(n.produces[0])}` });
  }
  if (Array.isArray(n.consumes) && n.consumes.length > 0) {
    rows.push({ key: "consumes", label: "consumes", preview: `[${n.consumes.length}] ${trim(n.consumes[0])}` });
  }
  if (Array.isArray(n.validate) && n.validate.length > 0) {
    const types = n.validate.map((v) => v.type).slice(0, 3).join(", ");
    rows.push({ key: "validate", label: "validate", preview: `[${n.validate.length}] ${trim(types, 28)}` });
  }
  if (n.mode && n.mode !== "execute") {
    rows.push({ key: "mode", label: "mode", preview: n.mode });
  }
  if (n.sidecar && typeof n.sidecar === "object" && Object.keys(n.sidecar).length > 0) {
    const keys = Object.keys(n.sidecar).slice(0, 3).join(", ");
    rows.push({ key: "sidecar", label: "sidecar", preview: `{ ${trim(keys, 30)} }` });
  }

  return rows;
});
type Rect = { top: number; left: number; width: number; height: number };
const STORAGE_KEY = "dag-tooltip-print-rect";
const tooltipRect: Ref<Rect | null> = ref<Rect | null>(null);
const dragState: Ref<null | {
  mode: "move" | "resize";
  startMouseX: number; startMouseY: number;
  startTop: number; startLeft: number; startWidth: number; startHeight: number;
}> = ref(null);

function loadRect(): Rect | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Rect;
  } catch { return null; }
}
function saveRect(r: Rect): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); } catch { /* ignore */ }
}
function defaultRect(): Rect {
  const vpW = window.innerWidth;
  const w = 380;
  const h = 240;
  return { top: 80, left: Math.max(0, vpW - w - 60), width: w, height: h };
}

function ensureRect(): void {
  // First user-driven move/resize seeds tooltipRect from the current
  // anchor-driven layout. After this, the tooltip is "user-positioned"
  // and ignores anchorRect updates.
  if (tooltipRect.value !== null) return;
  const el = paneRef.value;
  if (el) {
    const r = el.getBoundingClientRect();
    tooltipRect.value = { top: r.top, left: r.left, width: r.width, height: r.height };
  } else {
    tooltipRect.value = defaultRect();
  }
}
function onHeaderMouseDown(ev: MouseEvent): void {
  if ((ev.target as HTMLElement).closest("button")) return;
  ensureRect();
  if (!tooltipRect.value) return;
  ev.preventDefault();
  dragState.value = {
    mode: "move",
    startMouseX: ev.clientX, startMouseY: ev.clientY,
    startTop: tooltipRect.value.top, startLeft: tooltipRect.value.left,
    startWidth: tooltipRect.value.width, startHeight: tooltipRect.value.height,
  };
}
function onResizeHandleMouseDown(ev: MouseEvent): void {
  ensureRect();
  if (!tooltipRect.value) return;
  ev.preventDefault();
  ev.stopPropagation();
  dragState.value = {
    mode: "resize",
    startMouseX: ev.clientX, startMouseY: ev.clientY,
    startTop: tooltipRect.value.top, startLeft: tooltipRect.value.left,
    startWidth: tooltipRect.value.width, startHeight: tooltipRect.value.height,
  };
}
function onDragMove(ev: MouseEvent): void {
  const ds = dragState.value;
  if (!ds || !tooltipRect.value) return;
  const dx = ev.clientX - ds.startMouseX;
  const dy = ev.clientY - ds.startMouseY;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  if (ds.mode === "move") {
    const top = Math.max(0, Math.min(vpH - 100, ds.startTop + dy));
    const left = Math.max(0, Math.min(vpW - 100, ds.startLeft + dx));
    tooltipRect.value = { ...tooltipRect.value, top, left };
  } else {
    const width = Math.max(280, Math.min(vpW - ds.startLeft - 20, ds.startWidth + dx));
    const height = Math.max(200, Math.min(vpH - ds.startTop - 20, ds.startHeight + dy));
    tooltipRect.value = { ...tooltipRect.value, width, height };
  }
  window.dispatchEvent(new CustomEvent("dag-tooltip-rect-change"));
}
function onDragEnd(): void {
  if (dragState.value && tooltipRect.value) saveRect(tooltipRect.value);
  dragState.value = null;
}

onMounted(() => {
  if (props.printMode) tooltipRect.value = loadRect() ?? defaultRect();
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);
});
onBeforeUnmount(() => {
  window.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("mouseup", onDragEnd);
});

const paneStyle: ComputedRef<Record<string, string>> = computed<Record<string, string>>(() => {
  // Print mode OR user-dragged · use the persisted/active rect.
  // Once the user has dragged or resized in any mode, tooltipRect is set
  // and we honor it over the anchor positioning.
  if (props.printMode || tooltipRect.value !== null) {
    const r = tooltipRect.value ?? defaultRect();
    return {
      position: "fixed",
      top: `${r.top}px`,
      left: `${r.left}px`,
      right: "auto",
      width: `${r.width}px`,
      height: `${r.height}px`,
      cursor: dragState.value?.mode === "move" ? "grabbing" : "auto",
      "--tooltip-placement": "fixed-user-positioned",
    } as Record<string, string>;
  }
  const a = props.anchorRect;
  if (a === null) return { display: "none" } as Record<string, string>;
  const pos = computeTooltipPosition({
    anchorRect: a,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    paneSize: measuredSize.value,
  });
  return {
    top: `${pos.top}px`,
    left: `${pos.left}px`,
    "--tooltip-placement": pos.placement,
  } as Record<string, string>;
});

watch(
  () => [props.nodeData, props.anchorRect, props.expanded],
  async () => {
    await nextTick();
    const el = paneRef.value;
    if (el) {
      const r = el.getBoundingClientRect();
      measuredSize.value = { width: r.width, height: r.height };
    }
  },
);
</script>

<style scoped>
.dag-tooltip {
  position: fixed;
  z-index: 1000;
  min-width: 480px;     /* widened for two-panel · tree + detail */
  max-width: 640px;
  max-height: 70vh;
  overflow: auto;
  padding: 12px;
  /* glass-surface from dag-theme.css supplies background/border/blur in
     non-print mode · print mode overrides background below. */
  font-family: var(--font-mono, 'Fira Code', ui-monospace, monospace);
  color: var(--ink-white, #F5F2E8);
  border-radius: 0;
  will-change: transform, opacity;
}
/* Raw-view JSON dump · single column, copyable */
.dag-tooltip__raw {
  margin: 0;
  padding: 10px 12px;
  background: var(--chrome-code);
  border: 1px solid var(--rule);
  font-family: var(--font-mono, 'Fira Code', ui-monospace, monospace);
  font-size: calc(12px * var(--font-scale, 1));
  line-height: 1.45;
  color: var(--text-secondary);
  overflow: auto;
  max-height: 60vh;
  white-space: pre;
  user-select: text;
}
.dag-tooltip__raw code { font: inherit; color: inherit; }
.dag-tooltip--expanded { min-width: 380px; max-width: 560px; }

.dag-tooltip__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.dag-tooltip__status {
  font-size: calc(9px * var(--font-scale, 1))px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
  color: var(--foil, #D7A432);
}
.dag-tooltip__status[data-status="in-progress"],
.dag-tooltip__status[data-status="frontier"] {
  color: var(--foil, #D7A432);
  border-color: var(--foil, #D7A432);
}
.dag-tooltip__status[data-status="done"],
.dag-tooltip__status[data-status="completed"] {
  color: oklch(0.70 0.12 145);
  border-color: oklch(0.70 0.12 145 / 0.4);
}
.dag-tooltip__id {
  flex: 1;
  font-weight: 600;
  font-size: calc(18px * var(--font-scale, 1));
  color: var(--foil, #D7A432);
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dag-tooltip__mode {
  font-size: calc(18px * var(--font-scale, 1));
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 6px;
  border: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
  color: var(--ink-dim, #B8B0A0);
}
.dag-tooltip__label--clickable {
  cursor: pointer;
  user-select: none;
}
.dag-tooltip__label--clickable:hover {
  color: var(--foil, #D7A432);
}
.dag-tooltip__close {
  background: none;
  border: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
  color: var(--ink-dim, #B8B0A0);
  font: inherit;
  font-size: calc(14px * var(--font-scale, 1))px;
  line-height: 1;
  padding: 0 6px;
  cursor: pointer;
}
.dag-tooltip__close:hover { color: var(--foil, #D7A432); border-color: var(--foil, #D7A432); }

.dag-tooltip__desc {
  margin: 0 0 10px 0;
  font-size: calc(11px * var(--font-scale, 1))px;
  line-height: 1.5;
  color: var(--ink-white, #F5F2E8);
}
.dag-tooltip__section { margin-bottom: 8px; }
.dag-tooltip__label {
  font-size: calc(9px * var(--font-scale, 1))px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-dim, #B8B0A0);
  margin-bottom: 2px;
}
.dag-tooltip__row {
  font-size: calc(10px * var(--font-scale, 1))px;
  color: var(--ink-white, #F5F2E8);
  word-break: break-all;
  padding: 1px 0;
}
.dag-tooltip__intent {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
}
.dag-tooltip__intent-text {
  margin: 0;
  font-size: calc(10px * var(--font-scale, 1))px;
  line-height: 1.5;
  color: var(--ink-dim, #B8B0A0);
  font-style: italic;
}
.dag-tooltip__expand {
  max-height: 50vh;
  overflow: auto;
  padding-top: 4px;
  border-top: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
}
.dag-tooltip__actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
}
.dag-tooltip__btn {
  flex: 1;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--foil, #D7A432);
  color: var(--foil, #D7A432);
  font-family: inherit;
  font-size: calc(10px * var(--font-scale, 1))px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 120ms;
}
.dag-tooltip__btn:hover {
  background: var(--foil-30, rgba(215, 164, 50, 0.3));
  color: var(--ink-white, #F5F2E8);
}

.dag-tooltip__print-desc {
  font-family: 'Source Serif 4', 'Crimson Pro', Georgia, serif;
  font-size: 30px;
  font-weight: 500;
  line-height: 1.4;
  color: #F5E5D0;
  margin: 18px 0 8px 0;
  padding: 0 4px;
  overflow-wrap: anywhere;
  word-break: break-word;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.dag-tooltip__head--draggable {
  cursor: grab;
  user-select: none;
}
.dag-tooltip__head--draggable:active { cursor: grabbing; }
.dag-tooltip__resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--foil, #D7A432) 50%);
  opacity: 0.65;
  z-index: 10;
  pointer-events: auto;
}
.dag-tooltip__resize-handle:hover { opacity: 1; }

/* Print-mode resize handle · sits cleanly in the visible bottom-right corner.
   Parent has padding 28px — absolute right/bottom is relative to padding-box,
   so we need negative offsets to land on the actual border edge. */
.dag-tooltip.dag-foil-halo.dag-tooltip--print {
  /* Y scroll allowed (content can grow past tooltip height) · X clipped so
     long values reflow within the resized width instead of escaping right.
     Resize handle uses absolute positioning + higher z-index to stay visible. */
  overflow-x: hidden;
  overflow-y: auto;
}
/* Open animation — 120ms fade + scale-in. Compositor-friendly. */
.dag-tooltip-enter-active { transition: transform 120ms ease-out, opacity 120ms ease-out; }
.dag-tooltip-leave-active { transition: transform 120ms ease-in, opacity 120ms ease-in; }
.dag-tooltip-enter-from,
.dag-tooltip-leave-to { transform: scale(0.95); opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .dag-tooltip-enter-active, .dag-tooltip-leave-active { transition: opacity 80ms; }
  .dag-tooltip-enter-from, .dag-tooltip-leave-to { transform: none; }
}

/* ── two-panel inspector ───────────────────────────────────────────
 * LEFT  schema tree (one row per present field) · click to select
 * RIGHT selected field rendered with breathing room
 * ----------------------------------------------------------------- */
.dag-tooltip__panes {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 12px;
  align-items: stretch;
  min-height: 200px;
}
.dag-tooltip__tree {
  list-style: none;
  margin: 0;
  padding: 0;
  border-right: 1px solid var(--rule, #4A3D6E);
  padding-right: 8px;
  font-size: calc(11px * var(--font-scale, 1))px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.dag-tooltip__tree-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 6px;
  cursor: pointer;
  border-radius: 2px;
  user-select: none;
}
.dag-tooltip__tree-row:hover {
  background: var(--chrome-15, rgba(255, 255, 255, 0.04));
}
.dag-tooltip__tree-row.is-selected {
  background: var(--chrome-25, rgba(255, 255, 255, 0.08));
  outline: 1px solid var(--accent-gold, #FCF791);
}
.dag-tooltip__tree-row:focus-visible {
  outline: 2px solid var(--accent-gold, #FCF791);
  outline-offset: 1px;
}
.dag-tooltip__tree-key {
  color: var(--accent-gold, #FCF791);
  font-weight: 600;
  letter-spacing: 0.04em;
}
.dag-tooltip__tree-preview {
  color: var(--text-meta, #8E8EBB);
  font-size: calc(10px * var(--font-scale, 1))px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Right pane · selected field detail · breathing room */
.dag-tooltip__detail {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: calc(14px * var(--font-scale, 1));
  line-height: 1.5;
  color: var(--text-primary, #F5F3BF);
  overflow-wrap: anywhere;
}
.dag-tooltip__detail-id {
  font-size: calc(18px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--accent-gold, #FCF791);
  letter-spacing: 0.02em;
}
.dag-tooltip__detail-para {
  margin: 0;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: calc(14px * var(--font-scale, 1));
  line-height: 1.55;
}
.dag-tooltip__detail-para + .dag-tooltip__detail-para {
  margin-top: 4px;
}
.dag-tooltip__detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dag-tooltip__detail-list li {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: calc(14px * var(--font-scale, 1));
  color: var(--text-primary, #F5F3BF);
  word-break: break-all;
}
.dag-tooltip__detail-rule {
  border-left: 2px solid var(--rule-strong, #8E8EBB);
  padding: 2px 0 2px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dag-tooltip__detail-rule-type {
  font-size: calc(10px * var(--font-scale, 1));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent-gold, #FCF791);
}
.dag-tooltip__detail-rule-body {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: calc(14px * var(--font-scale, 1));
  color: var(--text-primary, #F5F3BF);
  word-break: break-all;
}
.dag-tooltip__detail-mode {
  display: inline-block;
  font-size: calc(18px * var(--font-scale, 1));
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 6px 14px;
  border: 1px solid var(--rule-strong, #8E8EBB);
}
.dag-tooltip__detail-mode[data-mode="plan"] {
  color: var(--accent-orange, #E4DD4E);
  border-color: var(--accent-orange, #E4DD4E);
}
/* Footer view-mode toggle · pretty|raw segmented · interactive local state */
.dag-tooltip__view-mode {
  display: flex;
  gap: 0;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
  justify-content: flex-end;
}
.dag-tooltip__view-mode button {
  background: transparent;
  border: 1px solid var(--glass-border-rest, rgba(215, 164, 50, 0.3));
  color: var(--text-secondary, #ccc);
  font-family: inherit;
  font-size: calc(10px * var(--font-scale, 1));
  letter-spacing: 0.06em;
  text-transform: lowercase;
  padding: 3px 10px;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}
.dag-tooltip__view-mode button + button { border-left: none; }
.dag-tooltip__view-mode button:hover {
  color: var(--accent-gold, #FCF791);
  border-color: var(--accent-gold, #FCF791);
}
.dag-tooltip__view-mode button.is-active {
  color: var(--accent-gold, #FCF791);
  border-color: var(--accent-gold, #FCF791);
  background: var(--glass-bg-faded, rgba(255, 255, 255, 0.06));
}
.dag-tooltip__view-mode button:focus-visible {
  outline: 2px solid var(--accent-gold, #FCF791);
  outline-offset: 1px;
}

.dag-tooltip__detail-json {
  margin: 0;
  padding: 8px 10px;
  background: var(--chrome-code, #181829);
  border: 1px solid var(--rule, #4A3D6E);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: calc(14px * var(--font-scale, 1));
  line-height: 1.4;
  color: var(--text-secondary, #EFEB9A);
  overflow: auto;
  max-height: 50vh;
}
</style>
