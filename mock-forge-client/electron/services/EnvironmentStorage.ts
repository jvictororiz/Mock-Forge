import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, copyFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { DEFAULT_PORT } from '../../shared/constants';
import type { Environment } from '../../shared/types';
import { prepareEnvironment } from '../../shared/upstreamUtils';

const MOCKFORGE_DIR = join(homedir(), '.mockforge');
const ENVIRONMENTS_DIR = join(MOCKFORGE_DIR, 'environments');

export class EnvironmentStorage {
  constructor() {
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!existsSync(MOCKFORGE_DIR)) mkdirSync(MOCKFORGE_DIR, { recursive: true });
    if (!existsSync(ENVIRONMENTS_DIR)) mkdirSync(ENVIRONMENTS_DIR, { recursive: true });
  }

  private envPath(id: string): string {
    return join(ENVIRONMENTS_DIR, `${id}.json`);
  }

  list(): Environment[] {
    this.ensureDirs();
    const files = readdirSync(ENVIRONMENTS_DIR).filter((f) => f.endsWith('.json'));
    return files.map((f) => {
      const content = readFileSync(join(ENVIRONMENTS_DIR, f), 'utf-8');
      return prepareEnvironment(JSON.parse(content) as Environment);
    });
  }

  get(id: string): Environment | null {
    const path = this.envPath(id);
    if (!existsSync(path)) return null;
    return prepareEnvironment(JSON.parse(readFileSync(path, 'utf-8')) as Environment);
  }

  save(env: Environment): void {
    this.ensureDirs();
    const prepared = prepareEnvironment(env);
    writeFileSync(this.envPath(prepared.id), JSON.stringify(prepared, null, 2), 'utf-8');
  }

  delete(id: string): void {
    const path = this.envPath(id);
    if (existsSync(path)) unlinkSync(path);
  }

  duplicate(id: string, newName?: string): Environment | null {
    const env = this.get(id);
    if (!env) return null;

    const copy: Environment = {
      ...JSON.parse(JSON.stringify(env)),
      id: randomUUID(),
      name: newName || `${env.name} (copy)`,
    };
    this.save(copy);
    return copy;
  }

  create(name: string, port = DEFAULT_PORT): Environment {
    const env: Environment = {
      id: randomUUID(),
      name,
      port,
      routes: [],
    };
    this.save(env);
    return env;
  }

  exportEnv(id: string, destPath: string): boolean {
    const env = this.get(id);
    if (!env) return false;
    copyFileSync(this.envPath(id), destPath);
    return true;
  }

  importEnv(sourcePath: string): Environment | null {
    try {
      const content = readFileSync(sourcePath, 'utf-8');
      const env = JSON.parse(content) as Environment;
      env.id = randomUUID();
      this.save(env);
      return env;
    } catch {
      return null;
    }
  }

  getDefaultEnvironment(): Environment {
    const envs = this.list();
    if (envs.length > 0) return envs[0];

    return this.create('Default', DEFAULT_PORT);
  }
}
