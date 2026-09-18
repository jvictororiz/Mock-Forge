export const MOCKFORGE_RESPONSE_MARKER_HEADER = 'x-mockforge-mock-response';
export const MOCKFORGE_REQUEST_MARKER_HEADER = 'x-mockforge-mock-request';
export const MOCKFORGE_REQUEST_BODY_PATHS_HEADER = 'x-mockforge-mock-request-body-paths';
export const MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER = 'x-mockforge-mock-request-header-fields';
export const MOCKFORGE_CLIENT_IP_HEADER = 'x-mockforge-client-ip';
export const MOCKFORGE_CLIENT_UA_HEADER = 'x-mockforge-client-ua';
export const MOCKFORGE_FORCED_EXECUTION_HEADER = 'x-mockforge-forced-execution';
export const MOCKFORGE_REQUEST_ID_HEADER = 'x-mockforge-request-id';

export function isInternalMockForgeHeader(name: string): boolean {
  return name.toLowerCase().startsWith('x-mockforge-');
}

export function stripInternalMockForgeHeaders(
  headers: Record<string, string | string[] | undefined>,
): void {
  for (const key of Object.keys(headers)) {
    if (isInternalMockForgeHeader(key)) {
      delete headers[key];
    }
  }
}

export function withoutInternalMockForgeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!isInternalMockForgeHeader(key)) {
      result[key] = value;
    }
  }
  return result;
}
