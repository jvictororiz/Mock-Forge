import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  findSessionPairs,
  resolveSessionPair,
  searchRoutes,
  searchSessionRequests,
} from '../mcp/src/queries';
import { handleToolCall } from '../mcp/src/tools';

function setupDataDir(): string {
  const dataDir = mkdtempSync(join(tmpdir(), 'mockforge-mcp-queries-'));
  const iosId = 'ios-session';
  const androidId = 'android-session';
  const envId = 'env-1';

  const iosMeta = {
    id: iosId,
    name: 'Checkout iOS',
    environmentId: envId,
    environmentName: 'staging',
    createdAt: '2026-01-02T00:00:00.000Z',
    status: 'completed',
    requestCount: 2,
    consumerIds: [],
    platforms: ['ios'],
    primaryPlatform: 'ios',
    flowName: 'checkout',
    comparisonGroupId: 'group-checkout',
  };

  const androidMeta = {
    id: androidId,
    name: 'Checkout Android',
    environmentId: envId,
    environmentName: 'staging',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'completed',
    requestCount: 2,
    consumerIds: [],
    platforms: ['android'],
    primaryPlatform: 'android',
    flowName: 'checkout',
    comparisonGroupId: 'group-checkout',
  };

  mkdirSync(join(dataDir, 'sessions', iosId), { recursive: true });
  mkdirSync(join(dataDir, 'sessions', androidId), { recursive: true });
  mkdirSync(join(dataDir, 'environments'), { recursive: true });

  writeFileSync(join(dataDir, 'sessions', 'index.json'), JSON.stringify([iosMeta, androidMeta]), 'utf-8');
  writeFileSync(join(dataDir, 'sessions', iosId, 'meta.json'), JSON.stringify(iosMeta), 'utf-8');
  writeFileSync(join(dataDir, 'sessions', androidId, 'meta.json'), JSON.stringify(androidMeta), 'utf-8');

  const iosRecords = [
    {
      id: 'ios-1',
      timestamp: '2026-01-02T00:00:00.000Z',
      method: 'POST',
      path: '/api/checkout',
      headers: {},
      body: '',
      responseStatus: 200,
      responseBody: '{"ok":true}',
    },
    {
      id: 'ios-2',
      timestamp: '2026-01-02T00:00:01.000Z',
      method: 'GET',
      path: '/api/cart',
      headers: {},
      body: '',
      responseStatus: 500,
      responseBody: '{"error":"server"}',
    },
  ];

  const androidRecords = [
    {
      id: 'android-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      method: 'POST',
      path: '/api/checkout',
      headers: {},
      body: '',
      responseStatus: 422,
      responseBody: '{"error":"invalid_payment"}',
    },
    {
      id: 'android-2',
      timestamp: '2026-01-01T00:00:01.000Z',
      method: 'GET',
      path: '/api/cart',
      headers: {},
      body: '',
      responseStatus: 200,
      responseBody: '{"items":[]}',
    },
  ];

  writeFileSync(
    join(dataDir, 'sessions', iosId, 'records.jsonl'),
    `${iosRecords.map((record) => JSON.stringify(record)).join('\n')}\n`,
    'utf-8',
  );
  writeFileSync(
    join(dataDir, 'sessions', androidId, 'records.jsonl'),
    `${androidRecords.map((record) => JSON.stringify(record)).join('\n')}\n`,
    'utf-8',
  );

  writeFileSync(
    join(dataDir, 'environments', `${envId}.json`),
    JSON.stringify({
      id: envId,
      name: 'staging',
      port: 1080,
      routes: [
        {
          id: 'route-1',
          name: 'Checkout mock',
          method: 'POST',
          path: '/api/checkout',
          action: 'mock',
          enabled: true,
          responses: [{ id: 'resp-1', name: 'OK', statusCode: 200, headers: {}, body: '{}' }],
          defaultResponseId: 'resp-1',
        },
        {
          id: 'route-2',
          name: 'Disabled cart',
          method: 'GET',
          path: '/api/cart',
          action: 'mock',
          enabled: false,
          responses: [{ id: 'resp-2', name: 'OK', statusCode: 200, headers: {}, body: '{}' }],
          defaultResponseId: 'resp-2',
        },
      ],
    }),
    'utf-8',
  );

  return dataDir;
}

describe('mcp queries', () => {
  it('searches session requests by path and errors', () => {
    const dataDir = setupDataDir();
    const previous = process.env.MOCKFORGE_DATA_DIR;
    process.env.MOCKFORGE_DATA_DIR = dataDir;

    try {
      const checkout = searchSessionRequests({
        sessionId: 'ios-session',
        path: '/api/checkout',
      });
      expect(checkout).toHaveLength(1);
      expect(checkout[0]?.responseStatus).toBe(200);

      const errors = searchSessionRequests({
        sessionId: 'ios-session',
        errorsOnly: true,
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]?.path).toBe('/api/cart');
    } finally {
      process.env.MOCKFORGE_DATA_DIR = previous;
    }
  });

  it('searches routes across environments', () => {
    const dataDir = setupDataDir();
    const previous = process.env.MOCKFORGE_DATA_DIR;
    process.env.MOCKFORGE_DATA_DIR = dataDir;

    try {
      const all = searchRoutes({ path: '/api/checkout', method: 'POST' });
      expect(all).toHaveLength(1);
      expect(all[0]?.route.enabled).toBe(true);

      const enabledOnly = searchRoutes({ path: '/api/cart', enabledOnly: true });
      expect(enabledOnly).toHaveLength(0);
    } finally {
      process.env.MOCKFORGE_DATA_DIR = previous;
    }
  });

  it('finds session pairs and compares by flow', async () => {
    const dataDir = setupDataDir();
    const previous = process.env.MOCKFORGE_DATA_DIR;
    process.env.MOCKFORGE_DATA_DIR = dataDir;

    try {
      const pairs = findSessionPairs({ flowName: 'checkout' });
      expect(pairs).toHaveLength(1);
      expect(pairs[0]?.matchedBy).toBe('comparison_group');

      const pair = resolveSessionPair({ flowName: 'checkout' });
      expect(pair.sessionA.id).toBe('ios-session');
      expect(pair.sessionB.id).toBe('android-session');

      const comparison = await handleToolCall('compare_by_flow', {
        flowName: 'checkout',
        ignoreTiming: true,
      }) as {
        divergences: Array<{ endpoint: string; severity: string }>;
        summary: { statusCodeDiffs: number };
      };

      expect(comparison.summary.statusCodeDiffs).toBeGreaterThan(0);
      expect(comparison.divergences.some((item) => item.endpoint.includes('/api/checkout'))).toBe(true);
    } finally {
      process.env.MOCKFORGE_DATA_DIR = previous;
    }
  });
});
