const LOG_PREFIX = '[MockForge adb-reverse]';

export type AdbReverseLogEvent =
  | 'reverse_lost'
  | 'reverse_restore_failed'
  | 'reverse_setup_failed'
  | 'no_devices_connected';

export function logAdbReverse(
  event: AdbReverseLogEvent,
  details: Record<string, unknown>,
): void {
  console.warn(`${LOG_PREFIX} ${event} ${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...details,
  })}`);
}
