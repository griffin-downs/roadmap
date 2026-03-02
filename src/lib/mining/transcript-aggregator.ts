// @module mining
// @exports loadTranscripts, normalizeEvents, indexBySession
// @types TranscriptEvent, NormalizedEvent

import * as fs from 'fs';
import * as path from 'path';

export interface TranscriptEvent {
  timestamp: string;
  sessionId: string;
  agentId?: string;
  nodeId?: string;
  eventType: string;
  status: string;
  duration?: number;
  message?: string;
}

interface TrailEntry {
  ts: string;
  cmd: string;
  note: string;
  repo: string;
  position?: string[];
  level?: number;
  dagId?: string;
  detail?: Record<string, unknown>;
}

interface HooksEntry {
  timestamp: string;
  eventType: string;
  message: string;
}

export async function loadTranscripts(
  trailPath: string,
  hooksPath: string
): Promise<TranscriptEvent[]> {
  const events: TranscriptEvent[] = [];

  // Load trail.jsonl
  try {
    if (fs.existsSync(trailPath)) {
      const trailData = fs.readFileSync(trailPath, 'utf-8');
      const lines = trailData.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as TrailEntry;
          events.push(normalizeTrailEntry(entry));
        } catch (e) {
          console.warn(`Malformed trail entry: ${line.substring(0, 100)}`);
        }
      }
    }
  } catch (e) {
    console.warn(`Failed to load trail.jsonl: ${e}`);
  }

  // Load hooks.log
  try {
    if (fs.existsSync(hooksPath)) {
      const hooksData = fs.readFileSync(hooksPath, 'utf-8');
      const lines = hooksData.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const entry = parseHooksEntry(line);
          if (entry) {
            events.push(normalizeHooksEntry(entry));
          }
        } catch (e) {
          console.warn(`Malformed hooks entry: ${line.substring(0, 100)}`);
        }
      }
    }
  } catch (e) {
    console.warn(`Failed to load hooks.log: ${e}`);
  }

  return events;
}

function normalizeTrailEntry(entry: TrailEntry): TranscriptEvent {
  return {
    timestamp: entry.ts,
    sessionId: entry.dagId || 'unknown',
    agentId: undefined,
    nodeId: entry.position?.[0],
    eventType: entry.cmd,
    status: entry.detail?.complete ? 'complete' : 'in-progress',
    duration: undefined,
    message: entry.note,
  };
}

function parseHooksEntry(line: string): HooksEntry | null {
  // Format: [YYYY-MM-DD HH:MM:SS] EVENT_TYPE: message
  const match = line.match(
    /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s+([A-Z_]+):\s*(.*)$/
  );
  if (!match) {
    return null;
  }

  const [, dateTime, eventType, message] = match;
  const isoTimestamp = new Date(dateTime).toISOString();

  return {
    timestamp: isoTimestamp,
    eventType,
    message,
  };
}

function normalizeHooksEntry(entry: HooksEntry): TranscriptEvent {
  return {
    timestamp: entry.timestamp,
    sessionId: 'hooks-session',
    agentId: undefined,
    nodeId: undefined,
    eventType: entry.eventType,
    status: 'recorded',
    duration: undefined,
    message: entry.message,
  };
}

export function normalizeEvents(events: TranscriptEvent[]): TranscriptEvent[] {
  // Deduplicate events based on timestamp + eventType + message
  const seen = new Set<string>();
  const normalized: TranscriptEvent[] = [];

  for (const event of events) {
    const key = `${event.timestamp}|${event.eventType}|${event.message || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(event);
    }
  }

  return normalized;
}

export function indexBySession(
  events: TranscriptEvent[]
): Map<string, TranscriptEvent[]> {
  const index = new Map<string, TranscriptEvent[]>();

  // Sort by timestamp first
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const event of sorted) {
    const sessionId = event.sessionId || 'unknown';
    if (!index.has(sessionId)) {
      index.set(sessionId, []);
    }
    index.get(sessionId)!.push(event);
  }

  return index;
}

export async function generateTranscriptIndex(
  trailPath: string,
  hooksPath: string,
  outputPath: string
): Promise<void> {
  const events = await loadTranscripts(trailPath, hooksPath);
  const normalized = normalizeEvents(events);
  const indexed = indexBySession(normalized);

  // Write indexed events to JSONL file
  const lines: string[] = [];
  for (const [sessionId, sessionEvents] of indexed) {
    for (const event of sessionEvents) {
      lines.push(JSON.stringify(event));
    }
  }

  fs.writeFileSync(outputPath, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
}
