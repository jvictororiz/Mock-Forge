import {
  MOCKFORGE_REQUEST_MARKER_HEADER,
  MOCKFORGE_RESPONSE_MARKER_HEADER,
} from './mockforgeHeaders';

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers || !name) return undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

export function inferTrafficMockStatus(
  responseHeaders?: Record<string, string>,
): { mockedRequest: boolean; mockedResponse: boolean } {
  return {
    mockedRequest: headerValue(responseHeaders, MOCKFORGE_REQUEST_MARKER_HEADER) === '1',
    mockedResponse: headerValue(responseHeaders, MOCKFORGE_RESPONSE_MARKER_HEADER) === '1',
  };
}
