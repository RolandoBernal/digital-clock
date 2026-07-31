export const BRIEFING_VERSION = 3;

export const SECTION_REGISTRY = [
  section('opening', 'opening', 'Opening Greeting', '☀️', 10, { required: true }),
  section('weather', 'weather', 'Weather', '🌤️', 20, { sourceRequired: true }),
  section('local_awareness', 'local_awareness', 'Today in Nashville', '📍', 30, { sourceRequired: true }),
  section('top_news', 'news', 'What Matters Today', '📰', 40, { sourceRequired: true }),
  section('business_technology', 'business_technology', 'Business, Markets & Technology', '💼', 50, { sourceRequired: true }),
  section('sports', 'sports', 'Sports', '⚽', 60, { sourceRequired: true }),
  section('golf', 'golf', 'Golf', '⛳', 70, { sourceRequired: true }),
  section('cycling', 'cycling', 'Cycling', '🚴', 80, { sourceRequired: true }),
  section('learning_corner', 'learning', 'Learning Corner', '🧠', 90),
  section('quote', 'quote', 'Quote of the Day', '💬', 100),
  section('dad_joke', 'dad_joke', 'Dad Joke', '😄', 110),
  section('riddle_for_levi', 'riddle', 'Riddle for Levi', '🧩', 120),
  section('fascinating_fact', 'fact', 'Fascinating Fact', '🔎', 130, { required: true, sourceRequired: true }),
  section('one_thing', 'action', 'One Thing Worth Doing Today', '🎯', 140),
];

export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'briefingVersion',
    'mode',
    'status',
    'date',
    'generatedAt',
    'updatedAt',
    'greeting',
    'title',
    'subtitle',
    'sections',
    'generation',
    'freshness',
  ],
  properties: {
    id: { type: 'string' },
    briefingVersion: { type: 'number' },
    mode: { type: 'string', enum: ['generated'] },
    status: { type: 'string', enum: ['ready', 'partial'] },
    date: { type: 'string' },
    generatedAt: { type: 'string' },
    updatedAt: { type: 'string' },
    greeting: { type: 'string' },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    sections: {
      type: 'array',
      minItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'title', 'emoji', 'status', 'summary', 'content', 'sources', 'metadata'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          title: { type: 'string' },
          emoji: { type: 'string' },
          status: { type: 'string', enum: ['ready', 'empty', 'error', 'incomplete'] },
          summary: { type: 'string' },
          content: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['kind'],
              properties: {
                kind: {
                  type: 'string',
                  enum: ['paragraph', 'bullets', 'ranked', 'key_value', 'weather', 'news', 'callout', 'quote', 'joke', 'riddle', 'fact', 'action'],
                },
              },
            },
          },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'title', 'publisher', 'url', 'publishedAt', 'accessedAt', 'sourceType'],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                publisher: { type: 'string' },
                url: { type: 'string' },
                publishedAt: { type: ['string', 'null'] },
                accessedAt: { type: 'string' },
                sourceType: { type: 'string' },
              },
            },
          },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
    },
    generation: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'model', 'requestId'],
      properties: {
        provider: { type: 'string' },
        model: { type: ['string', 'null'] },
        requestId: { type: ['string', 'null'] },
      },
    },
    freshness: {
      type: 'object',
      additionalProperties: false,
      required: ['checked', 'warnings'],
      properties: {
        checked: { type: 'boolean' },
        warnings: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

function section(id, type, title, emoji, displayOrder, options = {}) {
  return {
    id,
    type,
    title,
    emoji,
    displayOrder,
    required: Boolean(options.required),
    sourceRequired: Boolean(options.sourceRequired),
  };
}

export function createCorsHeaders(request) {
  const configuredOrigin = process.env.BRIEFING_ALLOWED_ORIGIN || '*';
  const origin = request.headers.origin || '';
  const allowOrigin = configuredOrigin === '*' || configuredOrigin.split(',').map((item) => item.trim()).includes(origin)
    ? configuredOrigin === '*' ? '*' : origin
    : configuredOrigin.split(',')[0].trim();
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

export function sendJson(response, statusCode, payload, headers = {}) {
  response.statusCode = statusCode;
  Object.entries({ 'Content-Type': 'application/json; charset=utf-8', ...headers }).forEach(([key, value]) => {
    response.setHeader(key, value);
  });
  response.end(JSON.stringify(payload));
}

export function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

export function sanitizeSingleLine(value, maxLength = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function normalizeDateKey(value) {
  const clean = sanitizeSingleLine(value, 24);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : new Date().toISOString().slice(0, 10);
}

export function sanitizePreferences(preferences = {}) {
  return {
    displayName: sanitizeSingleLine(preferences.displayName || 'Chief', 40) || 'Chief',
    preferredLocation: sanitizeSingleLine(preferences.preferredLocation || 'Nashville, TN', 90) || 'Nashville, TN',
    timeFormat: ['browser', '12', '24'].includes(preferences.timeFormat) ? preferences.timeFormat : 'browser',
  };
}

export function sanitizeHistory(history = {}) {
  const limitArray = (items, limit) => Array.isArray(items) ? items.slice(0, limit).map((item) => sanitizeSingleLine(item, 220)).filter(Boolean) : [];
  return {
    recentDadJokes: limitArray(history.recentDadJokes, 20),
    recentRiddles: limitArray(history.recentRiddles, 20),
    recentQuotes: limitArray(history.recentQuotes, 20),
    recentFacts: limitArray(history.recentFacts, 40),
    recentLearningTopics: limitArray(history.recentLearningTopics, 20),
    recentOneThingActions: limitArray(history.recentOneThingActions, 20),
  };
}

export function buildPrompt({ dateKey, timezone, preferences, history }) {
  const sectionList = SECTION_REGISTRY
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((section) => `${section.displayOrder}. ${section.emoji} ${section.title} (${section.id})${section.sourceRequired ? ' — sources required' : ''}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: [
        'You generate Daily Chief Briefing Version 3 as a normalized JSON document.',
        'Return only data that fits the supplied JSON schema.',
        'Do not invent citations. If current sourced information is unavailable for a source-required section, mark that section incomplete or empty and explain why in the summary.',
        'Use tasteful emojis in section metadata only. Keep the body polished, concise, and useful.',
        'Do not include private health, family, email, calendar, or fitness claims unless explicitly supplied in this request.',
        'Do not repeat jokes, riddles, quotes, facts, learning topics, or one-thing actions when avoidable based on the supplied history.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Generate the Daily Chief Briefing for ${dateKey}.`,
        `Reader display name: ${preferences.displayName}.`,
        `Preferred local context: ${preferences.preferredLocation}.`,
        `Timezone: ${timezone || 'America/New_York'}.`,
        '',
        'Required section order:',
        sectionList,
        '',
        'Freshness constraints:',
        '- Do not intentionally repeat a dad joke within 90 days.',
        '- Do not intentionally repeat a riddle or quote within 180 days.',
        '- Avoid repeating a learning topic within 30 days.',
        '- Never intentionally repeat a fascinating fact; include trustworthy attribution when provided by retrieval.',
        '- Vary One Thing Worth Doing Today.',
        '',
        'Recent local history to avoid:',
        JSON.stringify(history, null, 2),
      ].join('\n'),
    },
  ];
}

export function extractOutputJson(response) {
  if (response.output_text) {
    return JSON.parse(response.output_text);
  }
  const textParts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) textParts.push(content.text);
    }
  }
  if (!textParts.length) throw new Error('OpenAI response did not include JSON text.');
  return JSON.parse(textParts.join('\n'));
}
