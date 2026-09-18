const ENCODING_ALIASES: Record<string, 'gzip' | 'deflate' | 'br'> = {
  gzip: 'gzip',
  'x-gzip': 'gzip',
  deflate: 'deflate',
  br: 'br',
};

function parseContentEncodings(contentEncoding?: string): Array<'gzip' | 'deflate' | 'br'> {
  if (!contentEncoding) return [];

  return contentEncoding
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value && value !== 'identity')
    .map((value) => ENCODING_ALIASES[value])
    .filter((value): value is 'gzip' | 'deflate' | 'br' => !!value);
}

export function decodeHttpBody(buffer: Buffer, contentEncoding?: string): string {
  if (!buffer.length) return '';

  const encodings = parseContentEncodings(contentEncoding);
  let data = buffer;

  try {
    for (let index = encodings.length - 1; index >= 0; index -= 1) {
      const encoding = encodings[index];
      if (encoding === 'gzip') {
        data = decodeGzip(data);
      } else if (encoding === 'deflate') {
        data = decodeDeflate(data);
      } else if (encoding === 'br') {
        data = decodeBrotli(data);
      }
    }
    return data.toString('utf8');
  } catch {
    return buffer.toString('utf8');
  }
}

function decodeGzip(buffer: Buffer): Buffer {
  // Lazy import keeps vitest/browser bundles from pulling zlib unless needed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require('zlib') as typeof import('zlib');
  return zlib.gunzipSync(buffer);
}

function decodeDeflate(buffer: Buffer): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require('zlib') as typeof import('zlib');
  return zlib.inflateSync(buffer);
}

function decodeBrotli(buffer: Buffer): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require('zlib') as typeof import('zlib');
  return zlib.brotliDecompressSync(buffer);
}

export function stripContentEncodingHeaders(headers: Record<string, string>): Record<string, string> {
  const next = { ...headers };
  delete next['content-encoding'];
  delete next['Content-Encoding'];
  delete next['content-length'];
  delete next['Content-Length'];
  return next;
}

export function normalizeCapturedBody(
  buffer: Buffer,
  headers: Record<string, string>,
): { body: string; headers: Record<string, string> } {
  const encoding = headers['content-encoding'] || headers['Content-Encoding'];
  return {
    body: decodeHttpBody(buffer, encoding),
    headers: stripContentEncodingHeaders(headers),
  };
}

export function stripAcceptEncoding(headers: Record<string, string | string[] | undefined>): void {
  delete headers['accept-encoding'];
  delete headers['Accept-Encoding'];
}
