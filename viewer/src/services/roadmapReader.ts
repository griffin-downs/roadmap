// Client-side roadmap reader — multi-lane summary for the host repo's
// fleet.json registry. Pure browser code · ported from fleet/dashboard at
// r1.5 (viewer-port-core-readers).

import { ref, onMounted, onUnmounted } from "vue";
import type { Ref } from "vue";

export interface LineageEntry {
  id: string | null;
  path: string;
  mtime: number;
  nodeCount: number;
  doneCount: number;
  status: "active" | "complete" | "empty";
}

export interface RepoRoadmap {
  repo: string;
  path: string;
  status: "active" | "no-dag" | "error";
  dagId?: string;
  currentBatch?: string[];
  level?: number;
  remaining?: number;
  completionPct?: number;
  error?: string;
  lineage?: LineageEntry[];
}

const POLL_FALLBACK_MS = 30_000;

export function useRoadmapState(): Ref<RepoRoadmap[]> {
  const state = ref<RepoRoadmap[]>([]);
  let timer: ReturnType<typeof setInterval> | null = null;
  let eventSource: EventSource | null = null;

  async function refetch(): Promise<void> {
    try {
      const response = await fetch("/api/roadmap");
      if (!response.ok) return;
      state.value = (await response.json()) as RepoRoadmap[];
    } catch {
      // network error — retain last known state
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

  return state;
}
