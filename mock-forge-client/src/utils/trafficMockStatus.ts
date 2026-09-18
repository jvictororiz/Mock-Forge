import type { CapturedRequest } from '../types';
import { inferTrafficMockStatus } from '../../shared/trafficMockStatus';

export function getTrafficMockStatus(
  request: CapturedRequest,
): { mockedRequest: boolean; mockedResponse: boolean } {
  if (request.mockedRequest !== undefined || request.mockedResponse !== undefined) {
    return {
      mockedRequest: request.mockedRequest ?? false,
      mockedResponse: request.mockedResponse ?? false,
    };
  }

  return inferTrafficMockStatus(request.responseHeaders);
}
