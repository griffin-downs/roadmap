// Client-side DAG reader — fetches /api/roadmap-dag and subscribes to the
// realtime bridge SSE stream so the graph repaints whenever head.json or
// completed.json changes on disk. Mirrors roadmapReader.ts in shape.
//
// Ported verbatim from fleet/dashboard at r1.5 (viewer-port-core-readers).
// Pure browser code · no host-repo path dependency.

import { ref, onMounted, onUnmounted, watch } from "vue";
import type { Ref } from "vue";

export interface ValidationCheck {
  rule: string;
  passed: boolean;
  evidence: string;
}

export interface RoadmapNode {
  id: string;
  desc: string;
  deps: string[];
  produces?: string[];
  consumes?: string[];
  idempotent?: boolean;
  planMode?: boolean;
  validate?: Array<{ type: string; command?: string; statement?: string; confidence?: number }>;
  expandedFrom?: string;
  mode?: string;
  children?: string[];
  lastCommitSha?: string;
  lastCommitSubject?: string;
  receiptPath?: string;
}

export interface HeadJson {
  id: string;
  desc: string;
  init: string;
  term: string;
  nodes: Record<string, RoadmapNode>;
}

export interface CompletedEntry {
  nodeId: string;
  dagId: string;
  completedAt: string;
  validationChecks: ValidationCheck[];
  gitSha: string | null;
  branch: string;
  source: string;
  note?: string;
}

export interface IntentEval {
  statement: string;
  confidence: number;
  reasoning: string;
}

export interface DagPayload {
  head: HeadJson;
  completed: string[];
  completedEntries: Record<string, CompletedEntry>;
  intentEvals: Record<string, IntentEval[]>;
  dagId: string;
}

const POLL_FALLBACK_MS = 30_000;

export interface DagSelection {
  /** repo name as listed in fleet.json (e.g. "ml-prague", "roadmap-engine"); empty = host itself */
  repo?: string;
  /** specific dag id; if omitted, server returns the repo's current head.json */
  dag?: string;
}

export function useDagPayload(selection?: Ref<DagSelection>): Ref<DagPayload | null> {
  const state = ref<DagPayload | null>(null);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  let eventSource: EventSource | null = null;

  function buildUrl(): string {
    const sel = selection?.value;
    const params = new URLSearchParams();
    if (sel?.repo) params.set("repo", sel.repo);
    if (sel?.dag) params.set("dag", sel.dag);
    const qs = params.toString();
    return qs ? `/api/roadmap-dag?${qs}` : "/api/roadmap-dag";
  }

  async function refetch(): Promise<void> {
    try {
      const response = await fetch(buildUrl());
      if (!response.ok) {
        error.value = `HTTP ${response.status}`;
        return;
      }
      const data = (await response.json()) as DagPayload | { error: string };
      if ("error" in data) {
        error.value = data.error;
        console.error("[dagReader] api error:", data.error);
        return;
      }
      error.value = null;
      state.value = data;
    } catch (e) {
      error.value = String(e);
      console.error("[dagReader] fetch failed:", e);
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
    if (selection) {
      watch(selection, () => void refetch(), { deep: true });
    }
  });

  onUnmounted(() => {
    if (timer !== null) clearInterval(timer);
    if (eventSource !== null) eventSource.close();
  });

  return state;
}
