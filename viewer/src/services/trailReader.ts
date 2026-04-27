// Client-side trail reader — fetches /api/roadmap-trail for the event stream.
// Ported from fleet/dashboard at r1.5 (viewer-port-core-readers).

import { ref, onMounted } from "vue";
import type { Ref } from "vue";

export interface TrailEvent {
  ts: string;
  cmd: string;
  note: string;
  repo?: string;
  detail?: {
    completed?: string;
    nodeId?: string;
    checks?: number;
    passed?: boolean;
  };
  position?: string[];
  level?: number;
  type?: string;
}

export function useTrailEvents(): Ref<TrailEvent[]> {
  const events = ref<TrailEvent[]>([]);

  async function refetch(): Promise<void> {
    try {
      const response = await fetch("/api/roadmap-trail");
      if (!response.ok) return;
      events.value = (await response.json()) as TrailEvent[];
    } catch {
      // retain last known state
    }
  }

  onMounted(() => void refetch());

  return events;
}
