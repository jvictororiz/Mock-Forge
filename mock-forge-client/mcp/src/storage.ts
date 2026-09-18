import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Environment } from '../../shared/types';
import type { TrafficSession, TrafficSessionMeta } from '../../shared/sessionTypes';
import type { CapturedRequest } from '../../shared/types';
import { prepareEnvironment } from '../../shared/upstreamUtils';

const DEFAULT_DATA_DIR = join(homedir(), '.mockforge');

export function getDataDir(): string {
  return process.env.MOCKFORGE_DATA_DIR?.trim() || DEFAULT_DATA_DIR;
}

function sessionsDir(): string {
  return join(getDataDir(), 'sessions');
}

function environmentsDir(): string {
  return join(getDataDir(), 'environments');
}

function readSessionIndex(): TrafficSessionMeta[] {
  const indexPath = join(sessionsDir(), 'index.json');
  if (!existsSync(indexPath)) return [];
  try {
    return JSON.parse(readFileSync(indexPath, 'utf-8')) as TrafficSessionMeta[];
  } catch {
    return [];
  }
}

function readSessionMeta(id: string): TrafficSessionMeta | null {
  const metaPath = join(sessionsDir(), id, 'meta.json');
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8')) as TrafficSessionMeta;
  } catch {
    return null;
  }
}

export function readSessionRecords(
  id: string,
  options?: { offset?: number; limit?: number },
): CapturedRequest[] {
  const recordsPath = join(sessionsDir(), id, 'records.jsonl');
  if (!existsSync(recordsPath)) return [];

  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 500;
  const content = readFileSync(recordsPath, 'utf-8');
  if (!content.trim()) return [];

  const lines = content.split('\n').filter((line) => line.trim());
  const records: CapturedRequest[] = [];

  for (const line of lines.slice(offset, offset + limit)) {
    try {
      records.push(JSON.parse(line) as CapturedRequest);
    } catch {
      // skip malformed lines
    }
  }

  return records;
}

export interface ListSessionsOptions {
  platform?: string;
  flowName?: string;
  limit?: number;
}

export function listSessions(options?: ListSessionsOptions): TrafficSessionMeta[] {
  let sessions = readSessionIndex();

  if (options?.platform) {
    const platform = options.platform.toLowerCase();
    sessions = sessions.filter(
      (session) =>
        session.primaryPlatform?.toLowerCase() === platform
        || session.platforms.some((value) => value.toLowerCase() === platform),
    );
  }

  if (options?.flowName) {
    const flowName = options.flowName.toLowerCase();
    sessions = sessions.filter((session) => session.flowName?.toLowerCase().includes(flowName));
  }

  sessions.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  if (options?.limit && options.limit > 0) {
    return sessions.slice(0, options.limit);
  }

  return sessions;
}

export function getSession(id: string, includeRecords = true): TrafficSession | null {
  const meta = readSessionMeta(id);
  if (!meta) return null;

  return {
    ...meta,
    records: includeRecords ? readSessionRecords(id) : undefined,
  };
}

export function listEnvironments(): Environment[] {
  const dir = environmentsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const content = readFileSync(join(dir, file), 'utf-8');
      return prepareEnvironment(JSON.parse(content) as Environment);
    });
}

export function getEnvironment(id: string): Environment | null {
  const path = join(environmentsDir(), `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    return prepareEnvironment(JSON.parse(readFileSync(path, 'utf-8')) as Environment);
  } catch {
    return null;
  }
}
