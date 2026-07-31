import OpenAI from 'openai';
import {
  BRIEFING_VERSION,
  RESPONSE_SCHEMA,
  buildPrompt,
  createCorsHeaders,
  extractOutputJson,
  normalizeDateKey,
  readJsonBody,
  sanitizeHistory,
  sanitizePreferences,
  sendJson,
} from './_shared.js';

export default async function handler(request, response) {
  const headers = createCorsHeaders(request);
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {}, headers);
    return;
  }
  if (request.method !== 'POST') {
    sendJson(response, 405, { ok: false, error: 'Method not allowed.' }, headers);
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    sendJson(response, 503, {
      ok: false,
      status: 'not-configured',
      error: 'Automatic generation is not configured. Set OPENAI_API_KEY on the secure backend.',
    }, headers);
    return;
  }

  try {
    const body = await readJsonBody(request);
    const dateKey = normalizeDateKey(body.dateKey);
    const timezone = typeof body.timezone === 'string' ? body.timezone.slice(0, 80) : 'America/New_York';
    const preferences = sanitizePreferences(body.preferences);
    const history = sanitizeHistory(body.history);
    const model = process.env.OPENAI_MODEL || 'gpt-5';
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const openaiResponse = await client.responses.create({
      model,
      input: buildPrompt({ dateKey, timezone, preferences, history }),
      tools: [{ type: process.env.OPENAI_WEB_SEARCH_TOOL || 'web_search_preview' }],
      text: {
        format: {
          type: 'json_schema',
          name: 'daily_chief_briefing_v3',
          strict: false,
          schema: RESPONSE_SCHEMA,
        },
      },
    });

    const document = extractOutputJson(openaiResponse);
    document.id = document.id || dateKey;
    document.briefingVersion = Number(document.briefingVersion) || BRIEFING_VERSION;
    document.mode = 'generated';
    document.date = dateKey;
    document.generatedAt = document.generatedAt || new Date().toISOString();
    document.updatedAt = new Date().toISOString();
    document.generation = {
      provider: 'openai-responses',
      model,
      requestId: openaiResponse.id || null,
    };

    sendJson(response, 200, {
      ok: true,
      status: 'ready',
      document,
      rawStatus: openaiResponse.status || 'completed',
    }, headers);
  } catch (error) {
    console.error('Daily Chief Briefing generation failed.', error);
    sendJson(response, 500, {
      ok: false,
      status: 'error',
      error: 'Daily Chief Briefing generation failed.',
    }, headers);
  }
}
