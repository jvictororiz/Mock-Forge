import { execFile, execFileSync } from 'child_process';
import type { AdbDevice } from '../../shared/types';
import { logAdbReverse } from '../adbReverseLog';
import { adbAvailable, resolveAdbPath } from '../utils/adbPath';
import { getShellEnv } from '../utils/shellEnv';

function getAdbCommand(): string {
  return resolveAdbPath() ?? 'adb';
}

function parseAddress(id: string): string {
  if (id.includes(':')) return id.split(':')[0];
  if (id.startsWith('emulator-')) return `127.0.0.1:${id.replace('emulator-', '')}`;
  return id;
}

function parseNameFromLine(line: string): string | undefined {
  const model = line.match(/model:(\S+)/)?.[1]?.replace(/_/g, '-');
  if (model) return model;

  const product = line.match(/product:(\S+)/)?.[1]?.replace(/_/g, '-');
  return product;
}

function adbExecOptions(): { encoding: 'utf-8'; stdio: 'pipe'; env: NodeJS.ProcessEnv } {
  return { encoding: 'utf-8', stdio: 'pipe', env: getShellEnv() };
}

function fetchDeviceName(deviceId: string): string | undefined {
  try {
    const adb = getAdbCommand();
    const manufacturer = execFileSync(
      adb,
      ['-s', deviceId, 'shell', 'getprop', 'ro.product.manufacturer'],
      adbExecOptions(),
    ).trim();

    const model = execFileSync(
      adb,
      ['-s', deviceId, 'shell', 'getprop', 'ro.product.model'],
      adbExecOptions(),
    ).trim();

    if (manufacturer && model) {
      const brand = manufacturer.charAt(0).toUpperCase() + manufacturer.slice(1);
      return `${brand} ${model}`;
    }

    return model || undefined;
  } catch {
    return undefined;
  }
}

function parseDeviceLine(line: string): AdbDevice | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;

  const id = parts[0];
  const state = parts[1] as AdbDevice['state'];
  if (!id || id === 'List') return null;

  const isWifi = id.includes(':');
  const connectionType = isWifi ? 'wifi' : id.startsWith('emulator-') ? 'emulator' : 'usb';
  const address = parseAddress(id);
  const nameFromLine = parseNameFromLine(trimmed);
  const name = state === 'device'
    ? fetchDeviceName(id) ?? nameFromLine ?? id
    : nameFromLine ?? id;

  return {
    id,
    name,
    address,
    state,
    connectionType,
    reverseActive: false,
  };
}

function getReverseActiveForDevice(deviceId: string, port: number): boolean {
  try {
    const output = execFileSync(
      getAdbCommand(),
      ['-s', deviceId, 'reverse', '--list'],
      adbExecOptions(),
    );
    return output.includes(`tcp:${port} tcp:${port}`);
  } catch {
    return false;
  }
}

export function listAdbDevices(port?: number): AdbDevice[] {
  if (!adbAvailable()) return [];

  try {
    const output = execFileSync(getAdbCommand(), ['devices', '-l'], adbExecOptions());
    return output
      .split('\n')
      .slice(1)
      .map(parseDeviceLine)
      .filter((device): device is AdbDevice => device !== null)
      .map((device) => ({
        ...device,
        reverseActive: port != null && device.state === 'device'
          ? getReverseActiveForDevice(device.id, port)
          : false,
      }));
  } catch {
    return [];
  }
}

function getConnectedDevices(): string[] {
  return listAdbDevices()
    .filter((d) => d.state === 'device')
    .map((d) => d.id);
}

export async function connectAdbDevice(address: string): Promise<{ success: boolean; error?: string }> {
  if (!adbAvailable()) {
    return { success: false, error: 'adb not found in PATH' };
  }

  const normalized = address.includes(':') ? address : `${address}:5555`;

  return new Promise((resolve) => {
    execFile(getAdbCommand(), ['connect', normalized], { env: getShellEnv() }, (err, stdout, stderr) => {
      const output = `${stdout}${stderr}`.trim();
      if (err) {
        resolve({ success: false, error: output || err.message });
        return;
      }
      if (/connected|already connected/i.test(output)) {
        resolve({ success: true });
        return;
      }
      resolve({ success: false, error: output || 'Failed to connect' });
    });
  });
}

export async function setupReverseForDevice(
  port: number,
  deviceId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!adbAvailable()) {
    return { success: false, error: 'adb not found' };
  }

  return new Promise((resolve) => {
    execFile(
      getAdbCommand(),
      ['-s', deviceId, 'reverse', `tcp:${port}`, `tcp:${port}`],
      { env: getShellEnv() },
      (err, _stdout, stderr) => {
        if (err) {
          const error = stderr || err.message;
          logAdbReverse('reverse_setup_failed', {
            deviceId,
            port,
            error,
            hint: 'device_may_not_reach_mockforge_until_reverse_is_restored',
          });
          resolve({ success: false, error });
          return;
        }
        resolve({ success: true });
      },
    );
  });
}

export async function setupAdbReverse(
  port: number,
  deviceIds?: string[],
): Promise<{ success: boolean; devices: string[]; error?: string }> {
  if (!adbAvailable()) {
    return { success: false, devices: [], error: 'adb not found' };
  }

  const targets = deviceIds?.length ? deviceIds : getConnectedDevices();
  if (targets.length === 0) {
    return { success: false, devices: [], error: 'no device connected' };
  }

  const reversed: string[] = [];
  const errors: string[] = [];

  for (const device of targets) {
    const result = await setupReverseForDevice(port, device);
    if (result.success) {
      reversed.push(device);
    } else if (result.error) {
      errors.push(`${device}: ${result.error}`);
    }
  }

  if (reversed.length === 0) {
    return { success: false, devices: [], error: errors.join('; ') };
  }

  return { success: true, devices: reversed };
}

export async function removeAdbReverse(port: number, deviceIds?: string[]): Promise<void> {
  if (!adbAvailable()) return;

  const targets = deviceIds?.length ? deviceIds : getConnectedDevices();
  const adb = getAdbCommand();
  await Promise.all(
    targets.map(
      (device) =>
        new Promise<void>((resolve) => {
          execFile(
            adb,
            ['-s', device, 'reverse', '--remove', `tcp:${port}`],
            { env: getShellEnv() },
            () => resolve(),
          );
        }),
    ),
  );
}

export function getAdbStatus(port?: number): { available: boolean; devices: AdbDevice[] } {
  return {
    available: adbAvailable(),
    devices: listAdbDevices(port),
  };
}
