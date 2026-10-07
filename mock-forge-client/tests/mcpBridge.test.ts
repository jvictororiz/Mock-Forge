import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { startMcpBridge, stopMcpBridge } from '../electron/services/McpBridgeServer';
import { MCP_BRIDGE_FILE } from '../shared/mcpBridge';
import type { McpMutationSuccess } from '../shared/mcpBridge';
import { tryMutateViaBridge } from '../mcp/src/bridgeClient';

describe('mcp editor bridge', () => {
  it('applies a mutation through the running app bridge', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mockforge-mcp-bridge-'));
    await startMcpBridge(dataDir, async (mutation) => {
      const result: McpMutationSuccess = {
        ok: true,
        appliedLive: true,
        message: 'Updated the running app and opened the Editor tab.',
        environment: {
          id: 'env-1',
          name: mutation.op,
          port: 1080,
          routes: [],
          revision: 1,
        },
        route: null,
        openEditor: true,
        selectedRouteId: null,
        editorTab: null,
      };
      return result;
    });

    try {
      const result = await tryMutateViaBridge(dataDir, {
        op: 'create_environment',
        name: 'Live',
      });
      expect(result?.appliedLive).toBe(true);
      expect(result?.environment?.name).toBe('create_environment');
      expect(result?.openEditor).toBe(true);
    } finally {
      stopMcpBridge();
    }
  });

  it('writes to disk when the bridge process is gone', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mockforge-mcp-bridge-dead-'));
    writeFileSync(join(dataDir, MCP_BRIDGE_FILE), JSON.stringify({
      port: 1,
      token: 'stale',
      pid: 2_147_483_646,
    }));

    const result = await tryMutateViaBridge(dataDir, {
      op: 'delete_environment',
      environmentId: 'missing',
    });
    expect(result).toBeNull();
  });
});
