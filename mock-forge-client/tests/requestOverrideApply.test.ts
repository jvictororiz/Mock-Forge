import { describe, expect, it } from 'vitest';
import {
  applyBodyMerge,
  applyBodyOverride,
  applyHeadersOverride,
  defaultMergeHeaderFields,
  mergeValues,
  shouldProxyApplyBodyMerge,
  shouldProxyApplyBodyOverride,
  shouldProxyApplyHeadersOverride,
  shouldProxyApplyRequestOverride,
} from '../shared/requestOverrideApply';
import {
  applyMergeFields,
  getEffectiveMergePaths,
  isAncestorPath,
} from '../shared/jsonMergeUtils';

describe('requestOverrideApply', () => {
  it('selects common auth headers for merge by default', () => {
    expect(defaultMergeHeaderFields({
      token: 'abc',
      'Content-Type': 'application/json',
      Authorization: 'Bearer x',
    })).toEqual(['Authorization', 'token']);
  });

  it('merges only selected body fields into the incoming request', () => {
    const incoming = JSON.stringify({
      product_type: 'PIX',
      transaction_value: '150.00',
      persisted_state: 'old',
    });

    const merged = applyBodyMerge(incoming, {
      headers: {},
      bodyMode: 'merge',
      mergeFields: ['persisted_state'],
      body: JSON.stringify({
        product_type: 'P2P',
        transaction_value: '1.00',
        persisted_state: 'new-state',
      }),
    });

    expect(JSON.parse(merged)).toEqual({
      product_type: 'PIX',
      transaction_value: '150.00',
      persisted_state: 'new-state',
    });
  });

  it('keeps incoming body when merge has no selected fields', () => {
    const incoming = '{"a":1}';
    const result = applyBodyMerge(incoming, {
      headers: {},
      bodyMode: 'merge',
      mergeFields: [],
      body: '{"a":2}',
    });

    expect(result).toBe(incoming);
    expect(shouldProxyApplyBodyMerge({
      headers: {},
      bodyMode: 'merge',
      mergeFields: [],
      body: '{}',
    })).toBe(false);
  });

  it('deep merges nested objects', () => {
    expect(mergeValues(
      { receiver: { id: '1', name: 'Alice' } },
      { receiver: { id: '2' } },
    )).toEqual({
      receiver: { id: '2', name: 'Alice' },
    });
  });

  it('replaces the entire request body in replace mode', () => {
    const incoming = JSON.stringify({ product_type: 'PIX', amount: 10 });
    const overrideBody = JSON.stringify({ product_type: 'P2P', amount: 99 });

    expect(applyBodyOverride(incoming, {
      headers: {},
      bodyMode: 'replace',
      body: overrideBody,
    })).toBe(overrideBody);
    expect(shouldProxyApplyBodyOverride({
      headers: {},
      bodyMode: 'replace',
      body: overrideBody,
    })).toBe(true);
  });

  it('replaces an entire object block when its path is selected', () => {
    const incoming = {
      payment_methods: [{
        name: 'BNPL',
        range: { min: '1.00', max: '10.00', extra: true },
      }],
    };
    const override = {
      payment_methods: [{
        name: 'BNPL',
        range: { min: '18.00', max: '560.00' },
      }],
    };

    const merged = applyMergeFields(incoming, override, ['payment_methods[0].range']);
    expect(merged).toEqual({
      payment_methods: [{
        name: 'BNPL',
        range: { min: '18.00', max: '560.00' },
      }],
    });
    expect(getEffectiveMergePaths([
      'payment_methods[0].range',
      'payment_methods[0].range.min',
    ])).toEqual(['payment_methods[0].range']);
    expect(isAncestorPath('payment_methods[0].range', 'payment_methods[0].range.min')).toBe(true);
  });

  it('replaces request headers in replace mode', () => {
    const incoming = {
      'content-type': 'application/json',
      token: 'incoming',
    };

    expect(applyHeadersOverride(incoming, {
      headers: { token: 'override', 'x-test': '1' },
      bodyMode: 'replace',
      body: '{}',
    }, 'gateway.example.com')).toEqual({
      token: 'override',
      'x-test': '1',
      Host: 'gateway.example.com',
      host: 'gateway.example.com',
    });
    expect(shouldProxyApplyHeadersOverride({
      headers: { token: 'override' },
      bodyMode: 'replace',
      body: '{}',
    })).toBe(true);
    expect(shouldProxyApplyRequestOverride({
      headers: {},
      bodyMode: 'replace',
      body: '{"ok":true}',
    })).toBe(true);
  });
});
