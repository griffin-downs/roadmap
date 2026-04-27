// laneRollupReader — client-side reader for the multi-lane health rollup.
// Reads fleet.json registry + per-lane health summaries via /api/lane-rollup
// and subscribes to the realtime bridge SSE stream for repaints. Pure
// browser code · no fleet hard-codes · host-repo resolves server-side from
// ROADMAP_HOST_REPO.
//
// New for r1.5 (viewer-build-cross-lane-rollup). Headline differentiator:
// fleet's dashboard is single-repo-centric; the multi-lane rollup card view
// is what makes this viewer "strictly nicer."

import { ref, onMounted, onUnmounted } from "vue";
import type { Ref } from "vue";

/** One trail throughput bucket — used for the 7-day sparkline. */
export interface ThroughputBucket {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** advance-event count for that day */
  count: number;
}

/** Per-lane health card payload. */
export interface LaneHealth {
  /** registry name from fleet.json */
  lane: string;
  /** absolute path */
  path: string;
  /** current head.json id, if a DAG is active */
  dagId?: string;
  /** ids in the current batch */
  currentBatch: string[];
  /** ready-frontier count (deps satisfied · not yet completed) */
  readyCount: number;
  /** blocked count (in head.json · not ready · not done) */
  blockedCount: number;
  /** ISO timestamp of the last trail entry, or null if no events */
  lastTrailTs: string | null;
  /** rolling 7-day daily throughput buckets (oldest → newest) */
  throughput7d: ThroughputBucket[];
  /** "active" if head.json present · "no-dag" if absent · "error" otherwise */
  status: "active" | "no-dag" | "error";
  /** error string if status === "error" */
  error?: string;
}

const POLL_FALLBACK_MS = 30_000;

export function useLaneRollup(): Ref<LaneHealth[]> {
  const lanes = ref<LaneHealth[]>([]);
  let timer: ReturnType<typeof setInterval> | null = null;
  let eventSource: EventSource | null = null;

  async function refetch(): Promise<void> {
    try {
      const response = await fetch("/api/lane-rollup");
      if (!response.ok) return;
      const parsed = (await response.json()) as LaneHealth[] | { error: string };
      if (Array.isArray(parsed)) lanes.value = parsed;
    } catch {
      // retain last known state — surface via consumer error UI if needed
    }
  }

  function openEventStream(): void {
    try {
      const source = new EventSource("/api/events");
      source.addEventListener("roadmap", () => void refetch());
      eventSource = source;
    } catch {
      // EventSource unavailable — poll fallback covers us
    }
  }

  onMounted(() => {
    void refetch();
    openEventStream();
    timer = setInterval(() => void refetch(), POLL_FALLBACK_MS);
  });

  onUnmounted(() => {
    if (timer !== null) clearInterval(timer);
    if (eventSource !== null) eventSource.close();
  });

  return lanes;
}
