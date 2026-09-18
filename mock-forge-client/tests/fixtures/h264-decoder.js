"use strict";
var MirrorDecoder = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/utils/h264WebCodecsDecoder.ts
  var h264WebCodecsDecoder_exports = {};
  __export(h264WebCodecsDecoder_exports, {
    H264WebCodecsRenderer: () => H264WebCodecsRenderer,
    buildAvcDecoderDescription: () => buildAvcDecoderDescription,
    buildCodecString: () => buildCodecString,
    findStartCodeIndex: () => findStartCodeIndex,
    splitAnnexB: () => splitAnnexB,
    toAvccKeyframe: () => toAvccKeyframe,
    toAvccSample: () => toAvccSample
  });
  function concatChunks(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }
  function findStartCodeIndex(data, fromIndex) {
    for (let i = fromIndex; i < data.length - 3; i += 1) {
      if (data[i] === 0 && data[i + 1] === 0) {
        if (data[i + 2] === 0 && data[i + 3] === 1) return i;
        if (data[i + 2] === 1) return i;
      }
    }
    return -1;
  }
  function splitAnnexB(data) {
    const nals = [];
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
  function buildAvcDecoderDescription(sps, pps) {
    const description = new Uint8Array(11 + sps.length + pps.length);
    description[0] = 1;
    description[1] = sps[1];
    description[2] = sps[2];
    description[3] = sps[3];
    description[4] = 255;
    description[5] = 225;
    description[6] = sps.length >> 8 & 255;
    description[7] = sps.length & 255;
    description.set(sps, 8);
    const ppsOffset = 8 + sps.length;
    description[ppsOffset] = 1;
    description[ppsOffset + 1] = pps.length >> 8 & 255;
    description[ppsOffset + 2] = pps.length & 255;
    description.set(pps, ppsOffset + 3);
    return description;
  }
  function buildCodecString(sps) {
    const toHex = (value) => value.toString(16).padStart(2, "0").toUpperCase();
    return `avc1.${toHex(sps[1])}${toHex(sps[2])}${toHex(sps[3])}`;
  }
  function toAvccSample(nal) {
    const sample = new Uint8Array(4 + nal.length);
    const length = nal.length;
    sample[0] = length >>> 24 & 255;
    sample[1] = length >>> 16 & 255;
    sample[2] = length >>> 8 & 255;
    sample[3] = length & 255;
    sample.set(nal, 4);
    return sample;
  }
  function toAvccKeyframe(sps, pps, idr) {
    const spsSample = toAvccSample(sps);
    const ppsSample = toAvccSample(pps);
    const idrSample = toAvccSample(idr);
    const merged = new Uint8Array(spsSample.length + ppsSample.length + idrSample.length);
    merged.set(spsSample, 0);
    merged.set(ppsSample, spsSample.length);
    merged.set(idrSample, spsSample.length + ppsSample.length);
    return merged;
  }
  var H264WebCodecsRenderer = class {
    canvas;
    ctx;
    decoder = null;
    buffer = new Uint8Array(0);
    sps = null;
    pps = null;
    configured = false;
    timestamp = 0;
    waitingForKeyframe = true;
    onFrame;
    configureError = null;
    feedChain = Promise.resolve();
    processedNals = 0;
    constructor(canvas, onFrame) {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas 2D context unavailable");
      }
      this.canvas = canvas;
      this.ctx = ctx;
      this.onFrame = onFrame;
    }
    get supported() {
      return typeof VideoDecoder !== "undefined";
    }
    get lastError() {
      return this.configureError;
    }
    get debugState() {
      return {
        configured: this.configured,
        decoderState: this.decoder?.state ?? null,
        waitingForKeyframe: this.waitingForKeyframe,
        hasSps: !!this.sps,
        hasPps: !!this.pps,
        processedNals: this.processedNals
      };
    }
    async flush() {
      await this.feedChain;
    }
    reset() {
      if (this.decoder && this.decoder.state !== "closed") {
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
    dispose() {
      this.reset();
    }
    feed(chunk) {
      if (!this.supported) return;
      this.feedChain = this.feedChain.then(() => this.feedInternal(chunk)).catch((error) => {
        console.error("[MockForge][mirror] feed failed", error);
      });
    }
    feedInternal(chunk) {
      this.buffer = concatChunks([this.buffer, chunk]);
      const { nals, remainder } = splitAnnexB(this.buffer);
      this.buffer = remainder;
      for (const nal of nals) {
        this.handleNal(nal);
      }
    }
    tryConfigure() {
      if (this.configured || !this.sps || !this.pps) return;
      const description = buildAvcDecoderDescription(this.sps, this.pps);
      const config = {
        codec: buildCodecString(this.sps),
        description,
        optimizeForLatency: true,
        hardwareAcceleration: "prefer-software"
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
            console.error("[MockForge][mirror] decoder error", error);
            this.configureError = error.message;
            this.waitingForKeyframe = true;
          }
        });
        this.decoder.configure(config);
        this.configured = true;
        this.waitingForKeyframe = true;
      } catch (error) {
        this.configureError = error instanceof Error ? error.message : "Decoder configure failed";
      }
    }
    handleNal(nal) {
      if (nal.length === 0) return;
      this.processedNals += 1;
      const nalType = nal[0] & 31;
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
      if (!this.configured || !this.decoder || this.decoder.state !== "configured") return;
      if (nalType !== 5 && nalType !== 1) return;
      const isKeyframe = nalType === 5;
      if (this.waitingForKeyframe && !isKeyframe) return;
      const sample = isKeyframe && this.sps && this.pps ? toAvccKeyframe(this.sps, this.pps, nal) : toAvccSample(nal);
      const chunk = new EncodedVideoChunk({
        type: isKeyframe ? "key" : "delta",
        timestamp: this.timestamp,
        data: sample
      });
      this.timestamp += 33e3;
      try {
        this.decoder.decode(chunk);
        if (isKeyframe) {
          this.waitingForKeyframe = false;
        }
      } catch (error) {
        console.error("[MockForge][mirror] decode failed", error);
        this.waitingForKeyframe = true;
      }
    }
  };
  return __toCommonJS(h264WebCodecsDecoder_exports);
})();
