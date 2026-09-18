import type { RequestOverride } from './types';
import {
  MOCKFORGE_REQUEST_BODY_PATHS_HEADER,
  MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER,
} from './mockforgeHeaders';
import {
  buildJsonDisplayLines,
  getCoveringAncestor,
  getEffectiveMergePaths,
  isAncestorPath,
  listLeafPaths,
  parseJsonBody,
} from './jsonMergeUtils';

export {
  MOCKFORGE_REQUEST_BODY_PATHS_HEADER,
  MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER,
} from './mockforgeHeaders';

export interface MockedRequestPaths {
  mockedRequestBodyPaths?: string[];
  mockedRequestHeaderFields?: string[];
}

function parseStringArrayHeader(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const items = parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    return items.length > 0 ? items : undefined;
  } catch {
    return undefined;
  }
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers || !name) return undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

export function getMockedRequestPathsFromOverride(
  requestOverride?: RequestOverride | null,
): MockedRequestPaths {
  if (!requestOverride) return {};

  const result: MockedRequestPaths = {};

  if (requestOverride.bodyMode === 'merge') {
    const mergeFields = requestOverride.mergeFields ?? [];
    if (mergeFields.length > 0) {
      result.mockedRequestBodyPaths = getEffectiveMergePaths(mergeFields);
    }
  } else if (requestOverride.body?.trim()) {
    const parsed = parseJsonBody(requestOverride.body);
    if (parsed !== null) {
      const leafPaths = listLeafPaths(parsed);
      if (leafPaths.length > 0) {
        result.mockedRequestBodyPaths = leafPaths;
      }
    }
  }

  if (requestOverride.headersMode === 'merge') {
    const mergeHeaderFields = requestOverride.mergeHeaderFields ?? [];
    if (mergeHeaderFields.length > 0) {
      result.mockedRequestHeaderFields = [...mergeHeaderFields];
    }
  } else if (requestOverride.headers && Object.keys(requestOverride.headers).length > 0) {
    result.mockedRequestHeaderFields = Object.keys(requestOverride.headers).filter(
      (key) => key.toLowerCase() !== 'host',
    );
  }

  return result;
}

export function inferTrafficMockPaths(
  responseHeaders?: Record<string, string>,
): MockedRequestPaths {
  return {
    mockedRequestBodyPaths: parseStringArrayHeader(
      headerValue(responseHeaders, MOCKFORGE_REQUEST_BODY_PATHS_HEADER),
    ),
    mockedRequestHeaderFields: parseStringArrayHeader(
      headerValue(responseHeaders, MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER),
    ),
  };
}

export function mergeMockedRequestPaths(
  primary?: MockedRequestPaths,
  secondary?: MockedRequestPaths,
): MockedRequestPaths {
  const mockedRequestBodyPaths = [
    ...(primary?.mockedRequestBodyPaths ?? []),
    ...(secondary?.mockedRequestBodyPaths ?? []),
  ];
  const mockedRequestHeaderFields = [
    ...(primary?.mockedRequestHeaderFields ?? []),
    ...(secondary?.mockedRequestHeaderFields ?? []),
  ];

  return {
    mockedRequestBodyPaths: mockedRequestBodyPaths.length > 0
      ? [...new Set(mockedRequestBodyPaths)]
      : undefined,
    mockedRequestHeaderFields: mockedRequestHeaderFields.length > 0
      ? [...new Set(mockedRequestHeaderFields)]
      : undefined,
  };
}

export function isJsonPathMocked(path: string, mockedPaths: string[]): boolean {
  if (mockedPaths.includes(path)) return true;
  if (getCoveringAncestor(path, mockedPaths)) return true;
  return mockedPaths.some((candidate) => isAncestorPath(path, candidate));
}

export function getMockedLineNumbers(body: string, mockedPaths?: string[]): number[] {
  if (!mockedPaths?.length || !body.trim()) return [];

  const lines = buildJsonDisplayLines(body);
  const lineNumbers: number[] = [];

  lines.forEach((line, index) => {
    if (line.path === null) return;
    if (isJsonPathMocked(line.path, mockedPaths)) {
      lineNumbers.push(index + 1);
    }
  });

  return lineNumbers;
}
