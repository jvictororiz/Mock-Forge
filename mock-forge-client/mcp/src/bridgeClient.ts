import { request } from 'http';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  MCP_BRIDGE_FILE,
  MCP_BRIDGE_HOST,
  describeMutationResult,
  type McpBridgeInfo,
  type McpMutation,
  type McpMutationSuccess,
} from '../../shared/mcpBridge';

export class McpBridgeRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpBridgeRequestError';
  }
}

function readBridgeInfo(dataDir: string): McpBridgeInfo | null {
  const path = join(dataDir, MCP_BRIDGE_FILE);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<McpBridgeInfo>;
    if (!parsed || typeof parsed.port !== 'number' || typeof parsed.token !== 'string' || typeof parsed.pid !== 'number') {
      return null;
    }
    return { port: parsed.port, token: parsed.token, pid: parsed.pid };
  } catch {
    return null;
  }
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function postMutation(info: McpBridgeInfo, mutation: McpMutation): Promise<{ status: number; body: string }> {
  const payload = Buffer.from(JSON.stringify(mutation));
  return new Promise((resolve, reject) => {
    const req = request({
      host: MCP_BRIDGE_HOST,
      port: info.port,
      path: '/mutate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        Authorization: `Bearer ${info.token}`,
      },
      timeout: 20000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 500,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error('Bridge request timed out')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export async function tryMutateViaBridge(
  dataDir: string,
  mutation: McpMutation,
): Promise<McpMutationSuccess | null> {
  const info = readBridgeInfo(dataDir);
  if (!info || !isPidAlive(info.pid)) return null;

  let response: { status: number; body: string };
  try {
    response = await postMutation(info, mutation);
  } catch (error) {
    if (!isPidAlive(info.pid)) return null;
    const message = error instanceof Error ? error.message : String(error);
    throw new McpBridgeRequestError(
      `MockForge is running but the editor bridge did not accept the change (${message}). Restart MockForge and try again.`,
    );
  }

  let parsed: { ok?: boolean; error?: string } & Partial<McpMutationSuccess> = {};
  try {
    parsed = JSON.parse(response.body) as typeof parsed;
  } catch {
    parsed = {};
  }

  if (response.status >= 400) {
    throw new McpBridgeRequestError(parsed.error || `Bridge returned ${response.status}`);
  }

  if (!parsed.ok || !parsed.message) {
    throw new McpBridgeRequestError('Bridge returned an invalid response');
  }

  return parsed as McpMutationSuccess;
}

export function mutationMessage(
  result: Pick<McpMutationSuccess, 'openEditor' | 'route'>,
  appliedLive: boolean,
): string {
  return describeMutationResult(result, appliedLive);
}
