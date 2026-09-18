import { randomUUID } from 'crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { CapturedRequest } from '../../shared/types';
import type { ConsumerPlatform } from '../../shared/consumerUtils';
import type {
  EnvironmentSnapshot,
  TrafficSession,
  TrafficSessionMeta,
} from '../../shared/sessionTypes';

const MOCKFORGE_DIR = join(homedir(), '.mockforge');
const SESSIONS_DIR = join(MOCKFORGE_DIR, 'sessions');
const INDEX_PATH = join(SESSIONS_DIR, 'index.json');

export interface CreateSessionOptions {
  name?: string;
  environmentId: string;
  environmentName: string;
  flowName?: string;
  primaryPlatform?: ConsumerPlatform;
  environmentSnapshot?: EnvironmentSnapshot;
}

interface SessionBundle {
  meta: TrafficSessionMeta;
  records: CapturedRequest[];
}

export class SessionStorage {
  constructor() {
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!existsSync(MOCKFORGE_DIR)) mkdirSync(MOCKFORGE_DIR, { recursive: true });
    if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  private sessionDir(id: string): string {
    return join(SESSIONS_DIR, id);
  }

  private metaPath(id: string): string {
    return join(this.sessionDir(id), 'meta.json');
  }

  private recordsPath(id: string): string {
    return join(this.sessionDir(id), 'records.jsonl');
  }

  private readIndex(): TrafficSessionMeta[] {
    this.ensureDirs();
    if (!existsSync(INDEX_PATH)) return [];
    try {
      return JSON.parse(readFileSync(INDEX_PATH, 'utf-8')) as TrafficSessionMeta[];
    } catch {
      return [];
    }
  }

  private writeIndex(entries: TrafficSessionMeta[]): void {
    this.ensureDirs();
    const sorted = [...entries].sort(
      (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
    writeFileSync(INDEX_PATH, JSON.stringify(sorted, null, 2), 'utf-8');
  }

  private readMeta(id: string): TrafficSessionMeta | null {
    const path = this.metaPath(id);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as TrafficSessionMeta;
    } catch {
      return null;
    }
  }

  private writeMeta(meta: TrafficSessionMeta): void {
    const dir = this.sessionDir(meta.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.metaPath(meta.id), JSON.stringify(meta, null, 2), 'utf-8');

    const index = this.readIndex();
    const existingIndex = index.findIndex((entry) => entry.id === meta.id);
    const lightweight = this.toIndexEntry(meta);
    if (existingIndex >= 0) {
      index[existingIndex] = lightweight;
    } else {
      index.push(lightweight);
    }
    this.writeIndex(index);
  }

  private toIndexEntry(meta: TrafficSessionMeta): TrafficSessionMeta {
    return { ...meta };
  }

  private enrichMetaFromRecords(meta: TrafficSessionMeta, records: CapturedRequest[]): TrafficSessionMeta {
    const consumerIds = new Set(meta.consumerIds);
    const platforms = new Set(meta.platforms);

    for (const record of records) {
      if (record.consumerId) consumerIds.add(record.consumerId);
      if (record.consumerPlatform) platforms.add(record.consumerPlatform);
    }

    return {
      ...meta,
      requestCount: meta.requestCount + records.length,
      consumerIds: [...consumerIds],
      platforms: [...platforms],
    };
  }

  generateDefaultName(): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `Session ${day}/${month} ${hours}:${minutes}`;
  }

  list(): TrafficSessionMeta[] {
    return this.readIndex();
  }

  get(id: string): TrafficSession | null {
    const meta = this.readMeta(id);
    if (!meta) return null;
    return {
      ...meta,
      records: this.getRecords(id),
    };
  }

  getRecords(id: string, options?: { offset?: number; limit?: number }): CapturedRequest[] {
    const path = this.recordsPath(id);
    if (!existsSync(path)) return [];

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 500;
    const content = readFileSync(path, 'utf-8');
    if (!content.trim()) return [];

    const lines = content.split('\n').filter((line) => line.trim());
    const slice = lines.slice(offset, offset + limit);
    const records: CapturedRequest[] = [];

    for (const line of slice) {
      try {
        records.push(JSON.parse(line) as CapturedRequest);
      } catch {
        // skip malformed lines
      }
    }

    return records;
  }

