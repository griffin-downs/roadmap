<!--
  LineagePane — horizontal strip of prior rounds for the selected repo.

  r4 / g-lineage-pane scope: the server's d-lineage-walk gives us
  LineageEntry[] (id, path, mtime, nodeCount, doneCount, status) but not
  the full HeadJson per archived round. Rather than fan out N extra fetches
  to render real MiniDagThumbnails for every entry, we ship a hybrid:
    · CardLite for archived rounds — uses LineageEntry data alone
    · MiniDagThumbnail for the CURRENT round when its HeadJson is in hand
      (the parent passes it as `currentHead`)
  This keeps r4 to one round-trip per repo selection while still proving
  the import + integration of g-mini-thumbnail.

  Click → emits `select` with the round's dagId; App.vue feeds that back
  into useDagPayload via the dag query param.
-->

<template>
  <div class="lineage-pane">
    <div v-if="lineage.length <= 1" class="lineage-empty">no prior rounds</div>
    <ol v-else class="lineage-strip">
      <li
        v-for="entry in ordered"
        :key="entry.path"
        class="lineage-cell"
        :class="{ 'lineage-cell--current': entry.id === currentDagId }"
      >
        <MiniDagThumbnail
          v-if="entry.id === currentDagId && currentHead"
          :head="currentHead"
          @click="onClick(entry.id)"
        />
        <button
          v-else
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
import MiniDagThumbnail from "./MiniDagThumbnail.vue";
import type { LineageEntry } from "../services/roadmapReader";
import type { HeadJson } from "../services/dagReader";

const props = defineProps<{
  lineage: LineageEntry[];
  currentDagId?: string;
  currentHead?: HeadJson | null;
}>();

const emit = defineEmits<{ (e: "select", dagId: string): void }>();

// Server returns most-recent first; gallery wants oldest left → current
// right (current is emphasized at the right edge). Reverse a shallow copy.
const ordered = computed(() =>
  props.lineage.filter((e): e is LineageEntry & { id: string } => e.id !== null)
    .slice()
    .reverse(),
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
  background: var(--chrome-05, #0a0a0a);
  border: 1px solid var(--chrome-25, #333);
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
  font-size: 9px;
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
