import { FRAME_ANCESTORS_CSP } from './discordAuth.js';

export const SECURITY_HEADERS = {
  'Content-Security-Policy': FRAME_ANCESTORS_CSP,
  'X-Content-Type-Options': 'nosniff',
};

export function sendJson(res, status, payload, headers = {}) {
  res.statusCode = status;
  for (const [name, value] of Object.entries({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...headers,
  })) res.setHeader(name, value);
  res.end(JSON.stringify(payload));
}

export async function readJson(req, maxBytes = 32_768) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body) > maxBytes) throw Object.assign(new Error('Request body too large'), { status: 413 });
    try { return JSON.parse(req.body || '{}'); }
    catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
