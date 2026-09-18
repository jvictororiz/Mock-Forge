export const PLATFORM_NOISE_HEADERS = [
  'user-agent',
  'x-mockforge-client-ip',
  'x-mockforge-client-ua',
  'accept-language',
  'x-device-id',
  'x-platform',
  'x-app-version',
] as const;

export const PLATFORM_NOISE_BODY_PATHS = [
  '$.device.platform',
  '$.device.os',
  '$.clientInfo.userAgent',
  '$.metadata.timestamp',
] as const;

const NOISE_HEADER_SET = new Set(PLATFORM_NOISE_HEADERS);

export function isNoiseHeader(name: string): boolean {
  return NOISE_HEADER_SET.has(name.toLowerCase() as typeof PLATFORM_NOISE_HEADERS[number]);
}

export function isNoiseBodyPath(path: string): boolean {
  return (PLATFORM_NOISE_BODY_PATHS as readonly string[]).includes(path);
}
