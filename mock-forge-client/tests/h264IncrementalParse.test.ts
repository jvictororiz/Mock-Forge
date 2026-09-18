import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { splitAnnexB } from '../src/utils/h264WebCodecsDecoder';

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

describe('incremental annex-B parsing', () => {
  it('extracts SPS/PPS/IDR when fed in 16KB chunks', () => {
    const full = readFileSync(join(__dirname, 'fixtures/scrcpy-sample.h264'));
    let buffer = new Uint8Array(0);
    const types: number[] = [];

    for (let offset = 0; offset < full.length; offset += 16 * 1024) {
      buffer = concat(buffer, full.subarray(offset, offset + 16 * 1024));
      const { nals, remainder } = splitAnnexB(buffer);
      buffer = remainder;
      for (const nal of nals) {
        types.push(nal[0] & 0x1f);
      }
    }

    expect(types[0]).toBe(7);
    expect(types[1]).toBe(8);
    expect(types[2]).toBe(5);
    expect(types.length).toBeGreaterThan(20);
  });
});
