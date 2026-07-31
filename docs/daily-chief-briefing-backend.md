# Daily Chief Briefing Secure Generation Backend

Daily Chief Briefing automatic generation is intentionally server-side. The browser app must never store or send an OpenAI API key directly.

## What Was Added

- `api/daily-chief-briefing/status.js`
- `api/daily-chief-briefing/generate.js`
- `api/daily-chief-briefing/_shared.js`
- `package.json`
- `vercel.json`
- `.env.example`

The frontend calls a secure backend endpoint and stores the returned normalized Version 3 briefing document in `daily_chief_briefing_documents_v1`.

## Required Environment Variables

Set these on the backend host:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5
OPENAI_WEB_SEARCH_TOOL=web_search_preview
BRIEFING_ALLOWED_ORIGIN=https://rolandobernal.github.io
```

`OPENAI_API_KEY` must be set only on the secure backend.

## Deployment Options

### Option A: Deploy Lando's World to Vercel

Deploy this repository to Vercel and set the environment variables above.

The frontend will use same-origin API routes automatically:

```text
/api/daily-chief-briefing/status
/api/daily-chief-briefing/generate
```

### Option B: Keep GitHub Pages Frontend

Deploy this repository, or only its API routes, to Vercel. Then open Daily Chief Briefing settings in the GitHub Pages app and set:

```text
Secure backend URL = https://your-vercel-project.vercel.app/api/daily-chief-briefing
```

The browser will call that URL for automatic generation.

## API Shape

`GET /api/daily-chief-briefing/status`

Returns whether the backend has `OPENAI_API_KEY` configured.

`POST /api/daily-chief-briefing/generate`

Request:

```json
{
  "dateKey": "2026-07-31",
  "timezone": "America/New_York",
  "preferences": {
    "displayName": "Chief",
    "preferredLocation": "Nashville, TN",
    "timeFormat": "browser"
  },
  "history": {
    "recentDadJokes": [],
    "recentRiddles": [],
    "recentQuotes": [],
    "recentFacts": [],
    "recentLearningTopics": [],
    "recentOneThingActions": []
  }
}
```

Response:

```json
{
  "ok": true,
  "status": "ready",
  "document": {
    "briefingVersion": 3,
    "mode": "generated",
    "sections": []
  }
}
```

## Safety Notes

- Do not add API key fields to the browser UI.
- Do not commit `.env` files.
- Keep source citations in the normalized document.
- If a source-required section cannot be sourced, the backend should return that section as `incomplete` or `empty`, not fabricate information.
