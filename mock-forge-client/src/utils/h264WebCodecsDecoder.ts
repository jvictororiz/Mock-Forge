function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function findStartCodeIndex(data: Uint8Array, fromIndex: number): number {
  for (let i = fromIndex; i < data.length - 3; i += 1) {
    if (data[i] === 0 && data[i + 1] === 0) {
      if (data[i + 2] === 0 && data[i + 3] === 1) return i;
      if (data[i + 2] === 1) return i;
    }
  }
  return -1;
}

export function splitAnnexB(data: Uint8Array): { nals: Uint8Array[]; remainder: Uint8Array } {
  const nals: Uint8Array[] = [];
  let offset = 0;

  while (offset < data.length - 3) {
    const index = findStartCodeIndex(data, offset);
    if (index < 0) {
      return { nals, remainder: data.subarray(offset) };
    }

    const startCodeSize = data[index + 2] === 0 && data[index + 3] === 1 ? 4 : 3;
    const nalStart = index + startCodeSize;
    const nextIndex = findStartCodeIndex(data, nalStart);

    if (nextIndex < 0) {
      return { nals, remainder: data.subarray(index) };
    }

    if (nalStart < nextIndex) {
      nals.push(data.subarray(nalStart, nextIndex));
    }
    offset = nextIndex;
  }

  return { nals, remainder: new Uint8Array(0) };
}

export function buildAvcDecoderDescription(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const description = new Uint8Array(11 + sps.length + pps.length);
  description[0] = 1;
  description[1] = sps[1];
  description[2] = sps[2];
  description[3] = sps[3];
  description[4] = 0xff;
  description[5] = 0xe1;
  description[6] = (sps.length >> 8) & 0xff;
  description[7] = sps.length & 0xff;
  description.set(sps, 8);
  const ppsOffset = 8 + sps.length;
  description[ppsOffset] = 1;
  description[ppsOffset + 1] = (pps.length >> 8) & 0xff;
  description[ppsOffset + 2] = pps.length & 0xff;
  description.set(pps, ppsOffset + 3);
  return description;
}

export function buildCodecString(sps: Uint8Array): string {
  const toHex = (value: number) => value.toString(16).padStart(2, '0').toUpperCase();
  return `avc1.${toHex(sps[1])}${toHex(sps[2])}${toHex(sps[3])}`;
}

export function toAvccSample(nal: Uint8Array): Uint8Array {
  const sample = new Uint8Array(4 + nal.length);
  const length = nal.length;
  sample[0] = (length >>> 24) & 0xff;
  sample[1] = (length >>> 16) & 0xff;
  sample[2] = (length >>> 8) & 0xff;
  sample[3] = length & 0xff;
  sample.set(nal, 4);
  return sample;
}

export function toAvccKeyframe(sps: Uint8Array, pps: Uint8Array, idr: Uint8Array): Uint8Array {
  const spsSample = toAvccSample(sps);
  const ppsSample = toAvccSample(pps);
  const idrSample = toAvccSample(idr);
  const merged = new Uint8Array(spsSample.length + ppsSample.length + idrSample.length);
  merged.set(spsSample, 0);
  merged.set(ppsSample, spsSample.length);
  merged.set(idrSample, spsSample.length + ppsSample.length);
  return merged;
}

