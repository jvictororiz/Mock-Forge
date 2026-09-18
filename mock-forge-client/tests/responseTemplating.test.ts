import { describe, expect, it } from 'vitest';
import {
  applyResponseTemplating,
  containsResponseTemplates,
} from '../shared/responseTemplating';

describe('responseTemplating', () => {
  it('detects MockForge template placeholders', () => {
    expect(containsResponseTemplates('{"echo": "{{request.body.name}}"}')).toBe(true);
    expect(containsResponseTemplates('{"token": "{{request.headers.Authorization}}"}')).toBe(true);
    expect(containsResponseTemplates('{"static": "ok"}')).toBe(false);
  });

  it('converts body fields to MockServer Mustache jsonPath', () => {
    const result = applyResponseTemplating('{"echo": "{{request.body.user.name}}"}');
    expect(result).toBe(
      '{"echo": "{{{jsonPath request.body \'$.user.name\'}}}"}',
    );
  });

  it('converts header fields to MockServer Mustache header access', () => {
    const result = applyResponseTemplating('{"token": "{{request.headers.Authorization}}"}');
    expect(result).toBe('{"token": "{{{request.headers.Authorization}}}"}');
  });
});
