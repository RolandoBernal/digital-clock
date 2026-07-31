(() => {
  const STORAGE_KEY = 'daily_chief_briefing_state_v1';
  const MAX_FOCUS_LENGTH = 140;
  const MAX_TITLE_LENGTH = 120;
  const MAX_NOTE_LENGTH = 480;
  const NOTE_AUTOSAVE_MS = 650;
  const SECTION_LABELS = {
    focus: "Today's Focus",
    plan: "Today's Plan",
    notes: 'Notes',
    completed: 'Completed Today',
    additional: 'Coming Later',
  };
  const INTEGRATION_REGISTRY = [
    { id: 'calendar', label: 'Calendar', future: 'Calendar-aware plan context' },
    { id: 'weather', label: 'Weather', future: 'Local conditions once connected' },
    { id: 'gmail', label: 'Gmail', future: 'Important messages when connected' },
    { id: 'strava', label: 'Strava', future: 'Ride and recovery context' },
    { id: 'wahoo', label: 'Wahoo', future: 'Workout and ride data' },
  ];
  const DEFAULT_VISIBLE_SECTIONS = {
    focus: true,
    plan: true,
    notes: true,
    completed: true,
    additional: true,
    priorities: true,
    schedule: true,
    note: true,
    weather: true,
    email: true,
    training: true,
    integrations: true,
  };
  const DEFAULT_STATE = {
    version: 1,
    lastRefreshedAt: null,
    preferences: {
      preferredName: 'Chief',
      preferredLocation: '',
      visibleSections: DEFAULT_VISIBLE_SECTIONS,
      timeFormat: 'browser',
      showCompletedPriorities: true,
    },
    daily: {},
  };

  let briefingState = loadBriefingState();
  let currentDateKey = getLocalDateKey();
  let refreshInProgress = false;
  let initialized = false;
  let dayCheckTimerId = null;
  let clockTimerId = null;
  let settingsReturnFocus = null;
  let noteSaveTimerId = null;
  let noteSaveState = 'Saved';
  let draggedFocusId = null;

  const calendarProvider = createDisconnectedProvider('calendar');
  const weatherProvider = createDisconnectedProvider('weather');
  const emailProvider = createDisconnectedProvider('gmail');
  const trainingProvider = createDisconnectedProvider('training');

  function createDisconnectedProvider(id) {
    return {
      getStatus() {
        return { id, connected: false, status: 'not-connected' };
      },
      isConnected() {
        return false;
      },
      getTodayData() {
        return { state: 'disconnected', items: [] };
      },
      beginSetup() {
        openBriefingSettings(document.activeElement);
      },
    };
  }

  function createId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function cloneDefaultState() {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function mergeState(parsed) {
    const merged = cloneDefaultState();
    if (!parsed || typeof parsed !== 'object') return merged;
    merged.lastRefreshedAt = typeof parsed.lastRefreshedAt === 'string' ? parsed.lastRefreshedAt : null;
    merged.daily = parsed.daily && typeof parsed.daily === 'object' ? parsed.daily : {};
    if (parsed.preferences && typeof parsed.preferences === 'object') {
      merged.preferences = {
        ...merged.preferences,
        ...parsed.preferences,
        visibleSections: {
          ...DEFAULT_VISIBLE_SECTIONS,
          ...(parsed.preferences.visibleSections || {}),
        },
      };
    }
    if (!['browser', '12', '24'].includes(merged.preferences.timeFormat)) {
      merged.preferences.timeFormat = 'browser';
    }
    merged.preferences.preferredName = sanitizePlainText(merged.preferences.preferredName || 'Chief', 40) || 'Chief';
    merged.preferences.preferredLocation = sanitizePlainText(merged.preferences.preferredLocation || '', 80);
    merged.preferences.showCompletedPriorities = merged.preferences.showCompletedPriorities !== false;
    return merged;
  }

  function loadBriefingState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? mergeState(JSON.parse(raw)) : cloneDefaultState();
    } catch (error) {
      console.warn('Daily Chief Briefing storage could not be read.', error);
      return cloneDefaultState();
    }
  }

  function saveBriefingState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(briefingState));
    } catch (error) {
      console.warn('Daily Chief Briefing storage could not be saved.', error);
    }
  }

  function getDailyBriefingData(dateKey) {
    if (!briefingState.daily[dateKey] || typeof briefingState.daily[dateKey] !== 'object') {
      briefingState.daily[dateKey] = {
        priorities: [],
        note: '',
        scheduleItems: [],
        activityPlan: null,
      };
    }
    const day = briefingState.daily[dateKey];
    day.priorities = Array.isArray(day.priorities) ? day.priorities.map(normalizeFocusItem) : [];
    day.scheduleItems = Array.isArray(day.scheduleItems) ? day.scheduleItems.map(normalizePlanItem) : [];
    day.note = typeof day.note === 'string' ? day.note : '';
    day.activityPlan = day.activityPlan && typeof day.activityPlan === 'object' ? day.activityPlan : null;
    return day;
  }

  function normalizeFocusItem(item) {
    return {
      id: item.id || createId(),
      text: sanitizePlainText(item.text || item.title || '', MAX_FOCUS_LENGTH),
      note: sanitizePlainText(item.note || '', MAX_NOTE_LENGTH),
      priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : '',
      completed: Boolean(item.completed),
      createdAt: item.createdAt || new Date().toISOString(),
    };
  }

  function normalizePlanItem(item) {
    return {
      id: item.id || createId(),
      title: sanitizePlainText(item.title || '', MAX_TITLE_LENGTH),
      startTime: item.startTime || '',
      endTime: item.endTime || '',
      note: sanitizePlainText(item.note || '', MAX_NOTE_LENGTH),
      completed: Boolean(item.completed),
      createdAt: item.createdAt || new Date().toISOString(),
    };
  }

  function updateDailyBriefingData(dateKey, updates) {
    briefingState.daily[dateKey] = {
      ...getDailyBriefingData(dateKey),
      ...updates,
    };
    saveBriefingState();
  }

  function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function sanitizePlainText(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function sanitizeMultiline(value, maxLength) {
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

  function formatDate(date = new Date()) {
    return new Intl.DateTimeFormat(navigator.language || undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  function timeOptions(includeSeconds = false) {
    const pref = briefingState.preferences.timeFormat;
    const options = { hour: 'numeric', minute: '2-digit' };
    if (includeSeconds) options.second = '2-digit';
    if (pref === '12') options.hour12 = true;
    if (pref === '24') options.hour12 = false;
    return options;
  }

  function formatTime(date = new Date(), includeSeconds = false) {
    return new Intl.DateTimeFormat(navigator.language || undefined, timeOptions(includeSeconds)).format(date);
  }

  function formatPlanTime(item) {
    if (!item.startTime) return 'Anytime';
    const [hourValue, minuteValue] = item.startTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hourValue || 0, minuteValue || 0, 0, 0);
    const start = formatTime(date, false);
    if (!item.endTime) return start;
    const [endHour, endMinute] = item.endTime.split(':').map(Number);
    const endDate = new Date();
    endDate.setHours(endHour || 0, endMinute || 0, 0, 0);
    return `${start} - ${formatTime(endDate, false)}`;
  }

  function getGreeting(date = new Date()) {
    const hour = date.getHours();
    if (hour < 5) return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    if (hour < 22) return 'Good evening';
    return 'Good night';
  }

  function getRoot() {
    return document.getElementById('daily-chief-briefing-root');
  }

  function getSettingsDialog() {
    return document.getElementById('daily-chief-briefing-settings');
  }

  function isSectionVisible(section) {
    const prefs = briefingState.preferences.visibleSections;
    if (section === 'focus') return prefs.focus !== false && prefs.priorities !== false;
    if (section === 'plan') return prefs.plan !== false && prefs.schedule !== false;
    if (section === 'notes') return prefs.notes !== false && prefs.note !== false;
    if (section === 'completed') return prefs.completed !== false && briefingState.preferences.showCompletedPriorities !== false;
    if (section === 'additional') {
      return prefs.additional !== false && [prefs.weather, prefs.email, prefs.training, prefs.integrations].some((value) => value !== false);
    }
    return prefs[section] !== false;
  }

  function renderBriefing() {
    const root = getRoot();
    if (!root) return;
    const now = new Date();
    const day = getDailyBriefingData(currentDateKey);
    const name = briefingState.preferences.preferredName || 'Chief';
    root.innerHTML = `
      <div class="daily_briefing_morning">
        ${renderHeader(now, name)}
        <div class="daily_briefing_stack">
          ${isSectionVisible('focus') ? renderFocusSection(day) : ''}
          <div class="daily_briefing_notes_plan">
            ${isSectionVisible('plan') ? renderPlanSection(day) : ''}
            ${isSectionVisible('notes') ? renderNotesSection(day) : ''}
          </div>
          ${isSectionVisible('completed') ? renderCompletedSection(day) : ''}
          ${isSectionVisible('additional') ? renderAdditionalSection(day) : ''}
        </div>
        ${renderSettingsDialog()}
      </div>
    `;
  }

  function renderHeader(now, name) {
    return `
      <section class="daily_briefing_header" aria-labelledby="briefing-title">
        <div class="daily_briefing_header_main">
          <div class="daily_briefing_eyebrow">Daily Chief Briefing</div>
          <h1 id="briefing-title">${escapeHtml(getGreeting(now))}, ${escapeHtml(name)}.</h1>
          <div class="daily_briefing_date">${escapeHtml(formatDate(now))}</div>
          <div class="daily_briefing_time" data-briefing-clock aria-live="polite">${escapeHtml(formatTime(now, true))}</div>
        </div>
        <div class="daily_briefing_header_controls">
          <div class="daily_briefing_meta">Last refreshed: <span data-last-updated>${escapeHtml(formatLastUpdated())}</span></div>
          <div class="daily_briefing_actions">
            <button type="button" class="daily_briefing_button daily_briefing_button--quiet" data-briefing-action="refresh" ${refreshInProgress ? 'disabled' : ''}>Refresh</button>
            <button type="button" class="daily_briefing_icon_button" data-briefing-action="open-settings" aria-label="Daily Chief Briefing settings">⚙</button>
          </div>
        </div>
      </section>
    `;
  }

  function formatLastUpdated() {
    if (!briefingState.lastRefreshedAt) return 'Not yet';
    const date = new Date(briefingState.lastRefreshedAt);
    if (Number.isNaN(date.getTime())) return 'Not yet';
    return formatTime(date, true);
  }

  function renderCard(title, subtitle, count, body, extraClass = '') {
    return `
      <section class="daily_briefing_card ${extraClass}">
        <div class="daily_briefing_card_header">
          <div>
            <h2>${escapeHtml(title)}</h2>
            ${subtitle ? `<p class="daily_briefing_card_subtitle">${escapeHtml(subtitle)}</p>` : ''}
          </div>
          ${count ? `<span class="daily_briefing_count">${escapeHtml(count)}</span>` : ''}
        </div>
        ${body}
      </section>
    `;
  }

  function renderFocusSection(day) {
    const openItems = day.priorities.filter((item) => !item.completed);
    const completedItems = day.priorities.filter((item) => item.completed);
    const body = `
      <form class="daily_briefing_inline_form" data-briefing-form="focus">
        <label class="daily_briefing_label daily_briefing_label--title">Focus
          <input class="daily_briefing_field" name="title" maxlength="${MAX_FOCUS_LENGTH}" placeholder="What matters most today?">
        </label>
        <label class="daily_briefing_label daily_briefing_label--note">Note
          <input class="daily_briefing_field" name="note" maxlength="${MAX_NOTE_LENGTH}" placeholder="Optional context">
        </label>
        <label class="daily_briefing_label daily_briefing_label--priority">Priority
          <select class="daily_briefing_select" name="priority">
            <option value="">Normal</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <button type="submit" class="daily_briefing_button">Add</button>
      </form>
      ${openItems.length ? `<ul class="daily_briefing_list" data-focus-list>${openItems.map(renderFocusItem).join('')}</ul>` : renderFocusEmpty(day.priorities.length, completedItems.length)}
    `;
    return renderCard("Today's Focus", 'The few things that deserve your best attention.', openItems.length ? `${openItems.length} open` : '', body);
  }

  function renderFocusEmpty(totalCount, completedCount) {
    if (totalCount && completedCount === totalCount) {
      return '<div class="daily_briefing_complete_message"><span>✓</span><strong>Nice work, Chief. Everything for today is complete.</strong></div>';
    }
    return '<div class="daily_briefing_state"><strong>You have not chosen today’s focus yet.</strong><span>Start with one thing. You can add more if the day asks for it.</span></div>';
  }

  function renderFocusItem(item, index) {
    const priority = item.priority ? `<span class="daily_briefing_priority">${escapeHtml(item.priority)}</span>` : '';
    return `
      <li class="daily_briefing_item" data-focus-id="${escapeHtml(item.id)}" draggable="true">
        <button type="button" class="daily_briefing_checkbox" data-briefing-action="toggle-focus" aria-label="Complete focus item">✓</button>
        <div>
          <div class="daily_briefing_item_title">${escapeHtml(item.text)}</div>
          ${item.note ? `<div class="daily_briefing_item_note">${escapeHtml(item.note)}</div>` : ''}
        </div>
        <div class="daily_briefing_item_actions">
          ${priority}
          <button type="button" class="daily_briefing_button daily_briefing_button--tiny" data-briefing-action="move-focus-up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="daily_briefing_button daily_briefing_button--tiny" data-briefing-action="move-focus-down">↓</button>
          <button type="button" class="daily_briefing_button daily_briefing_button--tiny daily_briefing_button--quiet" data-briefing-action="delete-focus">Delete</button>
        </div>
      </li>
    `;
  }

  function renderPlanSection(day) {
    const items = [...day.scheduleItems].sort(comparePlanItems);
    const body = `
      <form class="daily_briefing_plan_form" data-briefing-form="plan">
        <label class="daily_briefing_label">What is part of today?
          <input class="daily_briefing_field" name="title" maxlength="${MAX_TITLE_LENGTH}" placeholder="Ride, deep work, family dinner">
        </label>
        <div class="daily_briefing_form_row">
          <label class="daily_briefing_label">Start
            <input class="daily_briefing_field" name="startTime" type="time">
          </label>
          <label class="daily_briefing_label">End
            <input class="daily_briefing_field" name="endTime" type="time">
          </label>
        </div>
        <label class="daily_briefing_label">Note
          <input class="daily_briefing_field" name="note" maxlength="${MAX_NOTE_LENGTH}" placeholder="Optional">
        </label>
        <button type="submit" class="daily_briefing_button">Add to Plan</button>
      </form>
      ${items.length ? `<div class="daily_briefing_timeline">${items.map(renderPlanItem).join('')}</div>` : '<div class="daily_briefing_state"><strong>Nothing planned yet.</strong><span>Add a simple morning, afternoon, or evening marker when you know the shape of the day.</span></div>'}
    `;
    return renderCard("Today's Plan", 'A lightweight timeline, not a calendar.', items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : '', body);
  }

  function comparePlanItems(a, b) {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.startTime) return -1;
    if (b.startTime) return 1;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  }

  function renderPlanItem(item) {
    return `
      <div class="daily_briefing_item daily_briefing_timeline_item ${item.completed ? 'is-complete' : ''}" data-plan-id="${escapeHtml(item.id)}">
        <div class="daily_briefing_timeline_time">${escapeHtml(formatPlanTime(item))}</div>
        <div>
          <div class="daily_briefing_item_title">${escapeHtml(item.title)}</div>
          ${item.note ? `<div class="daily_briefing_item_note">${escapeHtml(item.note)}</div>` : ''}
        </div>
        <div class="daily_briefing_item_actions">
          <button type="button" class="daily_briefing_button daily_briefing_button--tiny" data-briefing-action="toggle-plan">${item.completed ? 'Reopen' : 'Done'}</button>
          <button type="button" class="daily_briefing_button daily_briefing_button--tiny daily_briefing_button--quiet" data-briefing-action="delete-plan">Delete</button>
        </div>
      </div>
    `;
  }

  function renderNotesSection(day) {
    return renderCard('Notes', '', '', `
      <label class="daily_briefing_label" for="briefing-note">Today’s notebook</label>
      <textarea class="daily_briefing_textarea" id="briefing-note" maxlength="1000" placeholder="Capture today’s thoughts...">${escapeHtml(day.note)}</textarea>
      <div class="daily_briefing_save_state" data-note-status>${escapeHtml(noteSaveState)}</div>
    `);
  }

  function renderCompletedSection(day) {
    const completed = day.priorities.filter((item) => item.completed);
    const content = completed.length
      ? `<ul class="daily_briefing_list">${completed.map(renderCompletedFocusItem).join('')}</ul>`
      : '<div class="daily_briefing_state"><strong>Nothing completed yet.</strong><span>Progress will collect here quietly as you check things off.</span></div>';
    return `
      <details class="daily_briefing_details">
        <summary class="daily_briefing_summary">Completed Today <span>${completed.length} done</span></summary>
        <div class="daily_briefing_details_body">${content}</div>
      </details>
    `;
  }

  function renderCompletedFocusItem(item) {
    return `
      <li class="daily_briefing_item is-complete" data-focus-id="${escapeHtml(item.id)}">
        <button type="button" class="daily_briefing_checkbox is-checked" data-briefing-action="toggle-focus" aria-label="Reopen completed focus item">✓</button>
        <div>
          <div class="daily_briefing_item_title">${escapeHtml(item.text)}</div>
          ${item.note ? `<div class="daily_briefing_item_note">${escapeHtml(item.note)}</div>` : ''}
        </div>
        <div class="daily_briefing_item_actions">
          <button type="button" class="daily_briefing_button daily_briefing_button--tiny daily_briefing_button--quiet" data-briefing-action="delete-focus">Delete</button>
        </div>
      </li>
    `;
  }

  function renderAdditionalSection(day) {
    const prefs = briefingState.preferences.visibleSections;
    const modules = [];
    if (prefs.weather !== false) modules.push(renderWeatherModule());
    if (prefs.training !== false) modules.push(renderTrainingModule(day));
    if (prefs.email !== false) modules.push(renderEmailModule());
    if (prefs.integrations !== false) modules.push(renderIntegrationModule());
    if (!modules.length) return '';
    return `
      <details class="daily_briefing_details">
        <summary class="daily_briefing_summary">Coming Later <span>Weather, email, training, integrations</span></summary>
        <div class="daily_briefing_details_body">${modules.join('')}</div>
      </details>
    `;
  }

  function renderWeatherModule() {
    const location = briefingState.preferences.preferredLocation;
    const message = location
      ? `Weather data for ${location} is not connected yet.`
      : 'Add a preferred location in settings. No weather is fetched in this preview.';
    return `
      <section class="daily_briefing_module">
        <h3>Weather</h3>
        <p>${escapeHtml(message)}</p>
        <div class="daily_briefing_compact_actions">
          <button type="button" class="daily_briefing_button daily_briefing_button--tiny daily_briefing_button--quiet" data-briefing-action="setup-weather">${location ? 'Edit Location' : 'Set Location'}</button>
        </div>
      </section>
    `;
  }

  function renderTrainingModule(day) {
    const plan = day.activityPlan;
    return `
      <section class="daily_briefing_module">
        <h3>Training & Ride</h3>
        <p>${plan ? escapeHtml(`Local plan: ${plan.title}`) : 'Strava and Wahoo are not connected. Add ride context to Today’s Plan for now.'}</p>
      </section>
    `;
  }

  function renderEmailModule() {
    return `
      <section class="daily_briefing_module">
        <h3>Email Attention</h3>
        <p>Gmail is not connected. Important messages will stay out of the main briefing until that is real.</p>
      </section>
    `;
  }

  function renderIntegrationModule() {
    const rows = INTEGRATION_REGISTRY.map((entry) => {
      const localOnly = entry.id === 'weather' && briefingState.preferences.preferredLocation;
      return `${entry.label}: ${localOnly ? 'Local setup only' : 'Not connected'}`;
    }).join(' · ');
    return `
      <section class="daily_briefing_module">
        <h3>Integration Status</h3>
        <p>${escapeHtml(rows)}</p>
      </section>
    `;
  }

  function renderSettingsDialog() {
    const prefs = briefingState.preferences;
    const visibleKeys = Object.keys(SECTION_LABELS);
    const sections = visibleKeys.map((key) => `
      <label class="daily_briefing_check">
        <span>${escapeHtml(SECTION_LABELS[key])}</span>
        <input type="checkbox" name="section-${escapeHtml(key)}" ${isSectionVisible(key) ? 'checked' : ''}>
      </label>
    `).join('');
    return `
      <dialog class="daily_briefing_dialog" id="daily-chief-briefing-settings" aria-labelledby="briefing-settings-title">
        <form method="dialog" class="daily_briefing_dialog_body" data-briefing-form="settings">
          <div class="daily_briefing_dialog_header">
            <div>
              <h2 id="briefing-settings-title">Settings</h2>
              <p>Daily Chief Briefing data stays local in this browser.</p>
            </div>
            <button type="button" class="daily_briefing_dialog_close" data-briefing-action="close-settings" aria-label="Close settings">×</button>
          </div>
          <div class="daily_briefing_settings_grid">
            <label class="daily_briefing_label">Preferred name
              <input class="daily_briefing_field" name="preferredName" maxlength="40" value="${escapeHtml(prefs.preferredName)}">
            </label>
            <label class="daily_briefing_label">Time format
              <select class="daily_briefing_select" name="timeFormat">
                <option value="browser" ${prefs.timeFormat === 'browser' ? 'selected' : ''}>Browser default</option>
                <option value="12" ${prefs.timeFormat === '12' ? 'selected' : ''}>12-hour</option>
                <option value="24" ${prefs.timeFormat === '24' ? 'selected' : ''}>24-hour</option>
              </select>
            </label>
            <label class="daily_briefing_label">Preferred location
              <input class="daily_briefing_field" name="preferredLocation" maxlength="80" value="${escapeHtml(prefs.preferredLocation)}" placeholder="City, state, or ZIP">
            </label>
          </div>
          <div class="daily_briefing_settings_group">
            <h3>Visible Sections</h3>
            <div class="daily_briefing_checks">${sections}</div>
            <label class="daily_briefing_check">
              <span>Show completed item section</span>
              <input type="checkbox" name="showCompletedPriorities" ${prefs.showCompletedPriorities ? 'checked' : ''}>
            </label>
          </div>
          <div class="daily_briefing_settings_group">
            <h3>Reset Daily Briefing</h3>
            <p>Removes only data stored under <code>${STORAGE_KEY}</code>. Digital Clock and other apps are left alone.</p>
            <div class="daily_briefing_actions">
              <button type="button" class="daily_briefing_button daily_briefing_button--danger" data-briefing-action="show-reset">Reset</button>
            </div>
            <div class="daily_briefing_reset_confirm" data-reset-confirm hidden>
              <p>Confirm reset?</p>
              <div class="daily_briefing_actions">
                <button type="button" class="daily_briefing_button daily_briefing_button--danger" data-briefing-action="confirm-reset">Confirm Reset</button>
                <button type="button" class="daily_briefing_button daily_briefing_button--quiet" data-briefing-action="cancel-reset">Cancel</button>
              </div>
            </div>
          </div>
          <div class="daily_briefing_settings_actions">
            <button type="submit" class="daily_briefing_button">Save</button>
            <button type="button" class="daily_briefing_button daily_briefing_button--quiet" data-briefing-action="close-settings">Close</button>
          </div>
        </form>
      </dialog>
    `;
  }

  async function refreshBriefing() {
    if (refreshInProgress) return;
    refreshInProgress = true;
    renderBriefing();
    try {
      briefingState = loadBriefingState();
      calendarProvider.getStatus();
      weatherProvider.getStatus();
      emailProvider.getStatus();
      trainingProvider.getStatus();
      briefingState.lastRefreshedAt = new Date().toISOString();
      saveBriefingState();
    } catch (error) {
      console.warn('Daily Chief Briefing refresh failed.', error);
    } finally {
      refreshInProgress = false;
      renderBriefing();
    }
  }

  function updateLiveClock() {
    const clock = document.querySelector('[data-briefing-clock]');
    if (clock) clock.textContent = formatTime(new Date(), true);
  }

  function checkForDayChange() {
    const latestKey = getLocalDateKey();
    if (latestKey !== currentDateKey) {
      currentDateKey = latestKey;
      getDailyBriefingData(currentDateKey);
      noteSaveState = 'Saved';
      saveBriefingState();
      renderBriefing();
    }
  }

  function openBriefingSettings(trigger) {
    settingsReturnFocus = trigger || document.activeElement;
    renderBriefing();
    const dialog = getSettingsDialog();
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    requestAnimationFrame(() => {
      dialog.querySelector('input, select, button')?.focus();
    });
  }

  function closeBriefingSettings() {
    const dialog = getSettingsDialog();
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    const returnTarget = settingsReturnFocus;
    settingsReturnFocus = null;
    if (returnTarget && typeof returnTarget.focus === 'function') {
      requestAnimationFrame(() => returnTarget.focus());
    }
  }

  function addFocusItem(form) {
    const text = sanitizePlainText(form.title.value, MAX_FOCUS_LENGTH);
    if (!text) {
      form.title.setCustomValidity('Choose a focus first.');
      form.title.reportValidity();
      return;
    }
    form.title.setCustomValidity('');
    const day = getDailyBriefingData(currentDateKey);
    updateDailyBriefingData(currentDateKey, {
      priorities: [
        ...day.priorities,
        {
          id: createId(),
          text,
          note: sanitizePlainText(form.note.value, MAX_NOTE_LENGTH),
          priority: ['high', 'medium', 'low'].includes(form.priority.value) ? form.priority.value : '',
          completed: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    renderBriefing();
  }

  function updateFocusItems(updater) {
    const day = getDailyBriefingData(currentDateKey);
    updateDailyBriefingData(currentDateKey, { priorities: updater([...day.priorities]) });
    renderBriefing();
  }

  function addPlanItem(form) {
    const title = sanitizePlainText(form.title.value, MAX_TITLE_LENGTH);
    if (!title) {
      form.title.setCustomValidity('Add something to today’s plan first.');
      form.title.reportValidity();
      return;
    }
    form.title.setCustomValidity('');
    const day = getDailyBriefingData(currentDateKey);
    const item = normalizePlanItem({
      id: createId(),
      title,
      startTime: form.startTime.value || '',
      endTime: form.endTime.value || '',
      note: sanitizePlainText(form.note.value, MAX_NOTE_LENGTH),
      completed: false,
      createdAt: new Date().toISOString(),
    });
    updateDailyBriefingData(currentDateKey, {
      scheduleItems: [...day.scheduleItems, item].sort(comparePlanItems),
    });
    renderBriefing();
  }

  function saveNote(value) {
    const day = getDailyBriefingData(currentDateKey);
    updateDailyBriefingData(currentDateKey, {
      note: sanitizeMultiline(value, 1000),
      priorities: day.priorities,
      scheduleItems: day.scheduleItems,
    });
  }

  function scheduleNoteAutosave(value) {
    clearTimeout(noteSaveTimerId);
    noteSaveState = 'Edited';
    const status = document.querySelector('[data-note-status]');
    if (status) status.textContent = noteSaveState;
    noteSaveTimerId = setTimeout(() => {
      noteSaveState = 'Saving...';
      const nextStatus = document.querySelector('[data-note-status]');
      if (nextStatus) nextStatus.textContent = noteSaveState;
      saveNote(value);
      noteSaveState = 'Saved';
      const savedStatus = document.querySelector('[data-note-status]');
      if (savedStatus) savedStatus.textContent = noteSaveState;
    }, NOTE_AUTOSAVE_MS);
  }

  function saveSettings(form) {
    const visibleSections = {
      ...briefingState.preferences.visibleSections,
      focus: Boolean(form.elements['section-focus']?.checked),
      priorities: Boolean(form.elements['section-focus']?.checked),
      plan: Boolean(form.elements['section-plan']?.checked),
      schedule: Boolean(form.elements['section-plan']?.checked),
      notes: Boolean(form.elements['section-notes']?.checked),
      note: Boolean(form.elements['section-notes']?.checked),
      completed: Boolean(form.elements['section-completed']?.checked),
      additional: Boolean(form.elements['section-additional']?.checked),
    };
    briefingState.preferences = {
      ...briefingState.preferences,
      preferredName: sanitizePlainText(form.preferredName.value, 40) || 'Chief',
      preferredLocation: sanitizePlainText(form.preferredLocation.value, 80),
      timeFormat: ['browser', '12', '24'].includes(form.timeFormat.value) ? form.timeFormat.value : 'browser',
      showCompletedPriorities: Boolean(form.showCompletedPriorities.checked),
      visibleSections,
    };
    saveBriefingState();
    closeBriefingSettings();
    renderBriefing();
  }

  function resetBriefingData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Daily Chief Briefing storage could not be reset.', error);
    }
    briefingState = cloneDefaultState();
    currentDateKey = getLocalDateKey();
    noteSaveState = 'Saved';
    closeBriefingSettings();
    renderBriefing();
  }

  function moveItem(items, id, direction) {
    const index = items.findIndex((item) => item.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
    const copy = [...items];
    [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
    return copy;
  }

  function handleSubmit(event) {
    const form = event.target.closest('[data-briefing-form]');
    if (!form) return;
    event.preventDefault();
    const type = form.dataset.briefingForm;
    if (type === 'focus') addFocusItem(form);
    if (type === 'plan') addPlanItem(form);
    if (type === 'settings') saveSettings(form);
  }

  function handleInput(event) {
    if (event.target.id === 'briefing-note') {
      scheduleNoteAutosave(event.target.value);
    }
  }

  function handleClick(event) {
    const button = event.target.closest('[data-briefing-action]');
    if (!button) return;
    const action = button.dataset.briefingAction;
    const focusId = button.closest('[data-focus-id]')?.dataset.focusId;
    const planId = button.closest('[data-plan-id]')?.dataset.planId;
    if (action === 'refresh') refreshBriefing();
    if (action === 'open-settings') openBriefingSettings(button);
    if (action === 'close-settings') closeBriefingSettings();
    if (action === 'setup-weather') weatherProvider.beginSetup();
    if (action === 'show-reset') button.closest('.daily_briefing_settings_group')?.querySelector('[data-reset-confirm]')?.removeAttribute('hidden');
    if (action === 'cancel-reset') button.closest('[data-reset-confirm]')?.setAttribute('hidden', '');
    if (action === 'confirm-reset') resetBriefingData();
    if (action === 'toggle-focus' && focusId) {
      updateFocusItems((items) => items.map((item) => item.id === focusId ? { ...item, completed: !item.completed } : item));
    }
    if (action === 'delete-focus' && focusId) {
      updateFocusItems((items) => items.filter((item) => item.id !== focusId));
    }
    if (action === 'move-focus-up' && focusId) {
      updateFocusItems((items) => moveItem(items, focusId, -1));
    }
    if (action === 'move-focus-down' && focusId) {
      updateFocusItems((items) => moveItem(items, focusId, 1));
    }
    if (action === 'toggle-plan' && planId) {
      const day = getDailyBriefingData(currentDateKey);
      updateDailyBriefingData(currentDateKey, {
        scheduleItems: day.scheduleItems.map((item) => item.id === planId ? { ...item, completed: !item.completed } : item),
      });
      renderBriefing();
    }
    if (action === 'delete-plan' && planId) {
      const day = getDailyBriefingData(currentDateKey);
      updateDailyBriefingData(currentDateKey, {
        scheduleItems: day.scheduleItems.filter((item) => item.id !== planId),
      });
      renderBriefing();
    }
  }

  function handleDragStart(event) {
    const item = event.target.closest('[data-focus-id]');
    if (!item) return;
    draggedFocusId = item.dataset.focusId;
    item.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedFocusId);
  }

  function handleDragOver(event) {
    if (!draggedFocusId || !event.target.closest('[data-focus-list]')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(event) {
    const target = event.target.closest('[data-focus-id]');
    if (!draggedFocusId || !target || target.dataset.focusId === draggedFocusId) return;
    event.preventDefault();
    const targetId = target.dataset.focusId;
    updateFocusItems((items) => {
      const draggedIndex = items.findIndex((item) => item.id === draggedFocusId);
      const targetIndex = items.findIndex((item) => item.id === targetId);
      if (draggedIndex < 0 || targetIndex < 0) return items;
      const copy = [...items];
      const [dragged] = copy.splice(draggedIndex, 1);
      copy.splice(targetIndex, 0, dragged);
      return copy;
    });
    draggedFocusId = null;
  }

  function handleDragEnd(event) {
    event.target.closest('[data-focus-id]')?.classList.remove('is-dragging');
    draggedFocusId = null;
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && getSettingsDialog()?.open) {
      event.preventDefault();
      closeBriefingSettings();
    }
  }

  function initDailyChiefBriefing() {
    if (initialized || !getRoot()) return;
    initialized = true;
    getDailyBriefingData(currentDateKey);
    renderBriefing();
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('click', handleClick);
    document.addEventListener('input', handleInput);
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);
    document.addEventListener('keydown', handleKeydown);
    clockTimerId = setInterval(updateLiveClock, 1000);
    dayCheckTimerId = setInterval(checkForDayChange, 60 * 1000);
  }

  document.addEventListener('DOMContentLoaded', initDailyChiefBriefing);

  window.DailyChiefBriefing = {
    loadBriefingState,
    saveBriefingState,
    getDailyBriefingData,
    updateDailyBriefingData,
    getLocalDateKey,
    calendarProvider,
    weatherProvider,
    emailProvider,
    trainingProvider,
  };
})();
