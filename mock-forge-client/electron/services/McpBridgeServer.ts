import { randomBytes, timingSafeEqual } from 'crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MCP_BRIDGE_FILE, MCP_BRIDGE_HOST, type McpBridgeInfo, type McpMutation, type McpMutationSuccess } from '../../shared/mcpBridge';

const MAX_BODY_BYTES = 8 * 1024 * 1024;

let activeServer: Server | null = null;
let activeFile: string | null = null;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function tokenMatches(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const presented = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(token);
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

export function stopMcpBridge(): void {
  const server = activeServer;
  const file = activeFile;
  activeServer = null;
  activeFile = null;
  if (file && existsSync(file)) unlinkSync(file);
  server?.close();
}

export function startMcpBridge(
  dataDir: string,
  handle: (mutation: McpMutation) => Promise<McpMutationSuccess>,
): Promise<void> {
  stopMcpBridge();
  mkdirSync(dataDir, { recursive: true });

  const token = randomBytes(24).toString('hex');
  const file = join(dataDir, MCP_BRIDGE_FILE);

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      void (async () => {
        try {
          if (!tokenMatches(req.headers.authorization, token)) {
            sendJson(res, 401, { ok: false, error: 'Unauthorized' });
            return;
          }

          if (req.method === 'GET' && req.url === '/health') {
            sendJson(res, 200, { ok: true });
            return;
          }

          if (req.method !== 'POST' || req.url !== '/mutate') {
            sendJson(res, 404, { ok: false, error: 'Not found' });
            return;
          }

          const raw = await readBody(req);
          const mutation = JSON.parse(raw) as McpMutation;
          const result = await handle(mutation);
          sendJson(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!res.headersSent) sendJson(res, 400, { ok: false, error: message });
        }
      })();
    });

    server.once('error', (error) => {
      activeServer = null;
      reject(error);
    });

    server.listen(0, MCP_BRIDGE_HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const info: McpBridgeInfo = { port, token, pid: process.pid };
      writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      activeServer = server;
      activeFile = file;
      resolve();
    });
  });
}
