<!--
  LineagePane — horizontal strip of prior rounds for the selected repo.

  Lineage strip: CardLite per archived round, sourced from
  LineageEntry[] (id, path, mtime, nodeCount, doneCount, status).
  The current round is rendered separately by the parent (App.vue) as
  the emphasized MiniDagThumbnail driven by payload.head — we filter it
  out here via currentDagId to avoid duplicate cards for the same dagId.

  Click → emits `select` with the round's dagId; App.vue feeds that back
  into useDagPayload via the dag query param.
-->

<template>
  <div class="lineage-pane">
    <div v-if="ordered.length === 0" class="lineage-empty">no prior rounds</div>
    <ol v-else class="lineage-strip">
      <li
        v-for="entry in ordered"
        :key="entry.path"
        class="lineage-cell"
      >
        <button
          type="button"
          class="lineage-card-lite"
          :class="[`lineage-card-lite--${entry.status}`]"
          @click="onClick(entry.id)"
        >
          <span class="lineage-card-lite__id">{{ truncate(entry.id) }}</span>
          <span class="lineage-card-lite__progress">
            {{ entry.doneCount }}/{{ entry.nodeCount }}
          </span>
          <span class="lineage-card-lite__status">{{ entry.status }}</span>
        </button>
        <div class="lineage-meta">
          <span class="lineage-meta__id">{{ truncate(entry.id) }}</span>
          <span class="lineage-meta__mtime">{{ formatMtime(entry.mtime) }}</span>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LineageEntry } from "../services/roadmapReader";

const props = defineProps<{
  lineage: LineageEntry[];
  currentDagId?: string;
}>();

const emit = defineEmits<{ (e: "select", dagId: string): void }>();

// Server returns most-recent first (mtime DESC); the strip wants newest on
// the left to match natural scanning direction. The current dagId is
// filtered out — it's rendered separately as the emphasized MiniDagThumbnail
// by the parent (App.vue) — so this strip is purely archived rounds. Use
// slice() to preserve server order without mutating the prop array.
const ordered = computed(() =>
  props.lineage
    .filter((e): e is LineageEntry & { id: string } => e.id !== null)
    .filter((e) => e.id !== props.currentDagId)
    .slice(),
);

function onClick(dagId: string): void {
  emit("select", dagId);
}

function truncate(id: string | null): string {
  if (!id) return "";
  return id.length > 22 ? `${id.slice(0, 20)}…` : id;
}

function formatMtime(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}
</script>

<style scoped>
.lineage-pane {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  /* glass-surface from dag-theme.css supplies background + border */
  box-sizing: border-box;
}

.lineage-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-meta, #888);
  font-size: 11px;
  font-style: italic;
}

.lineage-strip {
  list-style: none;
  margin: 0;
  padding: 10px 12px;
  display: flex;
  flex-direction: row;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  width: 100%;
  align-items: flex-start;
}

.lineage-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 0 0 auto;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: transform 0.12s ease, border-color 0.12s ease;
}

.lineage-cell--current {
  border-color: var(--foil, #d7a432);
  transform: scale(1.04);
  background: var(--chrome-15, #1a1a1a);
}

.lineage-card-lite {
  width: 140px;
  height: 110px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px 10px;
  background: oklch(0.18 0.02 270);
  border: 1px solid var(--chrome-25, #333);
  border-radius: 6px;
  color: var(--text-secondary, #ccc);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
  text-align: left;
}
.lineage-card-lite:hover { border-color: var(--foil, #d7a432); }

.lineage-card-lite__id {
  color: var(--text-primary, #eee);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-card-lite__progress {
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  color: var(--text-primary, #eee);
}
.lineage-card-lite__status {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: calc(10px * var(--font-scale, 1));
  color: var(--text-meta, #888);
}
.lineage-card-lite--complete .lineage-card-lite__status { color: #7ec47e; }
.lineage-card-lite--active   .lineage-card-lite__status { color: var(--foil, #d7a432); }
.lineage-card-lite--empty    .lineage-card-lite__status { color: #6cb6ff; }

.lineage-meta {
  display: flex;
  flex-direction: column;
  font-size: 9px;
  color: var(--text-meta, #888);
  max-width: 140px;
}
.lineage-meta__id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-meta__mtime { color: var(--text-meta, #888); }
</style>
