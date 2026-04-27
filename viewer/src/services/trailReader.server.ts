// Trail reader (server) — reads the host repo's .roadmap/trail.jsonl and
// returns the last N events in reverse-chronological order. Each line is a
// JSON object with ts, cmd, note, repo, and optional detail fields.
// Ported from fleet/dashboard at r1.5 (viewer-port-core-readers). Per
// §Fail-hard: host repo via ROADMAP_HOST_REPO (default = process.cwd()).

import { readFileSync } from "node:fs";
import { join } from "node:path";

function trailPath(): string {
  const host = process.env.ROADMAP_HOST_REPO ?? process.cwd();
  return join(host, ".roadmap/trail.jsonl");
}

const DEFAULT_LIMIT = 200;

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

export async function readTrail(): Promise<TrailEvent[]> {
  let raw: string;
  try {
    raw = readFileSync(trailPath(), "utf-8");
  } catch {
    return [];
  }

  const lines = raw.trim().split("\n").filter(Boolean);
  const events: TrailEvent[] = [];

  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as TrailEvent);
    } catch {
      // skip malformed lines
    }
  }

  return events.reverse().slice(0, DEFAULT_LIMIT);
}
