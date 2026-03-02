// @module mining
// @exports loadTranscripts, normalizeEvents, indexBySession, loadRegentTranscripts
// @types TranscriptEvent, RegentTranscriptEntry

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TranscriptEvent {
  timestamp: string;
  sessionId: string;
  agentId?: string;
  nodeId?: string;
  eventType: string;
  status: string;
  duration?: number;
  message?: string;
  source?: 'trail' | 'regent';
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

export interface RegentTranscriptEntry {
  sessionId: string;
  timestamp: string;
  actor: string;
  message: string;
}

export async function loadRegentTranscripts(
  regentTranscriptDir?: string
): Promise<TranscriptEvent[]> {
  const events: TranscriptEvent[] = [];

  // Use default if not provided
  const transcriptDir =
    regentTranscriptDir ||
    path.join(os.homedir(), '.claude', 'transcripts');

  if (!fs.existsSync(transcriptDir)) {
    return events;
  }

  const sessionDirs = fs.readdirSync(transcriptDir);

  for (const sessionDir of sessionDirs) {
    const transcriptPath = path.join(
      transcriptDir,
      sessionDir,
      'transcript.md'
    );
    if (!fs.existsSync(transcriptPath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const entries = parseRegentTranscript(sessionDir, content);
      events.push(...entries);
    } catch (e) {
      console.warn(
        `Failed to parse regent transcript ${sessionDir}: ${e}`
      );
    }
  }

  return events;
}

function parseRegentTranscript(
  sessionId: string,
  content: string
): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];

  // Parse markdown format: ### Actor [HH:MM:SS]\nMessage
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Match lines like: ### User [21:24:02] or ### Claude [21:24:05]
    const match = line.match(/^###\s+(\w+)\s+\[(\d{2}):(\d{2}):(\d{2})\](.*)$/);
    if (match) {
      const [, actor, hours, minutes, seconds, restOfLine] = match;
      const timestamp = `${hours}:${minutes}:${seconds}`;

      // Collect message lines until next ### or end
      let message = restOfLine.trim();
      i++;
      while (i < lines.length && !lines[i].match(/^###\s+/)) {
        const msgLine = lines[i].trim();
        if (msgLine) {
          message += '\n' + msgLine;
        }
        i++;
      }

      events.push({
        timestamp,
        sessionId,
        agentId: actor.toLowerCase(),
        eventType: 'message',
        status: 'recorded',
        message: message.substring(0, 200), // Truncate to first 200 chars
        source: 'regent',
      });
    } else {
      i++;
    }
  }

  return events;
}

export async function loadTranscripts(
  trailPath: string,
  regentTranscriptDir?: string
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

  // Load regent transcripts
  try {
    const regentEvents = await loadRegentTranscripts(regentTranscriptDir);
    events.push(...regentEvents);
  } catch (e) {
    console.warn(`Failed to load regent transcripts: ${e}`);
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
    source: 'trail',
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
  outputPath: string,
  regentTranscriptDir?: string
): Promise<void> {
  const events = await loadTranscripts(trailPath, regentTranscriptDir);
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
