(() => {
  const WEATHER_APP_PREFERENCES_KEY = 'weather_app_preferences_v1';
  const DAILY_CHIEF_DOCUMENTS_KEY = 'daily_chief_briefing_documents_v1';
  const DEFAULT_LOCATION = 'Nashville, Tennessee';
  const CACHE_RECHECK_MS = 20 * 60 * 1000;

  let state = {
    location: loadLocationPreference(),
    status: 'idle',
    snapshot: null,
    error: '',
    isRefreshing: false,
    lastVisibleRefreshAt: 0,
  };
  let initialized = false;

  function getRoot() {
    return document.getElementById('weather-root');
  }

  function loadLocationPreference() {
    try {
      const weatherPrefs = JSON.parse(localStorage.getItem(WEATHER_APP_PREFERENCES_KEY) || 'null');
      if (weatherPrefs?.location) return sanitizeLocation(weatherPrefs.location);
    } catch {
      /* ignore */
    }
    try {
      const briefingPrefs = JSON.parse(localStorage.getItem(DAILY_CHIEF_DOCUMENTS_KEY) || 'null');
      if (briefingPrefs?.preferences?.preferredLocation) {
        return sanitizeLocation(briefingPrefs.preferences.preferredLocation);
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_LOCATION;
  }

  function saveLocationPreference(location) {
    const clean = sanitizeLocation(location) || DEFAULT_LOCATION;
    state.location = clean;
    try {
      localStorage.setItem(WEATHER_APP_PREFERENCES_KEY, JSON.stringify({ location: clean }));
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new CustomEvent('weather:location-changed', { detail: { location: clean } }));
  }

  function sanitizeLocation(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  }

  function getUnitSystem() {
    try {
      const parsed = JSON.parse(localStorage.getItem('digit_clock_preferences_v1') || 'null');
      return parsed?.unit === 'C' ? 'metric' : 'imperial';
    } catch {
      return 'imperial';
    }
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat(navigator.language || undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp || Date.now()));
  }

  function formatValue(value, suffix = '') {
    return value == null ? '—' : `${value}${suffix}`;
  }

  function dayparts(snapshot) {
    return [
      snapshot?.morningForecast,
      snapshot?.afternoonForecast,
      snapshot?.eveningForecast,
      snapshot?.nightForecast,
    ].filter(Boolean);
  }

  function getRideNote(snapshot) {
    if (!snapshot) return '';
    const rain = Number(snapshot.precipitationProbability || 0);
    const high = Number(snapshot.todayHigh || snapshot.currentTemperature || 0);
    if (rain >= 45) return 'Rain expected later today.\nMorning is your best window.';
    if (high >= 88) return 'Warm afternoon.\nRide early if possible.';
    if (rain <= 15 && high <= 84) return 'Excellent morning riding weather.';
    return 'A calm window looks possible today.\nCheck conditions before heading out.';
  }

  function render() {
    const root = getRoot();
    if (!root) return;
    root.innerHTML = `
      <section class="weather_app" aria-labelledby="weather-title">
        ${renderHero()}
        ${renderMainContent()}
      </section>
    `;
  }

  function renderHero() {
    const snapshot = state.snapshot;
    const unit = snapshot?.temperatureUnit || '°F';
    const offlineNote = navigator.onLine === false && snapshot
      ? '<p class="weather_offline_note">Offline - showing last downloaded forecast.</p>'
      : '';
    return `
      <header class="weather_hero">
        <div class="weather_hero_topline">
          <form class="weather_location_form" data-weather-form="location">
            <label class="weather_visually_hidden" for="weather-location">Location</label>
            <input id="weather-location" name="location" value="${escapeHtml(state.location)}" maxlength="90" autocomplete="address-level2" aria-label="Weather location">
            <button type="submit" aria-label="Update weather location">Set</button>
          </form>
          <button type="button" class="weather_refresh_button" data-weather-action="refresh" ${state.isRefreshing ? 'disabled' : ''} aria-label="Refresh weather">${state.isRefreshing ? 'Refreshing' : 'Refresh'}</button>
        </div>
        ${state.status === 'loading' && !snapshot ? renderHeroSkeleton() : ''}
        ${state.status === 'error' && !snapshot ? renderErrorState() : ''}
        ${snapshot ? `
          <div class="weather_hero_content">
            <div>
              <p class="weather_location">${escapeHtml(snapshot.locationName || state.location)}</p>
              <h1 id="weather-title">Weather</h1>
              <div class="weather_current_temp">${escapeHtml(formatValue(snapshot.currentTemperature, unit))}</div>
              <p class="weather_condition"><span role="img" aria-label="${escapeHtml(snapshot.currentConditionLabel)}">${escapeHtml(snapshot.currentConditionIcon || '🌤️')}</span> ${escapeHtml(snapshot.currentConditionLabel || 'Current conditions')}</p>
            </div>
            <dl class="weather_current_details">
              ${renderDetail('Feels Like', formatValue(snapshot.apparentTemperature, unit))}
              ${renderDetail('High / Low', `${formatValue(snapshot.todayHigh, unit)} / ${formatValue(snapshot.todayLow, unit)}`)}
              ${renderDetail('Humidity', formatValue(snapshot.humidity, '%'))}
              ${renderDetail('Wind', formatValue(snapshot.windSpeed, ` ${snapshot.windSpeedUnit || 'mph'}`))}
              ${renderDetail('Rain', formatValue(snapshot.precipitationProbability, '%'))}
              ${renderDetail('Updated', formatTime(snapshot.fetchedAt))}
            </dl>
          </div>
          ${offlineNote}
        ` : ''}
      </header>
    `;
  }

  function renderMainContent() {
    if (!state.snapshot) return '';
    return `
      <main class="weather_sections">
        ${renderTodayForecast(state.snapshot)}
        ${renderWeeklyForecast(state.snapshot)}
        ${renderRideToday(state.snapshot)}
      </main>
    `;
  }

  function renderDetail(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function renderTodayForecast(snapshot) {
    return `
      <section class="weather_section" aria-labelledby="weather-today-title">
        <h2 id="weather-today-title">Today</h2>
        <div class="weather_dayparts">
          ${dayparts(snapshot).map(renderDaypartCard).join('')}
        </div>
      </section>
    `;
  }

  function renderDaypartCard(daypart) {
    const unit = state.snapshot?.temperatureUnit || '°F';
    return `
      <article class="weather_daypart_card">
        <span class="weather_card_label">${escapeHtml(daypart.label)}</span>
        <span class="weather_card_icon" role="img" aria-label="${escapeHtml(daypart.conditionLabel)}">${escapeHtml(daypart.conditionIcon || '🌤️')}</span>
        <strong>${escapeHtml(formatValue(daypart.temperature, unit))}</strong>
        <span>${escapeHtml(daypart.conditionLabel || 'Conditions')}</span>
        <small>Rain ${escapeHtml(formatValue(daypart.precipitationProbability, '%'))}</small>
      </article>
    `;
  }

  function renderWeeklyForecast(snapshot) {
    const unit = snapshot.temperatureUnit || '°F';
    const windUnit = snapshot.windSpeedUnit || 'mph';
    return `
      <section class="weather_section" aria-labelledby="weather-week-title">
        <h2 id="weather-week-title">This Week</h2>
        <div class="weather_week">
          ${(snapshot.weeklyForecast || []).map((day) => `
            <article class="weather_week_card">
              <span class="weather_card_label">${escapeHtml(day.label)}</span>
              <span class="weather_card_icon" role="img" aria-label="${escapeHtml(day.conditionLabel)}">${escapeHtml(day.conditionIcon || '🌤️')}</span>
              <strong>${escapeHtml(formatValue(day.high, unit))}</strong>
              <span class="weather_week_low">${escapeHtml(formatValue(day.low, unit))}</span>
              <span>${escapeHtml(day.conditionLabel || 'Conditions')}</span>
              <small>Rain ${escapeHtml(formatValue(day.precipitationProbability, '%'))} · Wind ${escapeHtml(formatValue(day.windSpeed, ` ${windUnit}`))}</small>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderRideToday(snapshot) {
    const lines = getRideNote(snapshot).split('\n').slice(0, 2);
    return `
      <section class="weather_ride" aria-labelledby="weather-ride-title">
        <h2 id="weather-ride-title">🚴 Ride Today</h2>
        ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
      </section>
    `;
  }

  function renderHeroSkeleton() {
    return `
      <div class="weather_skeleton" role="status" aria-live="polite">
        <span></span><span></span><span></span><span></span>
        <p>Loading weather...</p>
      </div>
    `;
  }

  function renderErrorState() {
    return `
      <div class="weather_error" role="status">
        <h1 id="weather-title">Weather</h1>
        <p>Weather cannot be loaded right now.</p>
        <button type="button" class="weather_refresh_button" data-weather-action="refresh">Retry</button>
      </div>
    `;
  }

  async function loadWeather(options = {}) {
    const service = window.LandosWeatherService;
    if (!service) return;
    const cached = service.getCachedWeather(state.location);
    if (cached && !options.force) {
      state = { ...state, status: cached.isStale ? 'stale' : 'ready', snapshot: cached, error: '' };
      render();
      if (!cached.isStale) return;
    } else if (!state.snapshot) {
      state = { ...state, status: 'loading', error: '' };
      render();
    }
    state = { ...state, isRefreshing: true };
    render();
    const result = await service.getWeather(state.location, {
      force: Boolean(options.force),
      unitSystem: getUnitSystem(),
      ttlMs: CACHE_RECHECK_MS,
    });
    state = {
      ...state,
      status: result.status,
      snapshot: result.snapshot,
      error: result.error || '',
      isRefreshing: false,
      lastVisibleRefreshAt: Date.now(),
    };
    render();
  }

  function handleSubmit(event) {
    const form = event.target.closest('[data-weather-form="location"]');
    if (!form) return;
    event.preventDefault();
    const nextLocation = sanitizeLocation(form.location.value);
    if (!nextLocation) return;
    if (nextLocation !== state.location) {
      window.LandosWeatherService?.clearLocation(state.location);
      saveLocationPreference(nextLocation);
      state = { ...state, status: 'loading', snapshot: null, error: '' };
    }
    loadWeather({ force: true });
  }

  function handleClick(event) {
    const button = event.target.closest('[data-weather-action]');
    if (!button) return;
    if (button.dataset.weatherAction === 'refresh') loadWeather({ force: true });
  }

  function handleVisibilityChange() {
    if (!document.hidden && Date.now() - state.lastVisibleRefreshAt > CACHE_RECHECK_MS) {
      loadWeather();
    }
  }

  function initWeatherApp() {
    if (initialized || !getRoot()) return;
    initialized = true;
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('click', handleClick);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', () => loadWeather({ force: true }));
    render();
    loadWeather();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  document.addEventListener('DOMContentLoaded', initWeatherApp);

  window.LandosWeatherApp = {
    loadWeather,
    getRideNote,
    loadLocationPreference,
  };
})();
