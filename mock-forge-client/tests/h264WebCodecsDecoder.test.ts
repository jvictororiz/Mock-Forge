import { describe, expect, it } from 'vitest';
import {
  buildCodecString,
  findStartCodeIndex,
  splitAnnexB,
  toAvccSample,
} from '../src/utils/h264WebCodecsDecoder';

const SAMPLE = Uint8Array.from([
  0x00, 0x00, 0x00, 0x01, 0x67, 0x64, 0x00, 0x20, 0xac, 0xb4, 0x0f, 0x01,
  0x03, 0xcb, 0xcd, 0x40, 0x40, 0x40, 0x41, 0xb4, 0x28, 0x4d, 0x40, 0x00,
  0x00, 0x00, 0x01, 0x68, 0xee, 0x06, 0xf2, 0xc0, 0x00, 0x00, 0x00, 0x01,
  0x65, 0xb8, 0x40, 0xc7,
]);

describe('h264WebCodecsDecoder helpers', () => {
  it('finds annex-B start codes', () => {
    expect(findStartCodeIndex(SAMPLE, 0)).toBe(0);
    expect(findStartCodeIndex(SAMPLE, 4)).toBe(23);
    expect(findStartCodeIndex(SAMPLE, 28)).toBe(32);
  });

  it('splits annex-B stream into NAL units and keeps incomplete tail', () => {
    const { nals, remainder } = splitAnnexB(SAMPLE);

    expect(nals).toHaveLength(2);
    expect(nals[0][0] & 0x1f).toBe(7);
    expect(nals[1][0] & 0x1f).toBe(8);
    expect(remainder.length).toBeGreaterThan(0);
    expect(remainder[4] & 0x1f).toBe(5);
  });

  it('builds codec string from SPS', () => {
    const { nals } = splitAnnexB(SAMPLE);
    expect(buildCodecString(nals[0])).toBe('avc1.640020');
  });

  it('wraps NAL units in AVCC length prefix', () => {
    const nal = Uint8Array.of(0x65, 0x01, 0x02);
    const sample = toAvccSample(nal);

    expect(sample[0]).toBe(0);
    expect(sample[1]).toBe(0);
    expect(sample[2]).toBe(0);
    expect(sample[3]).toBe(3);
    expect(Array.from(sample.slice(4))).toEqual([0x65, 0x01, 0x02]);
  });
});
