<template>
  <section class="trail-timeline" :aria-label="`${visible.length} of ${events.length} trail events`">
    <header class="trail-controls">
      <div class="chip-row" role="group" aria-label="Filter by event kind">
        <button
          v-for="kind in availableKinds"
          :key="kind"
          type="button"
          class="chip"
          :class="{ 'chip--active': activeKinds.has(kind) }"
          @click="toggleKind(kind)"
        >
          {{ kind }}
        </button>
      </div>
      <div class="chip-row" role="group" aria-label="Filter by lane">
        <button
          v-for="lane in availableLanes"
          :key="lane"
          type="button"
          class="chip"
          :class="{ 'chip--active': activeLanes.has(lane) }"
          @click="toggleLane(lane)"
        >
          {{ lane }}
        </button>
      </div>
      <div class="range-row">
        <label class="range-label">
          from
          <input v-model="fromDate" type="date" class="range-input" />
        </label>
        <label class="range-label">
          to
          <input v-model="toDate" type="date" class="range-input" />
        </label>
        <button type="button" class="chip" @click="resetFilters">reset</button>
      </div>
    </header>

    <div ref="scrollEl" class="virt-viewport" @scroll="onScroll">
      <div class="virt-spacer" :style="{ height: `${totalHeight}px` }">
        <ol
          class="virt-window"
          :style="{ transform: `translateY(${windowOffset}px)` }"
        >
          <li
            v-for="event in windowSlice"
            :key="event.key"
            class="trail-row"
            :class="`trail-row--${event.kind}`"
            tabindex="0"
            @click="emitRow(event)"
            @keyup.enter="emitRow(event)"
          >
            <span class="trail-ts">{{ formatTs(event.ts) }}</span>
            <span class="trail-lane">{{ event.lane }}</span>
            <span class="trail-node">{{ event.nodeId ?? "—" }}</span>
            <span class="trail-kind">{{ event.kind }}</span>
            <span class="trail-summary">{{ event.summary }}</span>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// TrailTimeline — DUMB virtualized timeline of trail events across lanes.
// Props: typed events array. Events out: row-selected (event payload).
// No fetch / no setInterval / no data derivation beyond pure filter+slice.
//
// New for r1.5 (viewer-build-trail-timeline). NICER feature #4 — fleet's
// dashboard had no cross-lane timeline view; this is the differentiator.

import { computed, onMounted, onUnmounted, ref } from "vue";
import type { Ref } from "vue";

export interface TimelineEvent {
  /** stable key — typically `${ts}-${lane}-${nodeId}-${index}` */
  key: string;
  /** ISO timestamp */
  ts: string;
  /** lane name (host-repo aware — empty string = host) */
  lane: string;
  /** node id if applicable */
  nodeId?: string;
  /** event kind: advance | orient | trail-appended | head-changed | etc. */
  kind: string;
  /** short single-line summary (caller pre-formats) */
  summary: string;
}

interface Props {
  events: TimelineEvent[];
  rowHeight?: number;
  overscan?: number;
}

const props = withDefaults(defineProps<Props>(), { rowHeight: 28, overscan: 8 });
const emit = defineEmits<{ (event: "row-selected", payload: TimelineEvent): void }>();

const activeKinds: Ref<Set<string>> = ref<Set<string>>(new Set());
const activeLanes: Ref<Set<string>> = ref<Set<string>>(new Set());
const fromDate: Ref<string> = ref<string>("");
const toDate: Ref<string> = ref<string>("");

const scrollEl: Ref<HTMLElement | null> = ref<HTMLElement | null>(null);
const scrollTop: Ref<number> = ref<number>(0);
const viewportHeight: Ref<number> = ref<number>(480);

const availableKinds = computed<string[]>(() =>
  uniqueSorted(props.events.map((entry) => entry.kind)),
);
const availableLanes = computed<string[]>(() =>
  uniqueSorted(props.events.map((entry) => entry.lane)),
);

const visible = computed<TimelineEvent[]>(() => filterEvents(props.events));

const totalHeight = computed<number>(() => visible.value.length * props.rowHeight);

const windowOffset = computed<number>(() => firstVisibleIndex.value * props.rowHeight);

