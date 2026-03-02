import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadTranscripts,
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

    const events = await loadTranscripts(trailPath, '/nonexistent/hooks.log');
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('orient');
    expect(events[0].sessionId).toBe('test-dag');
    expect(events[0].nodeId).toBe('test-node');
    expect(events[0].message).toBe('test-session');
  });

  it('should parse hooks.log entries', async () => {
    const hooksPath = path.join(tmpDir, 'hooks.log');
    const hookEntry = '[2026-03-02 10:28:52] SKIP_NODE_CHECK: test message';

    fs.writeFileSync(hooksPath, hookEntry + '\n');

    const events = await loadTranscripts('/nonexistent/trail.jsonl', hooksPath);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('SKIP_NODE_CHECK');
    expect(events[0].message).toBe('test message');
    expect(events[0].status).toBe('recorded');
  });

  it('should handle malformed JSON gracefully', async () => {
    const trailPath = path.join(tmpDir, 'bad-trail.jsonl');
    fs.writeFileSync(
      trailPath,
      '{"ts":"2026-03-02T10:28:52.586Z","cmd":"orient"}\n' +
        'invalid json line\n' +
        '{"ts":"2026-03-02T10:30:00.000Z","cmd":"complete"}\n'
    );

    const events = await loadTranscripts(trailPath, '/nonexistent/hooks.log');
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

  it('should generate transcript-index.jsonl', async () => {
    const trailPath = path.join(tmpDir, 'trail-gen.jsonl');
    const hooksPath = path.join(tmpDir, 'hooks-gen.log');
    const indexPath = path.join(tmpDir, 'transcript-index.jsonl');

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

    fs.writeFileSync(hooksPath, '[2026-03-02 10:30:00] SKIP_NODE_CHECK: test\n');

    await generateTranscriptIndex(trailPath, hooksPath, indexPath);

    expect(fs.existsSync(indexPath)).toBe(true);
    const indexData = fs.readFileSync(indexPath, 'utf-8');
    const lines = indexData.split('\n').filter(line => line.trim());
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});
