import { createCorsHeaders, sendJson } from './_shared.js';

export default async function handler(request, response) {
  const headers = createCorsHeaders(request);
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {}, headers);
    return;
  }
  if (request.method !== 'GET') {
    sendJson(response, 405, { ok: false, error: 'Method not allowed.' }, headers);
    return;
  }

  const configured = Boolean(process.env.OPENAI_API_KEY);
  sendJson(response, 200, {
    ok: true,
    configured,
    status: configured ? 'configured' : 'not-configured',
    model: process.env.OPENAI_MODEL || 'gpt-5',
    supportsGeneration: configured,
    message: configured
      ? 'Secure briefing generation is configured.'
      : 'Set OPENAI_API_KEY on the secure backend to enable automatic generation.',
  }, headers);
}