export class H264WebCodecsRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private decoder: VideoDecoder | null = null;
  private buffer = new Uint8Array(0);
  private sps: Uint8Array | null = null;
  private pps: Uint8Array | null = null;
  private configured = false;
  private timestamp = 0;
  private waitingForKeyframe = true;
  private onFrame?: () => void;
  private configureError: string | null = null;
  private feedChain: Promise<void> = Promise.resolve();
  private processedNals = 0;

  constructor(canvas: HTMLCanvasElement, onFrame?: () => void) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.onFrame = onFrame;
  }

  get supported(): boolean {
    return typeof VideoDecoder !== 'undefined';
  }

  get lastError(): string | null {
    return this.configureError;
  }

  get debugState(): Record<string, unknown> {
    return {
      configured: this.configured,
      decoderState: this.decoder?.state ?? null,
      waitingForKeyframe: this.waitingForKeyframe,
      hasSps: !!this.sps,
      hasPps: !!this.pps,
      processedNals: this.processedNals,
    };
  }

  async flush(): Promise<void> {
    await this.feedChain;
  }

  reset(): void {
    if (this.decoder && this.decoder.state !== 'closed') {
      this.decoder.close();
    }
    this.decoder = null;
    this.buffer = new Uint8Array(0);
    this.sps = null;
    this.pps = null;
    this.configured = false;
    this.timestamp = 0;
    this.waitingForKeyframe = true;
    this.configureError = null;
    this.processedNals = 0;
    this.feedChain = Promise.resolve();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  dispose(): void {
    this.reset();
  }

  feed(chunk: Uint8Array): void {
    if (!this.supported) return;
    this.feedChain = this.feedChain
      .then(() => this.feedInternal(chunk))
      .catch((error) => {
        console.error('[MockForge][mirror] feed failed', error);
      });
  }

  private feedInternal(chunk: Uint8Array): void {
    this.buffer = concatChunks([this.buffer, chunk]) as Uint8Array<ArrayBuffer>;
    const { nals, remainder } = splitAnnexB(this.buffer);
    this.buffer = remainder as Uint8Array<ArrayBuffer>;

    for (const nal of nals) {
      this.handleNal(nal);
    }
  }

  private tryConfigure(): void {
    if (this.configured || !this.sps || !this.pps) return;

    const description = buildAvcDecoderDescription(this.sps, this.pps);
    const config: VideoDecoderConfig = {
      codec: buildCodecString(this.sps),
      description,
      optimizeForLatency: true,
      hardwareAcceleration: 'prefer-software',
    };

    try {
      this.decoder = new VideoDecoder({
        output: (frame) => {
          const width = frame.displayWidth;
          const height = frame.displayHeight;
          if (width > 0 && height > 0) {
            if (this.canvas.width !== width || this.canvas.height !== height) {
              this.canvas.width = width;
              this.canvas.height = height;
            }
            this.ctx.drawImage(frame, 0, 0, width, height);
            this.onFrame?.();
          }
          frame.close();
        },
        error: (error) => {
          console.error('[MockForge][mirror] decoder error', error);
          this.configureError = error.message;
          this.waitingForKeyframe = true;
        },
      });

      this.decoder.configure(config);
      this.configured = true;
      this.waitingForKeyframe = true;
    } catch (error) {
      this.configureError = error instanceof Error ? error.message : 'Decoder configure failed';
    }
  }

  private handleNal(nal: Uint8Array): void {
    if (nal.length === 0) return;
    this.processedNals += 1;
    const nalType = nal[0] & 0x1f;

    if (nalType === 7) {
      this.sps = new Uint8Array(nal);
      this.tryConfigure();
      return;
    }

    if (nalType === 8) {
      this.pps = new Uint8Array(nal);
      this.tryConfigure();
      return;
    }

    if (!this.configured || !this.decoder || this.decoder.state !== 'configured') return;
    if (nalType !== 5 && nalType !== 1) return;

    const isKeyframe = nalType === 5;
    if (this.waitingForKeyframe && !isKeyframe) return;

    const sample = isKeyframe && this.sps && this.pps
      ? toAvccKeyframe(this.sps, this.pps, nal)
      : toAvccSample(nal);

    const chunk = new EncodedVideoChunk({
      type: isKeyframe ? 'key' : 'delta',
      timestamp: this.timestamp,
      data: sample,
    });
    this.timestamp += 33_000;

    try {
      this.decoder.decode(chunk);
      if (isKeyframe) {
        this.waitingForKeyframe = false;
      }
    } catch (error) {
      console.error('[MockForge][mirror] decode failed', error);
      this.waitingForKeyframe = true;
    }
  }
}
