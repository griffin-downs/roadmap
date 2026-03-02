import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadTranscripts,
  loadRegentTranscripts,
  normalizeEvents,
  indexBySession,
  generateTranscriptIndex,
} from '../src/lib/mining/transcript-aggregator';

describe('transcript-aggregator', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-test-'));
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('should parse trail.jsonl entries', async () => {
    const trailPath = path.join(tmpDir, 'trail.jsonl');
    const regentDir = path.join(tmpDir, 'empty-regent');
    fs.mkdirSync(regentDir, { recursive: true });

    const trailEntry = {
      ts: '2026-03-02T10:28:52.586Z',
      cmd: 'orient',
      note: 'test-session',
      repo: 'roadmap',
      position: ['test-node'],
      level: 1,
      dagId: 'test-dag',
      detail: { done: 5, remaining: 0, complete: false },
    };

    fs.writeFileSync(trailPath, JSON.stringify(trailEntry) + '\n');

    const events = await loadTranscripts(trailPath, regentDir);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('orient');
    expect(events[0].sessionId).toBe('test-dag');
    expect(events[0].nodeId).toBe('test-node');
    expect(events[0].message).toBe('test-session');
    expect(events[0].source).toBe('trail');
  });

  it('should parse regent transcript entries', async () => {
    const regentDir = path.join(tmpDir, 'regent-transcripts');
    const sessionId = 'test-session-123';
    const sessionDir = path.join(regentDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const transcript = `# Session
**Session:** \`${sessionId}\`

---

### User [10:28:52]
What is 2+2?

### Claude [10:28:55]
2+2 equals 4.
`;

    fs.writeFileSync(path.join(sessionDir, 'transcript.md'), transcript);

    const events = await loadRegentTranscripts(regentDir);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.sessionId === sessionId)).toBe(true);
    expect(events.some(e => e.source === 'regent')).toBe(true);
  });

  it('should handle malformed JSON gracefully', async () => {
    const trailPath = path.join(tmpDir, 'bad-trail.jsonl');
    const regentDir = path.join(tmpDir, 'empty-regent-2');
    fs.mkdirSync(regentDir, { recursive: true });

    fs.writeFileSync(
      trailPath,
      '{"ts":"2026-03-02T10:28:52.586Z","cmd":"orient"}\n' +
        'invalid json line\n' +
        '{"ts":"2026-03-02T10:30:00.000Z","cmd":"complete"}\n'
    );

    const events = await loadTranscripts(trailPath, regentDir);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('should deduplicate events', async () => {
    const events = [
      {
        timestamp: '2026-03-02T10:28:52.586Z',
        sessionId: 'session-1',
        eventType: 'orient',
        status: 'complete',
        message: 'test-1',
      },
      {
        timestamp: '2026-03-02T10:28:52.586Z',
        sessionId: 'session-1',
        eventType: 'orient',
        status: 'complete',
        message: 'test-1',
      },
      {
        timestamp: '2026-03-02T10:30:00.000Z',
        sessionId: 'session-2',
        eventType: 'complete',
        status: 'complete',
        message: 'test-2',
      },
    ];

    const normalized = normalizeEvents(events);
    expect(normalized).toHaveLength(2);
  });

  it('should index events by session', async () => {
    const events = [
      {
        timestamp: '2026-03-02T10:28:52.586Z',
        sessionId: 'session-1',
        eventType: 'orient',
        status: 'complete',
      },
      {
        timestamp: '2026-03-02T10:30:00.000Z',
        sessionId: 'session-2',
        eventType: 'complete',
        status: 'complete',
      },
      {
        timestamp: '2026-03-02T10:31:00.000Z',
        sessionId: 'session-1',
        eventType: 'advance',
        status: 'complete',
      },
    ];

    const indexed = indexBySession(events);
    expect(indexed.size).toBe(2);
    expect(indexed.get('session-1')).toHaveLength(2);
    expect(indexed.get('session-2')).toHaveLength(1);
  });

  it('should sort events by timestamp within sessions', async () => {
    const events = [
      {
        timestamp: '2026-03-02T10:31:00.000Z',
        sessionId: 'session-1',
        eventType: 'advance',
        status: 'complete',
      },
      {
        timestamp: '2026-03-02T10:28:52.586Z',
        sessionId: 'session-1',
        eventType: 'orient',
        status: 'complete',
      },
    ];

    const indexed = indexBySession(events);
    const session1Events = indexed.get('session-1')!;
    expect(session1Events[0].timestamp).toBe('2026-03-02T10:28:52.586Z');
    expect(session1Events[1].timestamp).toBe('2026-03-02T10:31:00.000Z');
  });

  it('should generate transcript-index.jsonl with trail + regent data', async () => {
    const trailPath = path.join(tmpDir, 'trail-gen.jsonl');
    const regentDir = path.join(tmpDir, 'regent-gen');
    const indexPath = path.join(tmpDir, 'transcript-index.jsonl');

    // Create trail entry
    fs.writeFileSync(
      trailPath,
      JSON.stringify({
        ts: '2026-03-02T10:28:52.586Z',
        cmd: 'orient',
        note: 'test',
        repo: 'roadmap',
        dagId: 'test-dag',
      }) + '\n'
    );

    // Create regent transcript
    const sessionId = 'regent-session-456';
    const sessionDir = path.join(regentDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'transcript.md'),
      `### User [10:30:00]\nHello\n\n### Claude [10:30:05]\nHi there\n`
    );

    await generateTranscriptIndex(trailPath, indexPath, regentDir);

    expect(fs.existsSync(indexPath)).toBe(true);
    const indexData = fs.readFileSync(indexPath, 'utf-8');
    const lines = indexData.split('\n').filter(line => line.trim());
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Verify both sources present
    const events = lines.map(l => JSON.parse(l));
    expect(events.some(e => e.source === 'trail')).toBe(true);
    expect(events.some(e => e.source === 'regent')).toBe(true);
  });
});
