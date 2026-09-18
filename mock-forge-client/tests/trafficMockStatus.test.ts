import { describe, it, expect } from 'vitest';
import { getTrafficMockStatus } from '../src/utils/trafficMockStatus';
import type { CapturedRequest } from '../shared/types';
import {
  MOCKFORGE_REQUEST_MARKER_HEADER,
  MOCKFORGE_RESPONSE_MARKER_HEADER,
} from '../shared/mockforgeHeaders';

const baseRequest: CapturedRequest = {
  id: 'req-1',
  timestamp: '2026-01-01T00:00:00Z',
  method: 'GET',
  path: '/api/items',
  headers: {},
};

describe('getTrafficMockStatus', () => {
  it('marks real traffic when no mock markers are present', () => {
    const status = getTrafficMockStatus(baseRequest);
    expect(status).toEqual({ mockedRequest: false, mockedResponse: false });
  });

  it('detects mocked response from marker header', () => {
    expect(MOCKFORGE_RESPONSE_MARKER_HEADER).toBe('x-mockforge-mock-response');

    const status = getTrafficMockStatus({
      ...baseRequest,
      responseHeaders: { 'x-mockforge-mock-response': '1' },
    });

    expect(status.mockedResponse).toBe(true);
    expect(status.mockedRequest).toBe(false);
  });

  it('detects mocked request from marker header', () => {
    expect(MOCKFORGE_REQUEST_MARKER_HEADER).toBe('x-mockforge-mock-request');

    const status = getTrafficMockStatus({
      ...baseRequest,
      responseHeaders: { 'x-mockforge-mock-request': '1' },
    });

    expect(status.mockedRequest).toBe(true);
    expect(status.mockedResponse).toBe(false);
  });

  it('uses stored capture-time flags when present', () => {
    const status = getTrafficMockStatus({
      ...baseRequest,
      mockedRequest: false,
      mockedResponse: true,
    });

    expect(status).toEqual({ mockedRequest: false, mockedResponse: true });
  });

  it('does not infer mock status from current route configuration', () => {
    const status = getTrafficMockStatus({
      ...baseRequest,
      mockedRequest: false,
      mockedResponse: false,
    });

    expect(status).toEqual({ mockedRequest: false, mockedResponse: false });
  });
});