const firstVisibleIndex = computed<number>(() => {
  const raw = Math.floor(scrollTop.value / props.rowHeight) - props.overscan;
  return Math.max(0, raw);
});

const lastVisibleIndex = computed<number>(() => {
  const rows = Math.ceil(viewportHeight.value / props.rowHeight) + props.overscan * 2;
  return Math.min(visible.value.length, firstVisibleIndex.value + rows);
});

const windowSlice = computed<TimelineEvent[]>(() =>
  visible.value.slice(firstVisibleIndex.value, lastVisibleIndex.value),
);

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function filterEvents(all: TimelineEvent[]): TimelineEvent[] {
  return all.filter((entry) => matchesFilters(entry));
}

function matchesFilters(entry: TimelineEvent): boolean {
  if (activeKinds.value.size > 0 && !activeKinds.value.has(entry.kind)) return false;
  if (activeLanes.value.size > 0 && !activeLanes.value.has(entry.lane)) return false;
  if (fromDate.value !== "" && entry.ts.slice(0, 10) < fromDate.value) return false;
  if (toDate.value !== "" && entry.ts.slice(0, 10) > toDate.value) return false;
  return true;
}

function toggleKind(kind: string): void {
  toggleMember(activeKinds.value, kind);
  activeKinds.value = new Set(activeKinds.value);
}

function toggleLane(lane: string): void {
  toggleMember(activeLanes.value, lane);
  activeLanes.value = new Set(activeLanes.value);
}

function toggleMember(set: Set<string>, value: string): void {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

function resetFilters(): void {
  activeKinds.value = new Set<string>();
  activeLanes.value = new Set<string>();
  fromDate.value = "";
  toDate.value = "";
}

function onScroll(): void {
  const el = scrollEl.value;
  if (el === null) return;
  scrollTop.value = el.scrollTop;
  viewportHeight.value = el.clientHeight;
}

function formatTs(ts: string): string {
  if (ts.length < 19) return ts;
  return `${ts.slice(0, 10)} ${ts.slice(11, 19)}`;
}

function emitRow(event: TimelineEvent): void {
  emit("row-selected", event);
}

function captureViewportSize(): void {
  const el = scrollEl.value;
  if (el === null) return;
  viewportHeight.value = el.clientHeight;
}

onMounted(() => {
  captureViewportSize();
  window.addEventListener("resize", captureViewportSize);
});

onUnmounted(() => {
  window.removeEventListener("resize", captureViewportSize);
});
</script>

<style scoped>
.trail-timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--chrome-05, #0a0a0a);
  color: var(--text-primary, #eee);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
}
.trail-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--chrome-25, #333);
}
.chip-row, .range-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.chip {
  background: var(--chrome-10, #151515);
  border: 1px solid var(--chrome-30, #444);
  color: var(--text-primary, #eee);
  padding: 2px 8px;
  font: inherit;
  cursor: pointer;
  border-radius: 3px;
}
.chip--active {
  background: var(--accent-red, #d33);
  border-color: var(--accent-red, #d33);
  color: var(--chrome-05, #0a0a0a);
}
.range-label { display: inline-flex; gap: 4px; align-items: center; color: var(--text-meta, #888); }
.range-input {
  background: var(--chrome-10, #151515);
  border: 1px solid var(--chrome-30, #444);
  color: var(--text-primary, #eee);
  font: inherit;
  padding: 2px 4px;
}
.virt-viewport { flex: 1; overflow-y: auto; position: relative; }
.virt-spacer { position: relative; }
.virt-window { position: absolute; top: 0; left: 0; right: 0; margin: 0; padding: 0; list-style: none; }
.trail-row {
  display: grid;
  grid-template-columns: 160px 120px 1fr 120px 2fr;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--chrome-15, #1f1f1f);
  cursor: pointer;
  align-items: center;
}
.trail-row:hover, .trail-row:focus { background: var(--chrome-10, #151515); outline: none; }
.trail-ts { color: var(--text-meta, #888); }
.trail-lane { color: var(--accent-red, #d33); }
.trail-node { color: var(--text-primary, #eee); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.trail-kind { color: var(--text-meta, #888); text-transform: uppercase; letter-spacing: 0.06em; font-size: 10px; }
.trail-summary { color: var(--text-primary, #eee); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
