import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyEnvironmentMutation } from '../shared/environmentMutations';
import { isStaleEnvironmentSave } from '../shared/mcpBridge';
import type { CapturedRequest, Environment } from '../shared/types';
import { commitMutationToDisk } from '../mcp/src/commit';
import { buildWriteMutation } from '../mcp/src/writeTools';

const previousDataDir = process.env.MOCKFORGE_DATA_DIR;

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.MOCKFORGE_DATA_DIR;
  else process.env.MOCKFORGE_DATA_DIR = previousDataDir;
});

function environment(overrides: Partial<Environment> = {}): Environment {
  return {
    id: 'env-1',
    name: 'Staging',
    port: 1080,
    routes: [],
    revision: 2,
    ...overrides,
  };
}

describe('environment mutations', () => {
  it('creates a response mock and selects it for the editor', () => {
    const result = applyEnvironmentMutation([environment()], {
      op: 'create_route',
      environmentId: 'env-1',
      route: {
        method: 'POST',
        path: 'api/orders',
        statusCode: 201,
        body: '{"id":"1"}',
        headers: { 'Content-Type': 'application/json' },
      },
    }, 'env-1');

    const route = result.route;
    expect(route?.method).toBe('POST');
    expect(route?.path).toBe('/api/orders');
    expect(route?.mockResponseEnabled).toBe(true);
    expect(route?.responses?.[0]?.statusCode).toBe(201);
    expect(result.openEditor).toBe(true);
    expect(result.selectedRouteId).toBe(route?.id);
    expect(result.switchCurrent).toBe(true);
  });

  it('updates, disables and deletes a route', () => {
    const created = applyEnvironmentMutation([environment()], {
      op: 'create_route',
      environmentId: 'env-1',
      route: { method: 'GET', path: '/api/items', body: '{"ok":true}' },
    }, 'env-1');
    const routeId = created.route?.id ?? '';

    const updated = applyEnvironmentMutation(created.environments, {
      op: 'update_route',
      environmentId: 'env-1',
      routeId,
      patch: { statusCode: 404, name: 'Missing item' },
    }, 'env-1');
    expect(updated.route?.name).toBe('Missing item');
    expect(updated.route?.responses?.[0]?.statusCode).toBe(404);

    const disabled = applyEnvironmentMutation(updated.environments, {
      op: 'set_route_mocks',
      environmentId: 'env-1',
      routeId,
      enabled: false,
    }, 'env-1');
    expect(disabled.route?.enabled).toBe(false);
    expect(disabled.route?.mockResponseEnabled).toBe(false);

    const enabled = applyEnvironmentMutation(disabled.environments, {
      op: 'set_route_mocks',
      environmentId: 'env-1',
      routeId,
      enabled: true,
    }, 'env-1');
    expect(enabled.route?.enabled).toBe(true);
    expect(enabled.route?.mockResponseEnabled).toBe(true);

    const removed = applyEnvironmentMutation(enabled.environments, {
      op: 'delete_route',
      environmentId: 'env-1',
      routeId,
    }, 'env-1');
    expect(removed.environments[0]?.routes).toEqual([]);
    expect(removed.selectedRouteId).toBeNull();
  });

  it('builds a full mock from a captured request', () => {
    const captured: CapturedRequest = {
      id: 'req-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      method: 'POST',
      path: '/api/orders',
      headers: { 'Content-Type': 'application/json' },
      body: '{"sku":"a"}',
      responseStatus: 201,
      responseHeaders: { 'Content-Type': 'application/json' },
      responseBody: '{"id":"order-1"}',
    };

    const result = applyEnvironmentMutation([environment()], {
      op: 'create_mock_from_request',
      environmentId: 'env-1',
      captured,
      kind: 'full',
    }, null);

    expect(result.route?.path).toBe('/api/orders');
    expect(result.route?.mockResponseEnabled).toBe(true);
    expect(result.route?.mockRequestEnabled).toBe(true);
    expect(result.editorTab).toBe('response');
    expect(result.route?.responses?.[0]?.statusCode).toBe(201);
  });

  it('refuses to delete the last environment', () => {
    expect(() => applyEnvironmentMutation([environment()], {
      op: 'delete_environment',
      environmentId: 'env-1',
    }, 'env-1')).toThrow(/last environment/);
  });

  it('detects an editor save that is older than the MCP write', () => {
    const disk = environment({ revision: 4 });
    expect(isStaleEnvironmentSave(environment({ revision: 3 }), disk)).toBe(true);
    expect(isStaleEnvironmentSave(environment({ revision: 4 }), disk)).toBe(false);
  });
});

describe('mcp disk commit', () => {
  it('writes a route into the environment file', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mockforge-mcp-write-'));
    process.env.MOCKFORGE_DATA_DIR = dataDir;

    const created = commitMutationToDisk({
      op: 'create_environment',
      name: 'Checkout',
      port: 1090,
    });
    const environmentId = created.environment?.id ?? '';

    const saved = commitMutationToDisk({
      op: 'create_route',
      environmentId,
      route: { method: 'GET', path: '/api/checkout', statusCode: 200, body: '{"ready":true}' },
    });

    expect(saved.appliedLive).toBe(false);
    expect(saved.environment?.revision).toBe(2);
    expect(saved.route?.path).toBe('/api/checkout');
    expect(saved.message).toContain('Open MockForge');
  });

  it('turns a session request into a mock mutation', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mockforge-mcp-session-'));
    process.env.MOCKFORGE_DATA_DIR = dataDir;
    const created = commitMutationToDisk({ op: 'create_environment', name: 'Only' });

    const sessionId = 'session-1';
    const sessionDir = join(dataDir, 'sessions', sessionId);
    mkdirSync(sessionDir, { recursive: true });
    const meta = {
      id: sessionId,
      name: 'Checkout',
      environmentId: created.environment?.id,
      environmentName: 'Only',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'completed',
      requestCount: 1,
      consumerIds: [],
      platforms: ['ios'],
    };
    writeFileSync(join(dataDir, 'sessions', 'index.json'), JSON.stringify([meta]));
    writeFileSync(join(sessionDir, 'meta.json'), JSON.stringify(meta));
    writeFileSync(join(sessionDir, 'records.jsonl'), `${JSON.stringify({
      id: 'req-9',
      timestamp: '2026-01-01T00:00:00.000Z',
      method: 'GET',
      path: '/api/cart',
      headers: {},
      responseStatus: 200,
      responseBody: '{"items":[]}',
    })}\n`);

    const mutation = buildWriteMutation('create_mock_from_session_request', {
      sessionId,
      requestId: 'req-9',
    });

    expect(mutation?.op).toBe('create_mock_from_request');
    if (mutation?.op !== 'create_mock_from_request') return;
    expect(mutation.environmentId).toBe(created.environment?.id);
    expect(mutation.kind).toBe('full');
    expect(mutation.captured.path).toBe('/api/cart');
  });
});
