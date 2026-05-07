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
      <li v-for="entry in ordered" :key="entry.path" class="lineage-cell">
        <button
          type="button"
          class="lineage-chip"
          :class="[`lineage-chip--${entry.status}`]"
          :title="`${entry.id} · ${entry.doneCount}/${entry.nodeCount} · ${entry.status} · ${formatMtime(entry.mtime)}`"
          @click="onClick(entry.id)"
        >
          <span class="lineage-chip__dot" aria-hidden="true"></span>
          <span class="lineage-chip__id">{{ entry.id }}</span>
          <span class="lineage-chip__progress">{{ entry.doneCount }}/{{ entry.nodeCount }}</span>
          <span class="lineage-chip__mtime">{{ formatMtime(entry.mtime) }}</span>
        </button>
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
  font-size: calc(11px * var(--font-scale, 1))px;
  font-style: italic;
}

.lineage-strip {
  list-style: none;
  margin: 0;
  padding: 8px 10px;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  overflow-x: hidden;
  overflow-y: auto;
  width: 100%;
  align-content: flex-start;
}

.lineage-cell {
  display: flex;
  flex: 0 0 auto;
}

.lineage-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 10px;
  background: oklch(0.22 0.05 280);
  border: 1px solid var(--chrome-25, #333);
  border-radius: 999px;
  color: var(--text-primary, #eee);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: calc(11px * var(--font-scale, 1));
  line-height: 1.4;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
}
.lineage-chip:hover {
  border-color: var(--foil, #d7a432);
  background: oklch(0.26 0.06 280);
  transform: translateY(-1px);
}

.lineage-chip__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  align-self: center;
  background: var(--text-meta, #888);
  box-shadow: 0 0 6px currentColor;
  color: var(--text-meta, #888);
}
.lineage-chip--complete .lineage-chip__dot { background: #7ec47e; color: #7ec47e; }
.lineage-chip--active   .lineage-chip__dot { background: var(--foil, #d7a432); color: var(--foil, #d7a432); }
.lineage-chip--empty    .lineage-chip__dot { background: #6cb6ff; color: #6cb6ff; }

.lineage-chip__id {
  font-weight: 600;
  color: var(--text-primary, #eee);
}
.lineage-chip__progress {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary, #ccc);
}
.lineage-chip__mtime {
  color: var(--text-meta, #888);
  text-shadow: var(--text-shadow-readable);
  font-size: calc(10px * var(--font-scale, 1));
}
</style>
