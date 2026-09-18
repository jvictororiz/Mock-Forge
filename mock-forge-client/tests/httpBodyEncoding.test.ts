import { gzipSync } from 'zlib';
import { describe, expect, it } from 'vitest';
import { decodeHttpBody, normalizeCapturedBody } from '../shared/httpBodyEncoding';

describe('decodeHttpBody', () => {
  it('decodes gzip responses for traffic capture', () => {
    const payload = JSON.stringify({ ok: true });
    const compressed = gzipSync(Buffer.from(payload, 'utf8'));

    const decoded = decodeHttpBody(compressed, 'gzip');

    expect(decoded).toBe(payload);
  });

  it('returns utf8 text when no encoding is present', () => {
    const payload = '{"hello":"world"}';
    expect(decodeHttpBody(Buffer.from(payload, 'utf8'))).toBe(payload);
  });
});

describe('normalizeCapturedBody', () => {
  it('strips content-encoding headers after decoding', () => {
    const payload = '{"items":[1,2,3]}';
    const compressed = gzipSync(Buffer.from(payload, 'utf8'));

    const normalized = normalizeCapturedBody(compressed, {
      'content-encoding': 'gzip',
      'content-length': String(compressed.length),
      'content-type': 'application/json',
    });

    expect(normalized.body).toBe(payload);
    expect(normalized.headers['content-encoding']).toBeUndefined();
    expect(normalized.headers['content-length']).toBeUndefined();
    expect(normalized.headers['content-type']).toBe('application/json');
  });
});
