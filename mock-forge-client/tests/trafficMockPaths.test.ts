import { describe, expect, it } from 'vitest';
import {
  getMockedLineNumbers,
  getMockedRequestPathsFromOverride,
  inferTrafficMockPaths,
  isJsonPathMocked,
} from '../shared/trafficMockPaths';
import {
  MOCKFORGE_REQUEST_BODY_PATHS_HEADER,
  MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER,
} from '../shared/mockforgeHeaders';

describe('trafficMockPaths', () => {
  it('collects merge body paths from request override', () => {
    expect(getMockedRequestPathsFromOverride({
      bodyMode: 'merge',
      mergeFields: ['session_id', 'payment_methods[0].range'],
    })).toEqual({
      mockedRequestBodyPaths: ['session_id', 'payment_methods[0].range'],
    });
  });

  it('collects merge header fields from request override', () => {
    expect(getMockedRequestPathsFromOverride({
      bodyMode: 'merge',
      headersMode: 'merge',
      mergeHeaderFields: ['Authorization', 'X-Trace-Id'],
    })).toEqual({
      mockedRequestHeaderFields: ['Authorization', 'X-Trace-Id'],
    });
  });

  it('parses mocked paths from response headers', () => {
    expect(inferTrafficMockPaths({
      [MOCKFORGE_REQUEST_BODY_PATHS_HEADER]: JSON.stringify(['session_id']),
      [MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER]: JSON.stringify(['Authorization']),
    })).toEqual({
      mockedRequestBodyPaths: ['session_id'],
      mockedRequestHeaderFields: ['Authorization'],
    });
  });

  it('maps mocked json paths to line numbers', () => {
    const body = JSON.stringify({
      session_id: 'abc',
      product_type: 'P2P',
      payment_methods: [{ range: { min: '1', max: '2' } }],
    }, null, 2);

    const lines = getMockedLineNumbers(body, ['session_id', 'payment_methods[0].range']);
    expect(lines).toContain(2);
    expect(lines.some((line) => line > 2)).toBe(true);
  });

  it('treats nested lines as mocked when parent path is mocked', () => {
    expect(isJsonPathMocked('payment_methods[0].range.min', ['payment_methods[0].range'])).toBe(true);
  });

  it('highlights the mocked field line even when empty arrays appear earlier in the body', () => {
    const body: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      body[`field_${i}`] = i % 3 === 0 ? [] : null;
    }
    body.persisted_state = '';
    body.feature_updates = [];

    const formatted = JSON.stringify(body, null, 2);
    const mockedLine = formatted
      .split('\n')
      .findIndex((line) => line.includes('"persisted_state"')) + 1;

    expect(getMockedLineNumbers(formatted, ['persisted_state'])).toEqual([mockedLine]);
  });
});
