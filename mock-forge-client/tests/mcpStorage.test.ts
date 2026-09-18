import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { listSessions, getSession } from '../mcp/src/storage';

describe('mcp storage', () => {
  it('lists and reads sessions from mockforge data dir', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mockforge-mcp-'));
    const sessionId = 'session-1';
    const sessionsDir = join(dataDir, 'sessions', sessionId);
    mkdirSync(sessionsDir, { recursive: true });

    const meta = {
      id: sessionId,
      name: 'Checkout iOS',
      environmentId: 'env-1',
      environmentName: 'staging',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'completed',
      requestCount: 1,
      consumerIds: [],
      platforms: ['ios'],
      primaryPlatform: 'ios',
      flowName: 'checkout',
    };

    writeFileSync(join(dataDir, 'sessions', 'index.json'), JSON.stringify([meta]), 'utf-8');
    writeFileSync(join(sessionsDir, 'meta.json'), JSON.stringify(meta), 'utf-8');
    writeFileSync(
      join(sessionsDir, 'records.jsonl'),
      `${JSON.stringify({
        id: 'req-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        method: 'GET',
        path: '/api/items',
        headers: {},
        body: '',
      })}\n`,
      'utf-8',
    );

    const previous = process.env.MOCKFORGE_DATA_DIR;
    process.env.MOCKFORGE_DATA_DIR = dataDir;

    try {
      const sessions = listSessions({ platform: 'ios', flowName: 'checkout' });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBe(sessionId);

      const session = getSession(sessionId);
      expect(session?.records).toHaveLength(1);
      expect(session?.records?.[0]?.path).toBe('/api/items');
    } finally {
      process.env.MOCKFORGE_DATA_DIR = previous;
    }
  });
});
