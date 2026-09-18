'use strict';

const zlib = require('zlib');

const ENCODING_ALIASES = {
  gzip: 'gzip',
  'x-gzip': 'gzip',
  deflate: 'deflate',
  br: 'br',
};

function sanitizeJsonText(input) {
  return String(input)
    .replace(/^\uFEFF/, '')
    .replace(/^\u0000+/, '')
    .trim();
}

function prettifyJsonIfPossible(input) {
  if (!input) return '';

  const sanitized = sanitizeJsonText(input);
  if (!sanitized) return input;

  try {
    const parsed = JSON.parse(sanitized);
    if (typeof parsed === 'string') {
      const inner = sanitizeJsonText(parsed);
      if (inner) {
        try {
          return JSON.stringify(JSON.parse(inner), null, 2);
        } catch {
          // keep outer parsed value
        }
      }
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return input;
  }
}

function parseContentEncodings(contentEncoding) {
  if (!contentEncoding) return [];

  return String(contentEncoding)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value && value !== 'identity')
    .map((value) => ENCODING_ALIASES[value])
    .filter(Boolean);
}

function decodeHttpBody(buffer, contentEncoding) {
  if (!buffer || buffer.length === 0) return '';

  const encodings = parseContentEncodings(contentEncoding);
  let data = buffer;

  try {
    for (let index = encodings.length - 1; index >= 0; index -= 1) {
      const encoding = encodings[index];
      if (encoding === 'gzip') {
        data = zlib.gunzipSync(data);
      } else if (encoding === 'deflate') {
        data = zlib.inflateSync(data);
      } else if (encoding === 'br') {
        data = zlib.brotliDecompressSync(data);
      }
    }
    return data.toString('utf8');
  } catch {
    return buffer.toString('utf8');
  }
}

function stripContentEncodingHeaders(headers) {
  const next = { ...headers };
  delete next['content-encoding'];
  delete next['Content-Encoding'];
  delete next['content-length'];
  delete next['Content-Length'];
  return next;
}

function normalizeCapturedBody(buffer, headers) {
  const encoding = headers['content-encoding'] || headers['Content-Encoding'];
  const decoded = decodeHttpBody(buffer, encoding);
  return {
    body: prettifyJsonIfPossible(decoded),
    headers: stripContentEncodingHeaders(headers),
  };
}

module.exports = {
  decodeHttpBody,
  normalizeCapturedBody,
  prettifyJsonIfPossible,
  stripContentEncodingHeaders,
};