  create(options: CreateSessionOptions): TrafficSession {
    const now = new Date().toISOString();
    const meta: TrafficSessionMeta = {
      id: randomUUID(),
      name: options.name || this.generateDefaultName(),
      environmentId: options.environmentId,
      environmentName: options.environmentName,
      createdAt: now,
      status: 'recording',
      requestCount: 0,
      consumerIds: [],
      platforms: [],
      flowName: options.flowName,
      primaryPlatform: options.primaryPlatform,
      environmentSnapshot: options.environmentSnapshot,
    };

    const dir = this.sessionDir(meta.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.recordsPath(meta.id), '', 'utf-8');
    this.writeMeta(meta);

    return { ...meta, records: [] };
  }

  appendRecords(sessionId: string, records: CapturedRequest[]): void {
    if (records.length === 0) return;

    const meta = this.readMeta(sessionId);
    if (!meta) return;

    const path = this.recordsPath(sessionId);
    const dir = this.sessionDir(sessionId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const payload = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
    appendFileSync(path, payload, 'utf-8');

    this.writeMeta(this.enrichMetaFromRecords(meta, records));
  }

  updateMeta(sessionId: string, partial: Partial<TrafficSessionMeta>): TrafficSessionMeta | null {
    const meta = this.readMeta(sessionId);
    if (!meta) return null;

    const updated: TrafficSessionMeta = {
      ...meta,
      ...partial,
      id: meta.id,
      createdAt: meta.createdAt,
    };
    this.writeMeta(updated);
    return updated;
  }

  complete(sessionId: string): TrafficSessionMeta | null {
    return this.updateMeta(sessionId, {
      status: 'completed',
      endedAt: new Date().toISOString(),
    });
  }

  delete(id: string): void {
    const dir = this.sessionDir(id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }

    const index = this.readIndex().filter((entry) => entry.id !== id);
    this.writeIndex(index);
  }

  rename(id: string, name: string, notes?: string): TrafficSessionMeta | null {
    const partial: Partial<TrafficSessionMeta> = { name };
    if (notes !== undefined) partial.notes = notes;
    return this.updateMeta(id, partial);
  }

  exportSession(id: string, destPath: string): boolean {
    const session = this.get(id);
    if (!session) return false;

    const bundle: SessionBundle = {
      meta: { ...session, records: undefined } as TrafficSessionMeta,
      records: session.records ?? [],
    };

    try {
      writeFileSync(destPath, JSON.stringify(bundle, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  importSession(sourcePath: string): TrafficSession | null {
    try {
      const content = readFileSync(sourcePath, 'utf-8');
      const bundle = JSON.parse(content) as SessionBundle;
      if (!bundle.meta || !Array.isArray(bundle.records)) return null;

      const created = this.create({
        name: bundle.meta.name,
        environmentId: bundle.meta.environmentId,
        environmentName: bundle.meta.environmentName,
        flowName: bundle.meta.flowName,
        primaryPlatform: bundle.meta.primaryPlatform,
        environmentSnapshot: bundle.meta.environmentSnapshot,
      });

      const importedMeta: TrafficSessionMeta = {
        ...created,
        notes: bundle.meta.notes,
        tags: bundle.meta.tags,
        pairedSessionId: bundle.meta.pairedSessionId,
        comparisonGroupId: bundle.meta.comparisonGroupId,
        consumerIds: bundle.meta.consumerIds ?? [],
        platforms: bundle.meta.platforms ?? [],
        requestCount: 0,
        status: 'completed',
        endedAt: bundle.meta.endedAt ?? new Date().toISOString(),
        createdAt: bundle.meta.createdAt ?? created.createdAt,
      };

      writeFileSync(this.recordsPath(created.id), '', 'utf-8');
      this.writeMeta(importedMeta);

      if (bundle.records.length > 0) {
        this.appendRecords(created.id, bundle.records);
      }

      const completed = this.complete(created.id);
      if (!completed) return null;

      return this.get(created.id);
    } catch {
      return null;
    }
  }

  getActiveRecording(): TrafficSessionMeta | null {
    return this.readIndex().find((entry) => entry.status === 'recording') ?? null;
  }
}
