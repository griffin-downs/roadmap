<template>
  <section class="lane-rollup" :aria-label="`${lanes.length} lanes`">
    <article
      v-for="lane in lanes"
      :key="lane.lane"
      class="lane-card"
      :class="`lane-card--${lane.status}`"
      tabindex="0"
      @click="emitSelect(lane)"
      @keyup.enter="emitSelect(lane)"
    >
      <header class="lane-card-head">
        <h3 class="lane-name">{{ lane.lane }}</h3>
        <span class="lane-status" :data-status="lane.status">{{ lane.status }}</span>
      </header>

      <p v-if="lane.dagId" class="lane-dag" :title="lane.dagId">{{ lane.dagId }}</p>
      <p v-else class="lane-dag lane-dag--empty">no active DAG</p>

      <dl class="lane-stats">
        <div class="stat">
          <dt>batch</dt>
          <dd>{{ lane.currentBatch.length }}</dd>
        </div>
        <div class="stat stat--ready">
          <dt>ready</dt>
          <dd>{{ lane.readyCount }}</dd>
        </div>
        <div class="stat stat--blocked">
          <dt>blocked</dt>
          <dd>{{ lane.blockedCount }}</dd>
        </div>
        <div class="stat">
          <dt>last</dt>
          <dd>{{ formatLastTrail(lane.lastTrailTs) }}</dd>
        </div>
      </dl>

      <svg
        class="spark"
        :viewBox="`0 0 ${sparkWidth} ${sparkHeight}`"
        :aria-label="`7-day throughput for ${lane.lane}`"
        role="img"
      >
        <path
          v-if="lane.throughput7d.length > 0"
          :d="sparkPath(lane.throughput7d)"
          class="spark-line"
          fill="none"
        />
        <text v-else :x="sparkWidth / 2" :y="sparkHeight / 2" class="spark-empty">no events</text>
      </svg>

      <p v-if="lane.error" class="lane-error">{{ lane.error }}</p>
    </article>

    <p v-if="lanes.length === 0" class="lane-empty">no lanes registered in fleet.json</p>
  </section>
</template>

<script setup lang="ts">
// CrossLaneRollup — DUMB grid of per-lane health cards. Props: typed
// LaneHealth[] (computed upstream from fleet.json + per-repo head/trail).
// Events out: lane-selected. No fetch in component (§Dumb-components).
//
// New for r1.5 (viewer-build-cross-lane-rollup) — NICER feature #3.

import type { LaneHealth, ThroughputBucket } from "../services/laneRollupReader";

interface Props {
  lanes: LaneHealth[];
}

defineProps<Props>();
const emit = defineEmits<{ (event: "lane-selected", lane: LaneHealth): void }>();

const sparkWidth = 120;
const sparkHeight = 28;

function emitSelect(lane: LaneHealth): void {
  emit("lane-selected", lane);
}

function formatLastTrail(ts: string | null): string {
  if (ts === null) return "—";
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return ts;
  const ageMs = Date.now() - ms;
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)}h ago`;
  return `${Math.round(ageMs / 86_400_000)}d ago`;
}

function sparkPath(buckets: ThroughputBucket[]): string {
  if (buckets.length === 0) return "";
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const stepX = buckets.length > 1 ? sparkWidth / (buckets.length - 1) : 0;
  const points = buckets.map((bucket, index) => {
    const x = index * stepX;
    const y = sparkHeight - (bucket.count / maxCount) * (sparkHeight - 2) - 1;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `M ${points.join(" L ")}`;
}
</script>

<style scoped>
.lane-rollup {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  padding: 12px;
  background: var(--chrome-05, #0a0a0a);
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--text-primary, #eee);
}
.lane-card {
  background: var(--chrome-10, #151515);
  border: 1px solid var(--chrome-30, #444);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: border-color 120ms, background 120ms;
}
.lane-card:hover, .lane-card:focus { border-color: var(--accent-red, #d33); outline: none; }
.lane-card--active { border-left: 3px solid oklch(0.55 0.14 150); }
.lane-card--no-dag { opacity: 0.7; }
.lane-card--error { border-color: var(--accent-red, #d33); }
.lane-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.lane-name { margin: 0; font-size: 13px; font-weight: 600; }
.lane-status {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-meta, #888);
}
.lane-status[data-status="active"] { color: oklch(0.65 0.14 150); }
.lane-status[data-status="error"] { color: var(--accent-red, #d33); }
.lane-dag {
  margin: 0;
  font-size: 11px;
  color: var(--text-meta, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lane-dag--empty { font-style: italic; }
.lane-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin: 0;
}
.stat dt {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-meta, #888);
  margin: 0;
}
.stat dd { margin: 0; font-size: 14px; font-weight: 600; }
.stat--ready dd { color: oklch(0.65 0.14 150); }
.stat--blocked dd { color: var(--text-meta, #888); }
.spark { width: 100%; height: 28px; }
.spark-line {
  stroke: var(--accent-red, #d33);
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.spark-empty {
  fill: var(--text-meta, #888);
  font-size: 9px;
  text-anchor: middle;
  dominant-baseline: middle;
}
.lane-error {
  margin: 0;
  font-size: 10px;
  color: var(--accent-red, #d33);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lane-empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-meta, #888);
  padding: 24px;
}
</style>
