(() => {
  const LEGACY_PLANNER_KEY = 'daily_chief_briefing_state_v1';
  const DOCUMENTS_KEY = 'daily_chief_briefing_documents_v1';
  const BRIEFING_VERSION = 3;
  const MAX_TEXT = 1600;
  const MAX_TITLE = 180;
  const MAX_SOURCE_TITLE = 220;
  const SAFE_PROTOCOLS = new Set(['https:']);

  const SECTION_REGISTRY = [
    createSection('opening', 'opening', 'Opening Greeting', '☀️', 10, { required: true, sourceRequired: false }),
    createSection('weather', 'weather', 'Weather', '🌤️', 20, { sourceRequired: true }),
    createSection('local_awareness', 'local_awareness', 'Today in Nashville', '📍', 30, { sourceRequired: true }),
    createSection('top_news', 'news', 'What Matters Today', '📰', 40, { sourceRequired: true }),
    createSection('business_technology', 'business_technology', 'Business, Markets & Technology', '💼', 50, { sourceRequired: true }),
    createSection('sports', 'sports', 'Sports', '⚽', 60, { sourceRequired: true }),
    createSection('golf', 'golf', 'Golf', '⛳', 70, { sourceRequired: true, collapsible: true }),
    createSection('cycling', 'cycling', 'Cycling', '🚴', 80, { sourceRequired: true, collapsible: true }),
    createSection('learning_corner', 'learning', 'Learning Corner', '🧠', 90, { sourceRequired: false }),
    createSection('quote', 'quote', 'Quote of the Day', '💬', 100, { sourceRequired: false }),
    createSection('dad_joke', 'dad_joke', 'Dad Joke', '😄', 110, { sourceRequired: false }),
    createSection('riddle_for_levi', 'riddle', 'Riddle for Levi', '🧩', 120, { sourceRequired: false }),
    createSection('fascinating_fact', 'fact', 'Fascinating Fact', '🔎', 130, { sourceRequired: true, required: true }),
    createSection('one_thing', 'action', 'One Thing Worth Doing Today', '🎯', 140, { sourceRequired: false }),
  ];
  const SECTION_BY_ID = Object.fromEntries(SECTION_REGISTRY.map((section) => [section.id, section]));
  const SECTION_TITLE_LOOKUP = Object.fromEntries(
    SECTION_REGISTRY.flatMap((section) => [
      [normalizeText(section.title), section.id],
      [normalizeText(section.id.replaceAll('_', ' ')), section.id],
    ]),
  );

  const DEFAULT_DOCUMENT_PREFERENCES = {
    displayName: 'Chief',
    preferredLocation: '',
    timeFormat: 'browser',
    textSize: 'comfortable',
    density: 'comfortable',
    showDemoEntry: true,
    defaultSourcesExpanded: false,
    generationEndpoint: '',
    visibleSections: Object.fromEntries(SECTION_REGISTRY.map((section) => [section.id, true])),
  };

  let store = loadDocumentStore();
  let activeDateKey = getLocalDateKey();
  let activeDemoDocument = null;
  let pendingImportDocument = null;
  let activeDialogName = null;
  let dialogReturnFocus = null;
  let refreshInProgress = false;
  let generationInProgress = false;
  let generationError = '';
  let weatherRefreshInProgress = false;
  let weatherState = {
    status: 'idle',
    snapshot: null,
    error: '',
  };
  let initialized = false;

  const briefingGenerationClient = {
    getStatus() {
      const configured = this.isConfigured();
      return {
        configured,
        status: configured ? 'configured' : 'not-configured',
        message: configured
          ? 'Automatic generation is connected to the secure briefing service.'
          : 'Automatic generation requires a secure backend URL in settings.',
      };
    },
    isConfigured() {
      return Boolean(getGenerationApiBase());
    },
    async generateBriefing() {
      const base = getGenerationApiBase();
      if (!base) throw new Error('Secure briefing generation is not configured.');
      const response = await fetch(`${base}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey: getLocalDateKey(),
          timezone: getTimezone(),
          preferences: {
            displayName: store.preferences.displayName,
            preferredLocation: store.preferences.preferredLocation,
            timeFormat: store.preferences.timeFormat,
            weather: weatherState.snapshot ? {
              locationName: weatherState.snapshot.locationName,
              currentTemperature: weatherState.snapshot.currentTemperature,
              currentConditionLabel: weatherState.snapshot.currentConditionLabel,
              todayHigh: weatherState.snapshot.todayHigh,
              todayLow: weatherState.snapshot.todayLow,
              precipitationProbability: weatherState.snapshot.precipitationProbability,
              windSpeed: weatherState.snapshot.windSpeed,
              fetchedAt: weatherState.snapshot.fetchedAt,
            } : null,
          },
          history: createGenerationHistory(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Briefing generation failed.');
      }
      return this.normalizeResponse(payload.document || payload);
    },
    async getBriefing(dateKey) {
      return store.documents[dateKey] || null;
    },
    cancelGeneration() {
      return false;
    },
    normalizeResponse(response) {
      return normalizeBriefingDocument(response, { mode: 'generated' });
    },
  };

  function createSection(id, type, title, emoji, displayOrder, options = {}) {
    return {
      id,
      type,
      title,
      emoji,
      description: options.description || '',
      displayOrder,
      enabled: options.enabled !== false,
      required: Boolean(options.required),
      sourceRequired: Boolean(options.sourceRequired),
      collapsible: Boolean(options.collapsible),
      renderer: options.renderer || type,
      emptyState: options.emptyState || 'This section has no completed briefing content yet.',
      errorState: options.errorState || 'This section could not be loaded.',
    };
  }

  function getRoot() {
    return document.getElementById('daily-chief-briefing-root');
  }

  function getGenerationApiBase() {
    const configured = sanitizeSingleLine(store.preferences.generationEndpoint || '', 260).replace(/\/+$/, '');
    if (configured) return configured;
    const host = window.location?.hostname || '';
    if (host && host !== 'rolandobernal.github.io') {
      return `${window.location.origin}/api/daily-chief-briefing`;
    }
    return '';
  }

  function getTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  }

  function getLocalDateKey(date = new Date()) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function sanitizeSingleLine(value, maxLength = MAX_TEXT) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function sanitizeMultiline(value, maxLength = MAX_TEXT) {
    return String(value || '').replace(/\r/g, '').trim().slice(0, maxLength);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function createId(prefix = 'briefing') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadLegacyPreferences() {
    try {
      const raw = localStorage.getItem(LEGACY_PLANNER_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const prefs = parsed && parsed.preferences;
      if (!prefs || typeof prefs !== 'object') return {};
      return {
        displayName: sanitizeSingleLine(prefs.preferredName || prefs.displayName || '', 40) || undefined,
        preferredLocation: sanitizeSingleLine(prefs.preferredLocation || '', 90) || undefined,
        timeFormat: ['browser', '12', '24'].includes(prefs.timeFormat) ? prefs.timeFormat : undefined,
      };
    } catch (error) {
      console.warn('Daily Chief Briefing legacy planner preferences could not be read.', error);
      return {};
    }
  }

  function createDefaultDocumentStore() {
    return {
      version: 1,
      currentDateKey: getLocalDateKey(),
      documents: {},
      preferences: {
        ...DEFAULT_DOCUMENT_PREFERENCES,
        ...loadLegacyPreferences(),
      },
      migration: {
        legacyPlannerKey: LEGACY_PLANNER_KEY,
        preservedLegacyPlannerData: true,
        migratedPresentationPreferencesAt: new Date().toISOString(),
      },
    };
  }

  function loadDocumentStore() {
    try {
      const raw = localStorage.getItem(DOCUMENTS_KEY);
      if (!raw) return createDefaultDocumentStore();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return createDefaultDocumentStore();
      const fallback = createDefaultDocumentStore();
      const preferences = {
        ...fallback.preferences,
        ...(parsed.preferences && typeof parsed.preferences === 'object' ? parsed.preferences : {}),
        visibleSections: {
          ...fallback.preferences.visibleSections,
          ...(parsed.preferences?.visibleSections || {}),
        },
      };
      const documents = {};
      Object.entries(parsed.documents || {}).forEach(([dateKey, document]) => {
        const normalized = normalizeBriefingDocument(document, {
          mode: document?.mode || 'imported',
          dateKey,
          displayName: preferences.displayName,
        });
        if (normalized.ok) documents[dateKey] = normalized.document;
      });
      return {
        version: 1,
        currentDateKey: typeof parsed.currentDateKey === 'string' ? parsed.currentDateKey : getLocalDateKey(),
        documents,
        preferences: normalizePreferences(preferences),
        migration: parsed.migration || fallback.migration,
      };
    } catch (error) {
      console.warn('Daily Chief Briefing documents could not be read.', error);
      return createDefaultDocumentStore();
    }
  }

  function normalizePreferences(preferences) {
    const visibleSections = { ...DEFAULT_DOCUMENT_PREFERENCES.visibleSections };
    Object.entries(preferences.visibleSections || {}).forEach(([key, value]) => {
      if (Object.prototype.hasOwnProperty.call(visibleSections, key)) {
        visibleSections[key] = value !== false;
      }
    });
    return {
      ...DEFAULT_DOCUMENT_PREFERENCES,
      ...preferences,
      displayName: sanitizeSingleLine(preferences.displayName || 'Chief', 40) || 'Chief',
      preferredLocation: sanitizeSingleLine(preferences.preferredLocation || '', 90),
      timeFormat: ['browser', '12', '24'].includes(preferences.timeFormat) ? preferences.timeFormat : 'browser',
      textSize: ['compact', 'comfortable', 'large'].includes(preferences.textSize) ? preferences.textSize : 'comfortable',
      density: ['compact', 'comfortable'].includes(preferences.density) ? preferences.density : 'comfortable',
      showDemoEntry: preferences.showDemoEntry !== false,
      defaultSourcesExpanded: preferences.defaultSourcesExpanded === true,
      generationEndpoint: sanitizeSingleLine(preferences.generationEndpoint || '', 260),
      visibleSections,
    };
  }

  function saveDocumentStore() {
    try {
      localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(store));
    } catch (error) {
      console.warn('Daily Chief Briefing documents could not be saved.', error);
    }
  }

  function normalizeBriefingDocument(input, options = {}) {
    const warnings = [];
    if (!input || typeof input !== 'object') {
      return { ok: false, errors: ['Import must be a briefing JSON object.'], warnings: [] };
    }
    const date = sanitizeSingleLine(input.date || options.dateKey || getLocalDateKey(), 24);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, errors: ['Briefing date must use YYYY-MM-DD.'], warnings: [] };
    }
    const mode = ['generated', 'imported', 'demo'].includes(input.mode) ? input.mode : options.mode || 'imported';
    const sections = normalizeSections(input.sections || [], warnings);
    if (!sections.length) {
      return { ok: false, errors: ['Briefing must include at least one recognized section.'], warnings };
    }
    const now = new Date().toISOString();
    const document = {
      id: sanitizeSingleLine(input.id || date, 80),
      briefingVersion: Number(input.briefingVersion) || BRIEFING_VERSION,
      mode,
      status: ['ready', 'partial', 'generating', 'stale', 'error', 'offline'].includes(input.status) ? input.status : 'ready',
      date,
      generatedAt: validIso(input.generatedAt) || now,
      updatedAt: validIso(input.updatedAt) || now,
      importedAt: mode === 'imported' ? validIso(input.importedAt) || now : validIso(input.importedAt) || null,
      greeting: sanitizeSingleLine(input.greeting || `Good morning, ${options.displayName || store?.preferences?.displayName || 'Chief'}.`, 140),
      title: sanitizeSingleLine(input.title || 'Daily Chief Briefing', MAX_TITLE),
      subtitle: sanitizeSingleLine(input.subtitle || 'Here’s what matters today.', MAX_TITLE),
      sections,
      generation: normalizeGeneration(input.generation, mode),
      freshness: normalizeFreshness(input.freshness, warnings),
    };
    const fact = sections.find((section) => section.id === 'fascinating_fact');
    if (fact && !fact.sources.length) {
      fact.status = 'incomplete';
      fact.warnings.push('Fascinating Fact requires a trustworthy source.');
      warnings.push('Fascinating Fact is missing required attribution.');
    }
    return { ok: true, document, warnings };
  }

  function validIso(value) {
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function normalizeSections(rawSections, warnings) {
    if (!Array.isArray(rawSections)) return [];
    return rawSections
      .map((section, index) => normalizeSection(section, index, warnings))
      .filter(Boolean)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  function normalizeSection(raw, index, warnings) {
    if (!raw || typeof raw !== 'object') return null;
    const requestedId = sanitizeSingleLine(raw.id || raw.type || '', 80);
    const registryId = SECTION_BY_ID[requestedId] ? requestedId : SECTION_TITLE_LOOKUP[normalizeText(raw.title || requestedId)];
    const definition = SECTION_BY_ID[registryId];
    if (!definition) {
      warnings.push(`Unrecognized section skipped: ${sanitizeSingleLine(raw.title || requestedId || `Section ${index + 1}`, 90)}`);
      return null;
    }
    const sources = normalizeSources(raw.sources || []);
    const content = normalizeContent(raw.content || raw.items || raw.summary || []);
    const section = {
      id: definition.id,
      type: definition.type,
      title: sanitizeSingleLine(raw.title || definition.title, MAX_TITLE),
      emoji: sanitizeSingleLine(raw.emoji || definition.emoji, 12),
      status: ['ready', 'empty', 'error', 'incomplete'].includes(raw.status) ? raw.status : content.length ? 'ready' : 'empty',
      summary: sanitizeMultiline(raw.summary || '', MAX_TEXT),
      content,
      sources,
      metadata: raw.metadata && typeof raw.metadata === 'object' ? safeObject(raw.metadata) : {},
      warnings: Array.isArray(raw.warnings) ? raw.warnings.map((warning) => sanitizeSingleLine(warning, 220)) : [],
      displayOrder: definition.displayOrder,
    };
    if (definition.sourceRequired && !sources.length && section.status !== 'empty') {
      section.warnings.push(`${definition.title} is missing source attribution.`);
      if (section.status === 'ready') section.status = 'incomplete';
    }
    return section;
  }

  function normalizeSources(sources) {
    if (!Array.isArray(sources)) return [];
    return sources.map((source, index) => {
      if (!source || typeof source !== 'object') return null;
      const url = sanitizeUrl(source.url);
      return {
        id: sanitizeSingleLine(source.id || `source_${index + 1}`, 80),
        title: sanitizeSingleLine(source.title || '', MAX_SOURCE_TITLE),
        publisher: sanitizeSingleLine(source.publisher || '', 120),
        url,
        publishedAt: validIso(source.publishedAt) || null,
        accessedAt: validIso(source.accessedAt) || new Date().toISOString(),
        sourceType: sanitizeSingleLine(source.sourceType || 'reference', 60),
      };
    }).filter((source) => source && (source.title || source.publisher || source.url));
  }

  function sanitizeUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value));
      return SAFE_PROTOCOLS.has(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function normalizeContent(content) {
    const items = Array.isArray(content) ? content : [{ kind: 'paragraph', text: content }];
    return items.map(normalizeContentBlock).filter(Boolean);
  }

  function normalizeContentBlock(block) {
    if (typeof block === 'string') return { kind: 'paragraph', text: sanitizeMultiline(block, MAX_TEXT) };
    if (!block || typeof block !== 'object') return null;
    const kind = sanitizeSingleLine(block.kind || block.type || 'paragraph', 40);
    const normalized = { kind };
    Object.entries(block).forEach(([key, value]) => {
      if (['kind', 'type'].includes(key)) return;
      if (typeof value === 'string') normalized[key] = sanitizeMultiline(value, MAX_TEXT);
      else if (typeof value === 'number' || typeof value === 'boolean') normalized[key] = value;
      else if (Array.isArray(value)) normalized[key] = value.map((item) => {
        if (typeof item === 'string') return sanitizeMultiline(item, MAX_TEXT);
        if (item && typeof item === 'object') return safeObject(item);
        return null;
      }).filter((item) => item != null);
      else if (value && typeof value === 'object') normalized[key] = safeObject(value);
    });
    return normalized;
  }

  function safeObject(object) {
    const clean = {};
    Object.entries(object).forEach(([key, value]) => {
      const safeKey = sanitizeSingleLine(key, 60);
      if (!safeKey) return;
      if (typeof value === 'string') clean[safeKey] = sanitizeMultiline(value, MAX_TEXT);
      else if (typeof value === 'number' || typeof value === 'boolean') clean[safeKey] = value;
    });
    return clean;
  }

  function normalizeGeneration(generation, mode) {
    const input = generation && typeof generation === 'object' ? generation : {};
    return {
      provider: sanitizeSingleLine(input.provider || (mode === 'imported' ? 'local-import' : mode), 80),
      model: sanitizeSingleLine(input.model || '', 80) || null,
      requestId: sanitizeSingleLine(input.requestId || '', 120) || null,
    };
  }

  function normalizeFreshness(freshness, warnings) {
    const input = freshness && typeof freshness === 'object' ? freshness : {};
    return {
      checked: input.checked === true,
      warnings: [
        ...(Array.isArray(input.warnings) ? input.warnings : []),
        ...warnings,
      ].map((warning) => sanitizeSingleLine(warning, 260)).filter(Boolean),
    };
  }

  function parseImportValue(value) {
    const text = sanitizeMultiline(value, 80000);
    if (!text) return { ok: false, errors: ['Paste a briefing JSON document or structured briefing text first.'], warnings: [] };
    try {
      return normalizeBriefingDocument(JSON.parse(text), { mode: 'imported' });
    } catch {
      return parseStructuredText(text);
    }
  }

  function parseStructuredText(text) {
    const warnings = [];
    const lines = text.split('\n');
    const sections = [];
    let active = null;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const heading = headingToSectionId(trimmed);
      if (heading) {
        active = {
          id: heading,
          content: [],
          sources: [],
        };
        sections.push(active);
        return;
      }
      if (!active) {
        active = { id: 'opening', content: [], sources: [] };
        sections.push(active);
      }
      if (/^source[s]?:/i.test(trimmed)) {
        active.sources.push({ title: trimmed.replace(/^source[s]?:/i, '').trim(), sourceType: 'imported-text' });
      } else if (/^[-*]\s+/.test(trimmed)) {
        const previous = active.content[active.content.length - 1];
        if (previous?.kind === 'bullets') previous.items.push(trimmed.replace(/^[-*]\s+/, ''));
        else active.content.push({ kind: 'bullets', items: [trimmed.replace(/^[-*]\s+/, '')] });
      } else {
        active.content.push({ kind: 'paragraph', text: trimmed });
      }
    });
    const document = {
      id: getLocalDateKey(),
      briefingVersion: BRIEFING_VERSION,
      mode: 'imported',
      date: getLocalDateKey(),
      title: 'Daily Chief Briefing',
      subtitle: 'Imported from structured text.',
      greeting: `Good morning, ${store.preferences.displayName}.`,
      sections,
      generation: { provider: 'local-text-import', model: null, requestId: null },
      freshness: { checked: false, warnings },
    };
    return normalizeBriefingDocument(document, { mode: 'imported' });
  }

  function headingToSectionId(line) {
    const stripped = normalizeText(line.replace(/^#+\s*/, '').replace(/^[^\p{L}\p{N}]+/u, ''));
    return SECTION_TITLE_LOOKUP[stripped] || null;
  }

  function createDemoBriefing() {
    return normalizeBriefingDocument({
      id: 'demo-version-3',
      briefingVersion: BRIEFING_VERSION,
      mode: 'demo',
      status: 'ready',
      date: '2099-01-01',
      generatedAt: '2099-01-01T11:00:00.000Z',
      updatedAt: '2099-01-01T11:00:00.000Z',
      title: 'Daily Chief Briefing',
      subtitle: 'Demo briefing — not current information.',
      greeting: 'Good morning, Chief.',
      sections: [
        demoSection('weather', [{ kind: 'weather', conditions: 'Comfortable demonstration weather', high: '72°', low: '58°', rideNote: 'Sample ride note only.' }], true),
        demoSection('local_awareness', [{ kind: 'bullets', items: ['Example local awareness item.', 'Another sample city note.'] }], true),
        demoSection('top_news', [{ kind: 'news', headline: 'Example headline for layout only', whyItMatters: 'Shows how news context will read once real sources are imported.' }], true),
        demoSection('business_technology', [{ kind: 'bullets', items: ['Sample market note.', 'Sample AI development note.'] }], true),
        demoSection('sports', [{ kind: 'paragraph', text: 'Sample sports paragraph for renderer QA.' }], true),
        demoSection('golf', [{ kind: 'paragraph', text: 'Sample golf item with no live tournament claim.' }], true),
        demoSection('cycling', [{ kind: 'callout', title: 'Cycling note', text: 'Sample cycling context. No real training data is used.' }], true),
        demoSection('learning_corner', [{ kind: 'paragraph', text: 'A short demonstration explanation appears here.' }, { kind: 'callout', title: 'Takeaway', text: 'The renderer supports practical takeaway blocks.' }]),
        demoSection('quote', [{ kind: 'quote', text: 'A demo quote lives here for presentation only.', author: 'Example Author' }]),
        demoSection('dad_joke', [{ kind: 'joke', setup: 'Why did the demo briefing stay calm?', punchline: 'Because it knew it was only a demo.' }]),
        demoSection('riddle_for_levi', [{ kind: 'riddle', question: 'I show the shape of an answer before the real answer arrives. What am I?', answer: 'A demo.' }]),
        demoSection('fascinating_fact', [{ kind: 'fact', fact: 'This is a sample fact block.', explanation: 'Real fascinating facts must include trustworthy attribution.' }], true),
        demoSection('one_thing', [{ kind: 'action', action: 'Import a real completed briefing.', reason: 'That turns this display shell into today’s actual morning report.' }]),
      ],
      generation: { provider: 'demo-fixture', model: null, requestId: null },
      freshness: { checked: false, warnings: ['Demo briefing — not current information.'] },
    }, { mode: 'demo' }).document;
  }

  function demoSection(id, content, includeSource = false) {
    return {
      id,
      content,
      sources: includeSource ? [{ title: 'Example source — demonstration only', sourceType: 'demo' }] : [],
    };
  }

  function getActiveDocument() {
    if (activeDemoDocument) return activeDemoDocument;
    return store.documents[activeDateKey] || null;
  }

  function formatDate(dateKeyOrDate) {
    const date = typeof dateKeyOrDate === 'string' ? new Date(`${dateKeyOrDate}T12:00:00`) : dateKeyOrDate;
    return new Intl.DateTimeFormat(navigator.language || undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  function formatTime(iso) {
    const date = iso ? new Date(iso) : new Date();
    const options = { hour: 'numeric', minute: '2-digit' };
    if (store.preferences.timeFormat === '12') options.hour12 = true;
    if (store.preferences.timeFormat === '24') options.hour12 = false;
    return new Intl.DateTimeFormat(navigator.language || undefined, options).format(date);
  }

  function readWeatherUnitSystem() {
    try {
      const parsed = JSON.parse(localStorage.getItem('digit_clock_preferences_v1') || 'null');
      return parsed?.unit === 'C' ? 'metric' : 'imperial';
    } catch {
      return 'imperial';
    }
  }

  function formatWeatherTime(timestamp) {
    const date = new Date(timestamp || Date.now());
    return new Intl.DateTimeFormat(navigator.language || undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function formatWeatherNumber(value, suffix = '') {
    if (value == null || value === '') return '—';
    return `${value}${suffix}`;
  }

  function createGenerationHistory() {
    const documents = Object.values(store.documents).sort((a, b) => b.date.localeCompare(a.date));
    const collect = (sectionId, blockKind, selector) => documents.flatMap((document) => {
      const section = document.sections.find((item) => item.id === sectionId);
      if (!section) return [];
      return section.content
        .filter((block) => !blockKind || block.kind === blockKind)
        .map(selector)
        .filter(Boolean);
    }).slice(0, 40);
    return {
      recentDadJokes: collect('dad_joke', 'joke', (block) => `${block.setup || ''} ${block.punchline || ''}`),
      recentRiddles: collect('riddle_for_levi', 'riddle', (block) => `${block.question || ''} ${block.answer || ''}`),
      recentQuotes: collect('quote', 'quote', (block) => `${block.text || ''} ${block.author || ''}`),
      recentFacts: collect('fascinating_fact', 'fact', (block) => block.fact || block.text),
      recentLearningTopics: documents.map((document) => document.sections.find((section) => section.id === 'learning_corner')?.metadata?.topic).filter(Boolean).slice(0, 30),
      recentOneThingActions: collect('one_thing', 'action', (block) => block.action || block.text),
    };
  }

  function renderBriefing() {
    const root = getRoot();
    if (!root) return;
    const document = getActiveDocument();
    root.className = `daily_briefing_shell is-text-${store.preferences.textSize} is-density-${store.preferences.density}`;
    root.innerHTML = `
      ${renderDocumentHeader(document)}
      ${store.preferences.visibleSections.weather !== false ? renderLiveWeatherSection() : ''}
      ${document ? renderDocument(document) : renderNoBriefingState()}
      ${renderDialogLayer()}
    `;
    openActiveDialog();
  }

  function renderDocumentHeader(document) {
    const mode = document?.mode || 'none';
    const status = briefingGenerationClient.getStatus();
    return `
      <header class="daily_briefing_doc_header">
        <div class="daily_briefing_header_copy">
          <div class="daily_briefing_kicker">Daily Chief Briefing · Version 3</div>
          <h1 id="briefing-title">${escapeHtml(document?.title || 'Daily Chief Briefing')}</h1>
          <p>${escapeHtml(document?.greeting || `Good morning, ${store.preferences.displayName}.`)}</p>
          <div class="daily_briefing_doc_meta">
            <span>${escapeHtml(document ? formatDate(document.date) : formatDate(getLocalDateKey()))}</span>
            <span>${escapeHtml(modeLabel(mode))}</span>
            ${document ? `<span>${escapeHtml(generatedLabel(document))}</span>` : ''}
          </div>
        </div>
        <div class="daily_briefing_doc_actions" aria-label="Briefing actions">
          <button type="button" class="daily_briefing_button" data-briefing-action="refresh-view" ${refreshInProgress ? 'disabled' : ''}>Refresh View</button>
          <button type="button" class="daily_briefing_button" data-briefing-action="generate-briefing" ${status.configured && !generationInProgress ? '' : 'disabled'}>${generationInProgress ? 'Generating...' : 'Generate Briefing'}</button>
          <button type="button" class="daily_briefing_button daily_briefing_button--quiet" data-briefing-action="go-today">Today</button>
          <button type="button" class="daily_briefing_button" data-briefing-action="open-import">Import Briefing</button>
          ${store.preferences.showDemoEntry ? '<button type="button" class="daily_briefing_button daily_briefing_button--quiet" data-briefing-action="view-demo">View Demo</button>' : ''}
          <button type="button" class="daily_briefing_icon_button" data-briefing-action="open-history" aria-label="Briefing history">⌚</button>
          <button type="button" class="daily_briefing_icon_button" data-briefing-action="open-settings" aria-label="Daily Chief Briefing settings">⚙</button>
        </div>
        <div class="daily_briefing_generation_note">${escapeHtml(generationError || status.message)}</div>
      </header>
    `;
  }

  function modeLabel(mode) {
    if (mode === 'generated') return 'Generated';
    if (mode === 'imported') return 'Imported';
    if (mode === 'demo') return 'Demo briefing — not current information';
    return 'No briefing yet';
  }

  function generatedLabel(document) {
    if (document.mode === 'imported') return `Imported at ${formatTime(document.importedAt || document.updatedAt)}`;
    return `Generated at ${formatTime(document.generatedAt)}`;
  }

  function renderNoBriefingState() {
    return `
      <section class="daily_briefing_empty_state" aria-live="polite">
        <h2>Today’s briefing has not been generated yet.</h2>
        <p>Automatic generation is not configured. Import a completed briefing from a trusted source, or view the clearly labeled demo to see the reading experience.</p>
        <div class="daily_briefing_empty_actions">
          <button type="button" class="daily_briefing_button" data-briefing-action="open-import">Import Briefing</button>
          ${store.preferences.showDemoEntry ? '<button type="button" class="daily_briefing_button daily_briefing_button--quiet" data-briefing-action="view-demo">View Demo</button>' : ''}
          <button type="button" class="daily_briefing_button daily_briefing_button--quiet" data-briefing-action="generate-briefing" ${briefingGenerationClient.isConfigured() && !generationInProgress ? '' : 'disabled'}>${generationInProgress ? 'Generating...' : 'Generate Briefing'}</button>
        </div>
      </section>
    `;
  }

  function renderDocument(document) {
    const visibleSections = document.sections.filter((section) => section.id !== 'weather' && store.preferences.visibleSections[section.id] !== false);
    const isStale = document.date !== getLocalDateKey();
    return `
      <main class="daily_briefing_document" aria-label="Daily Chief Briefing document">
        ${document.mode === 'demo' ? '<div class="daily_briefing_banner">Demo briefing — not current information.</div>' : ''}
        ${isStale ? '<div class="daily_briefing_banner daily_briefing_banner--stale">This briefing may be out of date.</div>' : ''}
        ${renderSectionNav(visibleSections)}
        ${visibleSections.map(renderSection).join('')}
        ${renderDocumentWarnings(document)}
      </main>
    `;
  }

  function renderLiveWeatherSection() {
    const location = store.preferences.preferredLocation;
    const snapshot = weatherState.snapshot;
    const chipLabel = weatherRefreshInProgress ? 'updating' : weatherState.status === 'stale' ? 'stale' : snapshot ? 'ready' : weatherState.status;
    return `
      <article class="daily_briefing_section daily_briefing_section--weather" id="briefing-section-weather">
        <div class="daily_briefing_section_header daily_briefing_weather_header">
          <h2><span aria-hidden="true">🌤️</span> Weather</h2>
          <div class="daily_briefing_weather_actions">
            <span class="daily_briefing_status_chip">${escapeHtml(chipLabel || 'idle')}</span>
            <button type="button" class="daily_briefing_icon_button daily_briefing_weather_refresh" data-briefing-action="refresh-weather" aria-label="Refresh weather" ${weatherRefreshInProgress || !location ? 'disabled' : ''}>↻</button>
          </div>
        </div>
        ${renderWeatherBody()}
      </article>
    `;
  }

  function renderWeatherBody() {
    const location = store.preferences.preferredLocation;
    const snapshot = weatherState.snapshot;
    if (!location) {
      return `<div class="daily_briefing_weather_empty">
        <p>Set your weather location in settings.</p>
        <button type="button" class="daily_briefing_button daily_briefing_button--tiny" data-briefing-action="open-settings">Open Settings</button>
      </div>`;
    }
    if (weatherState.status === 'loading' && !snapshot) {
      return `<div class="daily_briefing_weather_skeleton" role="status" aria-live="polite">
        <span></span><span></span><span></span>
        <p>Loading weather...</p>
      </div>`;
    }
    if (!snapshot) {
      return `<div class="daily_briefing_weather_empty">
        <p>Weather unavailable right now.</p>
        <button type="button" class="daily_briefing_button daily_briefing_button--tiny" data-briefing-action="refresh-weather">Retry</button>
      </div>`;
    }
    const unit = snapshot.temperatureUnit || '°F';
    const windUnit = snapshot.windSpeedUnit || 'mph';
    const dayparts = [
      snapshot.morningForecast,
      snapshot.afternoonForecast,
      snapshot.eveningForecast,
    ].filter(Boolean);
    return `
      <div class="daily_briefing_weather_grid">
        <div class="daily_briefing_weather_current">
          <div class="daily_briefing_weather_location">${escapeHtml(snapshot.locationName || location)}</div>
          <div class="daily_briefing_weather_now">
            <span class="daily_briefing_weather_icon" role="img" aria-label="${escapeHtml(snapshot.currentConditionLabel || 'Current weather')}">${escapeHtml(snapshot.currentConditionIcon || '🌤️')}</span>
            <div>
              <strong>${escapeHtml(formatWeatherNumber(snapshot.currentTemperature, unit))}</strong>
              <span>${escapeHtml(snapshot.currentConditionLabel || 'Current conditions')}</span>
              <span>Feels like ${escapeHtml(formatWeatherNumber(snapshot.apparentTemperature, unit))}</span>
            </div>
          </div>
          <div class="daily_briefing_weather_metrics">
            <span>High ${escapeHtml(formatWeatherNumber(snapshot.todayHigh, unit))}</span>
            <span>Low ${escapeHtml(formatWeatherNumber(snapshot.todayLow, unit))}</span>
            <span>Rain ${escapeHtml(formatWeatherNumber(snapshot.precipitationProbability, '%'))}</span>
            <span>Wind ${escapeHtml(formatWeatherNumber(snapshot.windSpeed, ` ${windUnit}`))}</span>
          </div>
          <p class="daily_briefing_weather_updated">Updated ${escapeHtml(formatWeatherTime(snapshot.fetchedAt))}${navigator.onLine === false ? ' · Offline · showing cached weather' : snapshot.isStale || weatherState.status === 'stale' ? ' · showing cached weather' : ''}</p>
        </div>
        <div class="daily_briefing_weather_dayparts" aria-label="Today-focused forecast">
          ${dayparts.map(renderWeatherDaypart).join('')}
        </div>
      </div>
      ${snapshot.callout ? `<aside class="daily_briefing_weather_callout">${escapeHtml(snapshot.callout)}</aside>` : ''}
      ${weatherState.error && weatherState.status !== 'ready' ? `<p class="daily_briefing_section_error">${escapeHtml(weatherState.error)}</p>` : ''}
    `;
  }

  function renderWeatherDaypart(daypart) {
    const unit = weatherState.snapshot?.temperatureUnit || '°F';
    return `
      <div class="daily_briefing_weather_daypart">
        <span class="daily_briefing_weather_daypart_label">${escapeHtml(daypart.label)}</span>
        <span class="daily_briefing_weather_daypart_icon" role="img" aria-label="${escapeHtml(daypart.conditionLabel)}">${escapeHtml(daypart.conditionIcon || '🌤️')}</span>
        <strong>${escapeHtml(formatWeatherNumber(daypart.temperature, unit))}</strong>
        <span>${escapeHtml(daypart.conditionLabel || 'Conditions')}</span>
        <small>Rain ${escapeHtml(formatWeatherNumber(daypart.precipitationProbability, '%'))}</small>
      </div>
    `;
  }

  function renderSectionNav(sections) {
    if (sections.length < 3) return '';
    return `
      <nav class="daily_briefing_section_nav" aria-label="Briefing sections">
        ${sections.map((section) => `<a href="#briefing-section-${escapeHtml(section.id)}">${escapeHtml(section.emoji)} ${escapeHtml(section.title)}</a>`).join('')}
      </nav>
    `;
  }

  function renderSection(section) {
    const definition = SECTION_BY_ID[section.id] || {};
    const body = renderSectionBody(section, definition);
    return `
      <article class="daily_briefing_section daily_briefing_section--${escapeHtml(section.type)}" id="briefing-section-${escapeHtml(section.id)}">
        <div class="daily_briefing_section_header">
          <h2><span aria-hidden="true">${escapeHtml(section.emoji)}</span> ${escapeHtml(section.title)}</h2>
          <span class="daily_briefing_status_chip">${escapeHtml(section.status)}</span>
        </div>
        ${section.summary ? `<p class="daily_briefing_section_summary">${escapeHtml(section.summary)}</p>` : ''}
        ${body}
        ${renderSectionWarnings(section)}
        ${renderSources(section.sources)}
      </article>
    `;
  }

  function renderSectionBody(section, definition) {
    if (section.status === 'error') {
      return `<p class="daily_briefing_section_error">${escapeHtml(definition.errorState || 'This section could not be loaded.')}</p>`;
    }
    if (!section.content.length) {
      return `<p class="daily_briefing_section_empty">${escapeHtml(definition.emptyState || 'No briefing content provided.')}</p>`;
    }
    return `<div class="daily_briefing_content">${section.content.map((block, index) => renderContentBlock(block, section, index)).join('')}</div>`;
  }

  function renderContentBlock(block, section, index) {
    if (block.kind === 'bullets') {
      const items = Array.isArray(block.items) ? block.items : [];
      return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }
    if (block.kind === 'ranked') {
      const items = Array.isArray(block.items) ? block.items : [];
      return `<ol>${items.map((item) => `<li>${escapeHtml(typeof item === 'string' ? item : item.title || item.text || '')}</li>`).join('')}</ol>`;
    }
    if (block.kind === 'key_value' || block.kind === 'weather') {
      const pairs = block.kind === 'weather'
        ? [['Conditions', block.conditions], ['High', block.high], ['Low', block.low], ['Rain', block.rainNote], ['Ride note', block.rideNote], ['Updated', block.updatedAt]]
        : Object.entries(block.values || block);
      return `<dl class="daily_briefing_facts">${pairs.filter(([, value]) => value).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
    }
    if (block.kind === 'news') {
      return `<div class="daily_briefing_news_item">
        ${block.headline ? `<h3>${escapeHtml(block.headline)}</h3>` : ''}
        ${block.explanation ? `<p>${escapeHtml(block.explanation)}</p>` : ''}
        ${block.whyItMatters ? `<p><strong>Why it matters:</strong> ${escapeHtml(block.whyItMatters)}</p>` : ''}
      </div>`;
    }
    if (block.kind === 'callout') {
      return `<aside class="daily_briefing_callout">${block.title ? `<strong>${escapeHtml(block.title)}</strong>` : ''}<p>${escapeHtml(block.text || '')}</p></aside>`;
    }
    if (block.kind === 'quote') {
      return `<blockquote><p>“${escapeHtml(block.text || '')}”</p>${block.author ? `<cite>${escapeHtml(block.author)}</cite>` : ''}</blockquote>`;
    }
    if (block.kind === 'joke') {
      return renderRevealBlock(`joke-${section.id}-${index}`, block.setup || 'Dad joke', block.punchline || '', 'Reveal punchline');
    }
    if (block.kind === 'riddle') {
      return renderRevealBlock(`riddle-${section.id}-${index}`, block.question || 'Riddle', block.answer || '', 'Reveal answer');
    }
    if (block.kind === 'fact') {
      return `<div class="daily_briefing_fact">${block.fact ? `<strong>${escapeHtml(block.fact)}</strong>` : ''}${block.explanation ? `<p>${escapeHtml(block.explanation)}</p>` : ''}</div>`;
    }
    if (block.kind === 'action') {
      return `<div class="daily_briefing_action_block">${block.action ? `<strong>${escapeHtml(block.action)}</strong>` : ''}${block.reason ? `<p>${escapeHtml(block.reason)}</p>` : ''}</div>`;
    }
    return `<p>${escapeHtml(block.text || block.summary || '')}</p>`;
  }

  function renderRevealBlock(id, prompt, answer, buttonLabel) {
    return `
      <div class="daily_briefing_reveal">
        <p>${escapeHtml(prompt)}</p>
        ${answer ? `<button type="button" class="daily_briefing_button daily_briefing_button--tiny" data-briefing-action="toggle-reveal" aria-expanded="false" aria-controls="${escapeHtml(id)}">${escapeHtml(buttonLabel)}</button>
        <div id="${escapeHtml(id)}" class="daily_briefing_reveal_answer" hidden>${escapeHtml(answer)}</div>` : ''}
      </div>
    `;
  }

  function renderSectionWarnings(section) {
    if (!section.warnings?.length) return '';
    return `<div class="daily_briefing_warning">${section.warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join('')}</div>`;
  }

  function renderDocumentWarnings(document) {
    const warnings = document.freshness?.warnings || [];
    if (!warnings.length) return '';
    return `<section class="daily_briefing_section"><h2>Freshness Notes</h2><div class="daily_briefing_warning">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join('')}</div></section>`;
  }

  function renderSources(sources) {
    if (!sources?.length) return '';
    const openAttribute = store.preferences.defaultSourcesExpanded ? ' open' : '';
    return `
      <details class="daily_briefing_sources"${openAttribute}>
        <summary>Sources</summary>
        <ul>
          ${sources.map(renderSource).join('')}
        </ul>
      </details>
    `;
  }

  function renderSource(source) {
    const label = source.title || source.publisher || 'Source';
    const meta = [source.publisher, source.sourceType, source.publishedAt ? formatDate(source.publishedAt.slice(0, 10)) : ''].filter(Boolean).join(' · ');
    return `<li>
      ${source.url ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : `<span>${escapeHtml(label)}</span>`}
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
    </li>`;
  }

  function renderDialogLayer() {
    return `
      ${renderImportDialog()}
      ${renderHistoryDialog()}
      ${renderSettingsDialog()}
    `;
  }

  function renderImportDialog() {
    const preview = pendingImportDocument
      ? `<div class="daily_briefing_import_preview"><h3>Preview</h3>${renderDocument(pendingImportDocument)}</div>`
      : '';
    return `
      <dialog class="daily_briefing_dialog" id="daily-briefing-import-dialog" aria-labelledby="briefing-import-title">
        <form class="daily_briefing_dialog_body" data-briefing-form="import">
          <div class="daily_briefing_dialog_header">
            <div>
              <h2 id="briefing-import-title">Import Briefing</h2>
              <p>Paste a normalized Daily Chief Briefing JSON document, or structured text with section headings.</p>
            </div>
            <button type="button" class="daily_briefing_dialog_close" data-briefing-action="close-dialog" aria-label="Close import">×</button>
          </div>
          <label class="daily_briefing_label">Briefing document
            <textarea class="daily_briefing_textarea" name="briefingImport" placeholder='{"date":"2026-07-31","sections":[...]}'></textarea>
          </label>
          <div class="daily_briefing_dialog_actions">
            <button type="submit" class="daily_briefing_button">Preview Import</button>
            <button type="button" class="daily_briefing_button" data-briefing-action="confirm-import" ${pendingImportDocument ? '' : 'disabled'}>Save Imported Briefing</button>
          </div>
          <div class="daily_briefing_validation" data-import-validation></div>
          ${preview}
        </form>
      </dialog>
    `;
  }

  function renderHistoryDialog() {
    const entries = Object.values(store.documents).sort((a, b) => b.date.localeCompare(a.date));
    return `
      <dialog class="daily_briefing_dialog" id="daily-briefing-history-dialog" aria-labelledby="briefing-history-title">
        <div class="daily_briefing_dialog_body">
          <div class="daily_briefing_dialog_header">
            <div>
              <h2 id="briefing-history-title">Briefing History</h2>
              <p>Locally saved briefing documents by date.</p>
            </div>
            <button type="button" class="daily_briefing_dialog_close" data-briefing-action="close-dialog" aria-label="Close history">×</button>
          </div>
          <div class="daily_briefing_history_list">
            ${entries.length ? entries.map(renderHistoryRow).join('') : '<p class="daily_briefing_muted">No saved briefings yet.</p>'}
          </div>
        </div>
      </dialog>
    `;
  }

  function renderHistoryRow(document) {
    return `
      <div class="daily_briefing_history_row">
        <div>
          <strong>${escapeHtml(formatDate(document.date))}</strong>
          <span>${escapeHtml(modeLabel(document.mode))} · ${escapeHtml(generatedLabel(document))}</span>
        </div>
        <div class="daily_briefing_row_actions">
          <button type="button" class="daily_briefing_button daily_briefing_button--tiny" data-briefing-action="open-history-date" data-date-key="${escapeHtml(document.date)}">Open</button>
          <button type="button" class="daily_briefing_button daily_briefing_button--tiny daily_briefing_button--danger" data-briefing-action="delete-history-date" data-date-key="${escapeHtml(document.date)}">Delete</button>
        </div>
      </div>
    `;
  }

  function renderSettingsDialog() {
    const prefs = store.preferences;
    return `
      <dialog class="daily_briefing_dialog" id="daily-briefing-settings-dialog" aria-labelledby="briefing-settings-title">
        <form class="daily_briefing_dialog_body" data-briefing-form="settings">
          <div class="daily_briefing_dialog_header">
            <div>
              <h2 id="briefing-settings-title">Settings</h2>
              <p>Saved briefings are local. Automatic AI generation requires a secure backend; API keys never belong in this browser app.</p>
            </div>
            <button type="button" class="daily_briefing_dialog_close" data-briefing-action="close-dialog" aria-label="Close settings">×</button>
          </div>
          <div class="daily_briefing_settings_grid">
            <label class="daily_briefing_label">Display name
              <input class="daily_briefing_field" name="displayName" maxlength="40" value="${escapeHtml(prefs.displayName)}">
            </label>
            <label class="daily_briefing_label">Weather Location
              <input class="daily_briefing_field" name="preferredLocation" maxlength="90" value="${escapeHtml(prefs.preferredLocation)}" placeholder="Nashville, Tennessee">
            </label>
            <label class="daily_briefing_label">Time format
              <select class="daily_briefing_select" name="timeFormat">
                <option value="browser" ${prefs.timeFormat === 'browser' ? 'selected' : ''}>Browser default</option>
                <option value="12" ${prefs.timeFormat === '12' ? 'selected' : ''}>12-hour</option>
                <option value="24" ${prefs.timeFormat === '24' ? 'selected' : ''}>24-hour</option>
              </select>
            </label>
            <label class="daily_briefing_label">Text size
              <select class="daily_briefing_select" name="textSize">
                <option value="compact" ${prefs.textSize === 'compact' ? 'selected' : ''}>Compact</option>
                <option value="comfortable" ${prefs.textSize === 'comfortable' ? 'selected' : ''}>Comfortable</option>
                <option value="large" ${prefs.textSize === 'large' ? 'selected' : ''}>Large</option>
              </select>
            </label>
            <label class="daily_briefing_label">Reading density
              <select class="daily_briefing_select" name="density">
                <option value="comfortable" ${prefs.density === 'comfortable' ? 'selected' : ''}>Comfortable</option>
                <option value="compact" ${prefs.density === 'compact' ? 'selected' : ''}>Compact</option>
              </select>
            </label>
            <label class="daily_briefing_label">Secure backend URL
              <input class="daily_briefing_field" name="generationEndpoint" maxlength="260" value="${escapeHtml(prefs.generationEndpoint)}" placeholder="https://your-backend.example.com/api/daily-chief-briefing">
            </label>
          </div>
          <section class="daily_briefing_settings_group">
            <h3>Visible optional sections</h3>
            <div class="daily_briefing_checks">
              ${SECTION_REGISTRY.filter((section) => !section.required).map((section) => `<label><span>${escapeHtml(section.emoji)} ${escapeHtml(section.title)}</span><input type="checkbox" name="section-${escapeHtml(section.id)}" ${prefs.visibleSections[section.id] !== false ? 'checked' : ''}></label>`).join('')}
            </div>
          </section>
          <section class="daily_briefing_settings_group">
            <h3>Local data</h3>
            <p>Briefing documents use <code>${DOCUMENTS_KEY}</code>. Prior planner data remains preserved under <code>${LEGACY_PLANNER_KEY}</code> and is not deleted or rewritten.</p>
            <label class="daily_briefing_checkline"><input type="checkbox" name="showDemoEntry" ${prefs.showDemoEntry ? 'checked' : ''}> Show demo action</label>
            <label class="daily_briefing_checkline"><input type="checkbox" name="defaultSourcesExpanded" ${prefs.defaultSourcesExpanded ? 'checked' : ''}> Expand sources by default</label>
          </section>
          <div class="daily_briefing_dialog_actions">
            <button type="submit" class="daily_briefing_button">Save Settings</button>
            <button type="button" class="daily_briefing_button daily_briefing_button--quiet" data-briefing-action="export-documents">Export Documents</button>
            <button type="button" class="daily_briefing_button daily_briefing_button--danger" data-briefing-action="reset-documents">Reset Briefing Documents</button>
          </div>
        </form>
      </dialog>
    `;
  }

  function openActiveDialog() {
    if (!activeDialogName) return;
    const dialog = document.getElementById(dialogId(activeDialogName));
    if (!dialog) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    requestAnimationFrame(() => dialog.querySelector('textarea, input, select, button')?.focus());
  }

  function dialogId(name) {
    return `daily-briefing-${name}-dialog`;
  }

  function openDialog(name, trigger) {
    dialogReturnFocus = trigger || document.activeElement;
    activeDialogName = name;
    renderBriefing();
  }

  function closeDialog() {
    const previousFocus = dialogReturnFocus;
    activeDialogName = null;
    pendingImportDocument = null;
    renderBriefing();
    if (previousFocus && typeof previousFocus.focus === 'function') {
      requestAnimationFrame(() => previousFocus.focus());
    }
    dialogReturnFocus = null;
  }

  function refreshView() {
    refreshInProgress = true;
    store = loadDocumentStore();
    activeDemoDocument = null;
    refreshInProgress = false;
    renderBriefing();
    loadWeatherForBriefing();
  }

  function saveImportedBriefing() {
    if (!pendingImportDocument) return;
    store.documents[pendingImportDocument.date] = pendingImportDocument;
    store.currentDateKey = pendingImportDocument.date;
    activeDateKey = pendingImportDocument.date;
    activeDemoDocument = null;
    pendingImportDocument = null;
    saveDocumentStore();
    closeDialog();
  }

  function deleteBriefing(dateKey) {
    if (!store.documents[dateKey]) return;
    const ok = window.confirm(`Delete the saved briefing for ${formatDate(dateKey)}?`);
    if (!ok) return;
    delete store.documents[dateKey];
    if (activeDateKey === dateKey) activeDateKey = getLocalDateKey();
    saveDocumentStore();
    renderBriefing();
  }

  function saveSettings(form) {
    const previousLocation = store.preferences.preferredLocation;
    const visibleSections = { ...store.preferences.visibleSections };
    SECTION_REGISTRY.forEach((section) => {
      const control = form.elements[`section-${section.id}`];
      if (control) visibleSections[section.id] = Boolean(control.checked);
    });
    store.preferences = normalizePreferences({
      ...store.preferences,
      displayName: form.displayName.value,
      preferredLocation: form.preferredLocation.value,
      timeFormat: form.timeFormat.value,
      textSize: form.textSize.value,
      density: form.density.value,
      generationEndpoint: form.generationEndpoint.value,
      showDemoEntry: Boolean(form.showDemoEntry.checked),
      defaultSourcesExpanded: Boolean(form.defaultSourcesExpanded.checked),
      visibleSections,
    });
    saveDocumentStore();
    const locationChanged = previousLocation !== store.preferences.preferredLocation;
    if (locationChanged) {
      window.LandosWeatherService?.clearLocation(previousLocation);
      weatherState = {
        status: store.preferences.preferredLocation ? 'loading' : 'needs-location',
        snapshot: null,
        error: '',
      };
    }
    closeDialog();
    if (locationChanged) {
      window.dispatchEvent(new CustomEvent('daily-chief-briefing:weather-location-changed'));
      loadWeatherForBriefing({ force: true });
    }
  }

  async function loadWeatherForBriefing(options = {}) {
    const service = window.LandosWeatherService;
    if (!service || store.preferences.visibleSections.weather === false) return;
    const location = store.preferences.preferredLocation;
    if (!location) {
      weatherState = { status: 'needs-location', snapshot: null, error: '' };
      renderBriefing();
      return;
    }
    const cached = service.getCachedWeather(location);
    if (cached) {
      weatherState = {
        status: cached.isStale ? 'stale' : 'ready',
        snapshot: cached,
        error: '',
      };
      renderBriefing();
      if (!cached.isStale && !options.force) return;
    } else {
      weatherState = {
        status: 'loading',
        snapshot: null,
        error: '',
      };
      renderBriefing();
    }
    weatherRefreshInProgress = true;
    renderBriefing();
    const result = await service.getWeather(location, {
      force: Boolean(options.force),
      unitSystem: readWeatherUnitSystem(),
    });
    weatherRefreshInProgress = false;
    weatherState = {
      status: result.status,
      snapshot: result.snapshot,
      error: result.error || '',
    };
    renderBriefing();
  }

  async function generateTodayBriefing() {
    if (generationInProgress || !briefingGenerationClient.isConfigured()) return;
    generationInProgress = true;
    generationError = '';
    activeDemoDocument = null;
    activeDateKey = getLocalDateKey();
    renderBriefing();
    try {
      const result = await briefingGenerationClient.generateBriefing(activeDateKey);
      if (!result.ok) {
        throw new Error(result.errors?.[0] || 'Generated briefing did not match the expected document shape.');
      }
      const document = result.document;
      store.documents[document.date] = document;
      store.currentDateKey = document.date;
      activeDateKey = document.date;
      saveDocumentStore();
    } catch (error) {
      console.warn('Daily Chief Briefing generation failed.', error);
      generationError = error.message || 'Briefing generation failed.';
    } finally {
      generationInProgress = false;
      renderBriefing();
    }
  }

  function exportDocuments() {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `daily-chief-briefing-documents-${getLocalDateKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resetDocuments() {
    const ok = window.confirm('Reset saved briefing documents? Legacy planner data will remain untouched.');
    if (!ok) return;
    store.documents = {};
    store.currentDateKey = getLocalDateKey();
    activeDateKey = getLocalDateKey();
    activeDemoDocument = null;
    saveDocumentStore();
    closeDialog();
  }

  function handleSubmit(event) {
    const form = event.target.closest('[data-briefing-form]');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.briefingForm === 'import') {
      const result = parseImportValue(form.briefingImport.value);
      const validation = form.querySelector('[data-import-validation]');
      if (!result.ok) {
        pendingImportDocument = null;
        if (validation) validation.innerHTML = result.errors.map((error) => `<p>${escapeHtml(error)}</p>`).join('');
      } else {
        pendingImportDocument = result.document;
        activeDialogName = 'import';
        renderBriefing();
      }
    }
    if (form.dataset.briefingForm === 'settings') saveSettings(form);
  }

  function handleClick(event) {
    const button = event.target.closest('[data-briefing-action]');
    if (!button) return;
    const action = button.dataset.briefingAction;
    if (action === 'refresh-view') refreshView();
    if (action === 'refresh-weather') loadWeatherForBriefing({ force: true });
    if (action === 'generate-briefing') generateTodayBriefing();
    if (action === 'go-today') {
      activeDemoDocument = null;
      activeDateKey = getLocalDateKey();
      store.currentDateKey = activeDateKey;
      saveDocumentStore();
      renderBriefing();
    }
    if (action === 'open-import') openDialog('import', button);
    if (action === 'open-history') openDialog('history', button);
    if (action === 'open-settings') openDialog('settings', button);
    if (action === 'close-dialog') closeDialog();
    if (action === 'view-demo') {
      activeDemoDocument = createDemoBriefing();
      activeDateKey = activeDemoDocument.date;
      renderBriefing();
    }
    if (action === 'confirm-import') saveImportedBriefing();
    if (action === 'open-history-date') {
      activeDemoDocument = null;
      activeDateKey = button.dataset.dateKey || getLocalDateKey();
      closeDialog();
    }
    if (action === 'delete-history-date') deleteBriefing(button.dataset.dateKey);
    if (action === 'toggle-reveal') {
      const target = document.getElementById(button.getAttribute('aria-controls'));
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      if (target) target.hidden = expanded;
    }
    if (action === 'export-documents') exportDocuments();
    if (action === 'reset-documents') resetDocuments();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && activeDialogName) {
      event.preventDefault();
      closeDialog();
    }
  }

  function initDailyChiefBriefing() {
    if (initialized || !getRoot()) return;
    initialized = true;
    activeDateKey = store.currentDateKey || getLocalDateKey();
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('online', () => loadWeatherForBriefing({ force: true }));
    renderBriefing();
    loadWeatherForBriefing();
  }

  document.addEventListener('DOMContentLoaded', initDailyChiefBriefing);

  window.DailyChiefBriefing = {
    SECTION_REGISTRY,
    LEGACY_PLANNER_KEY,
    DOCUMENTS_KEY,
    loadDocumentStore,
    saveDocumentStore,
    normalizeBriefingDocument,
    parseImportValue,
    createDemoBriefing,
    briefingGenerationClient,
    getLocalDateKey,
    loadWeatherForBriefing,
  };
})();
