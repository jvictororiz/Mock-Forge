import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { getJavaInstallHint } from '../utils/platform';
import { getJavaBinaryName, getJrePlatformKey } from '../utils/jrePlatform';

const JAR_NAME = 'mockserver-netty-5.15.0-jar-with-dependencies.jar';
const MIN_JAVA_MAJOR = 17;

export interface JavaCheckResult {
  available: boolean;
  version?: string;
  error?: string;
  source?: 'bundled' | 'system';
}

function getDevResourcesPath(): string {
  return join(__dirname, '..', 'resources');
}

function getBundledJreRoot(): string | null {
  const javaName = getJavaBinaryName();
  const roots = app.isPackaged
    ? [join(process.resourcesPath, 'jre')]
    : [
        join(getDevResourcesPath(), 'jre', getJrePlatformKey()),
        join(getDevResourcesPath(), 'jre', 'current'),
      ];

  for (const root of roots) {
    if (existsSync(join(root, 'bin', javaName))) {
      return root;
    }
  }

  return null;
}

export function getJavaExecutable(): string | null {
  const bundledRoot = getBundledJreRoot();
  if (bundledRoot) {
    return join(bundledRoot, 'bin', getJavaBinaryName());
  }

  if (app.isPackaged) {
    return null;
  }

  return 'java';
}

function readJavaVersion(javaExecutable: string): { major: number; line: string } | null {
  try {
    const output = execSync(`"${javaExecutable}" -version 2>&1`, { encoding: 'utf-8' });
    const versionMatch = output.match(/version "(\d+)/);
    const majorVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;
    return { major: majorVersion, line: output.split('\n')[0] };
  } catch {
    return null;
  }
}

export function getMockServerJarPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mockserver', JAR_NAME);
  }
  return join(__dirname, '..', 'resources', 'mockserver', JAR_NAME);
}

export function checkJava(): JavaCheckResult {
  const javaExecutable = getJavaExecutable();
  if (!javaExecutable) {
    return {
      available: false,
      source: app.isPackaged ? 'bundled' : 'system',
      error: app.isPackaged
        ? 'Bundled Java runtime not found. Reinstall MockForge.'
        : getJavaInstallHint(),
    };
  }

  const versionInfo = readJavaVersion(javaExecutable);
  if (!versionInfo) {
    return {
      available: false,
      source: getBundledJreRoot() ? 'bundled' : 'system',
      error: app.isPackaged
        ? 'Bundled Java runtime is not working. Reinstall MockForge.'
        : getJavaInstallHint(),
    };
  }

  if (versionInfo.major < MIN_JAVA_MAJOR) {
    return {
      available: false,
      version: versionInfo.line,
      error: `Java ${versionInfo.major} detected. MockForge requires Java ${MIN_JAVA_MAJOR} or later.`,
    };
  }

  const bundledRoot = getBundledJreRoot();
  const source: JavaCheckResult['source'] = bundledRoot ? 'bundled' : 'system';
  const versionLabel = source === 'bundled'
    ? `${versionInfo.line} (bundled)`
    : versionInfo.line;

  return {
    available: true,
    version: versionLabel,
    source,
  };
}

export function checkJar(): boolean {
  return existsSync(getMockServerJarPath());
}

export { JAR_NAME };
