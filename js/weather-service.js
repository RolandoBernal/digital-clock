((global) => {
  const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
  const CACHE_KEY = 'daily_chief_weather_cache_v1';
  const GEOCODE_CACHE_KEY = 'daily_chief_weather_geocode_cache_v1';
  const DEFAULT_TTL_MS = 20 * 60 * 1000;
  const DAYPART_HOURS = {
    Morning: 8,
    Afternoon: 14,
    Evening: 19,
  };
  const inFlight = new Map();

  const CONDITION_MAP = new Map([
    [0, ['Clear', '☀️']],
    [1, ['Mostly clear', '🌤️']],
    [2, ['Partly cloudy', '⛅']],
    [3, ['Cloudy', '☁️']],
    [45, ['Fog', '🌫️']],
    [48, ['Fog', '🌫️']],
    [51, ['Light drizzle', '🌦️']],
    [53, ['Drizzle', '🌦️']],
    [55, ['Heavy drizzle', '🌧️']],
    [56, ['Freezing drizzle', '🌧️']],
    [57, ['Freezing drizzle', '🌧️']],
    [61, ['Light rain', '🌦️']],
    [63, ['Rain', '🌧️']],
    [65, ['Heavy rain', '🌧️']],
    [66, ['Freezing rain', '🌧️']],
    [67, ['Freezing rain', '🌧️']],
    [71, ['Light snow', '🌨️']],
    [73, ['Snow', '🌨️']],
    [75, ['Heavy snow', '❄️']],
    [77, ['Snow grains', '❄️']],
    [80, ['Rain showers', '🌦️']],
    [81, ['Rain showers', '🌧️']],
    [82, ['Heavy rain showers', '🌧️']],
    [85, ['Snow showers', '🌨️']],
    [86, ['Heavy snow showers', '❄️']],
    [95, ['Thunderstorm', '⛈️']],
    [96, ['Thunderstorm with hail', '⛈️']],
    [99, ['Thunderstorm with hail', '⛈️']],
  ]);

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(global.localStorage?.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      global.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }

  function normalizeLocationQuery(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function locationCacheKey(locationName) {
    return normalizeLocationQuery(locationName).toLowerCase();
  }

  function getCondition(code) {
    const [label, icon] = CONDITION_MAP.get(Number(code)) || ['Current conditions', '🌤️'];
    return {
      code: Number.isFinite(Number(code)) ? Number(code) : null,
      label,
      icon,
    };
  }

  function round(value) {
    return Number.isFinite(Number(value)) ? Math.round(Number(value)) : null;
  }

  function maxNumber(values) {
    const numbers = values.map(Number).filter(Number.isFinite);
    return numbers.length ? Math.max(...numbers) : null;
  }

  function findNearestHourIndex(times, targetHour) {
    if (!Array.isArray(times) || !times.length) return -1;
    let bestIndex = 0;
    let bestDistance = Infinity;
    times.forEach((time, index) => {
      const hourMatch = String(time).match(/T(\d{2})/);
      if (!hourMatch) return;
      const distance = Math.abs(Number(hourMatch[1]) - targetHour);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function createDaypartForecast(label, hourly) {
    const index = findNearestHourIndex(hourly.time, DAYPART_HOURS[label]);
    if (index < 0) return null;
    const condition = getCondition(hourly.weather_code?.[index]);
    return {
      label,
      representativeTime: hourly.time[index],
      temperature: round(hourly.temperature_2m?.[index]),
      conditionCode: condition.code,
      conditionLabel: condition.label,
      conditionIcon: condition.icon,
      precipitationProbability: round(hourly.precipitation_probability?.[index]),
    };
  }

  function createWeatherCallout(snapshot, hourly) {
    const precipValues = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [];
    const maxPrecip = maxNumber(precipValues);
    if (maxPrecip == null || maxPrecip < 20) {
      return 'No meaningful rain is expected today.';
    }
    const wettestIndex = precipValues.findIndex((value) => Number(value) === maxPrecip);
    const wettestTime = hourly.time?.[wettestIndex];
    const hourMatch = String(wettestTime || '').match(/T(\d{2})/);
    if (hourMatch) {
      const date = new Date();
      date.setHours(Number(hourMatch[1]), 0, 0, 0);
      const label = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(date);
      return `Rain is most likely around ${label}.`;
    }
    const warmest = maxNumber(hourly.temperature_2m || []);
    if (warmest != null && snapshot.todayHigh != null && warmest >= snapshot.todayHigh - 1) {
      return 'The warmest part of the day is reflected in the afternoon forecast.';
    }
    return 'Rain chances are worth keeping an eye on today.';
  }

  function formatLocationName(result, fallback) {
    return [
      result?.name,
      result?.admin1,
      result?.country_code || result?.country,
    ].filter(Boolean).join(', ') || fallback;
  }

  async function geocodeLocation(locationName, options = {}) {
    const normalized = normalizeLocationQuery(locationName);
    if (!normalized) {
      throw new Error('Set your weather location first.');
    }
    const cache = readJson(GEOCODE_CACHE_KEY, {});
    const key = locationCacheKey(normalized);
    if (cache[key]?.latitude != null && cache[key]?.longitude != null) {
      return cache[key];
    }
    const url = `${GEOCODING_ENDPOINT}?name=${encodeURIComponent(normalized)}&count=1&language=en&format=json`;
    const response = await global.fetch(url, { signal: options.signal });
    if (!response.ok) throw new Error('Weather location could not be resolved.');
    const payload = await response.json();
    const result = payload?.results?.[0];
    if (!result || result.latitude == null || result.longitude == null) {
      throw new Error('Weather location could not be resolved.');
    }
    const resolved = {
      locationIdentifier: key,
      locationName: formatLocationName(result, normalized),
      latitude: Number(result.latitude),
      longitude: Number(result.longitude),
      timezone: result.timezone || 'auto',
    };
    writeJson(GEOCODE_CACHE_KEY, { ...cache, [key]: resolved });
    return resolved;
  }

  function buildForecastUrl(location, unitSystem = 'imperial') {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,apparent_temperature,weather_code,precipitation_probability,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      forecast_days: '1',
      timezone: 'auto',
      temperature_unit: unitSystem === 'metric' ? 'celsius' : 'fahrenheit',
      wind_speed_unit: unitSystem === 'metric' ? 'kmh' : 'mph',
    });
    return `${FORECAST_ENDPOINT}?${params.toString()}`;
  }

  function normalizeForecastPayload(payload, location, unitSystem = 'imperial', fetchedAt = Date.now()) {
    const current = payload?.current || {};
    const hourly = payload?.hourly || {};
    const daily = payload?.daily || {};
    const condition = getCondition(current.weather_code);
    const snapshot = {
      locationIdentifier: location.locationIdentifier,
      locationName: location.locationName,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: payload?.timezone || location.timezone || '',
      unitSystem,
      temperatureUnit: unitSystem === 'metric' ? '°C' : '°F',
      windSpeedUnit: unitSystem === 'metric' ? 'km/h' : 'mph',
      currentTemperature: round(current.temperature_2m),
      apparentTemperature: round(current.apparent_temperature),
      currentConditionCode: condition.code,
      currentConditionLabel: condition.label,
      currentConditionIcon: condition.icon,
      todayHigh: round(daily.temperature_2m_max?.[0]),
      todayLow: round(daily.temperature_2m_min?.[0]),
      precipitationProbability: round(daily.precipitation_probability_max?.[0] ?? maxNumber(hourly.precipitation_probability || [])),
      windSpeed: round(current.wind_speed_10m),
      morningForecast: createDaypartForecast('Morning', hourly),
      afternoonForecast: createDaypartForecast('Afternoon', hourly),
      eveningForecast: createDaypartForecast('Evening', hourly),
      fetchedAt,
      source: 'Open-Meteo',
      isStale: false,
    };
    snapshot.callout = createWeatherCallout(snapshot, hourly);
    return snapshot;
  }

  function readCache() {
    return readJson(CACHE_KEY, {});
  }

  function writeSnapshot(snapshot) {
    const cache = readCache();
    writeJson(CACHE_KEY, {
      ...cache,
      [snapshot.locationIdentifier]: snapshot,
    });
  }

  function readCachedSnapshot(locationIdentifier, ttlMs = DEFAULT_TTL_MS) {
    const snapshot = readCache()[locationIdentifier] || null;
    if (!snapshot?.fetchedAt) return null;
    return {
      ...snapshot,
      isStale: Date.now() - Number(snapshot.fetchedAt) >= ttlMs,
    };
  }

  function clearLocation(locationName) {
    const key = locationCacheKey(locationName);
    if (!key) return;
    const cache = readCache();
    if (cache[key]) {
      delete cache[key];
      writeJson(CACHE_KEY, cache);
    }
  }

  async function fetchForecastForLocation(location, options = {}) {
    const response = await global.fetch(buildForecastUrl(location, options.unitSystem), { signal: options.signal });
    if (!response.ok) throw new Error('Weather unavailable right now.');
    const payload = await response.json();
    return normalizeForecastPayload(payload, location, options.unitSystem, Date.now());
  }

  async function getWeather(locationName, options = {}) {
    const normalized = normalizeLocationQuery(locationName);
    if (!normalized) {
      return { status: 'needs-location', snapshot: null, error: 'Set your weather location first.' };
    }
    const location = await geocodeLocation(normalized, options);
    const cached = readCachedSnapshot(location.locationIdentifier, options.ttlMs);
    if (cached && !cached.isStale && !options.force) {
      return { status: 'ready', snapshot: cached, stale: false };
    }
    const flightKey = `${location.locationIdentifier}:${options.unitSystem || 'imperial'}`;
    if (inFlight.has(flightKey)) {
      return inFlight.get(flightKey);
    }
    const request = fetchForecastForLocation(location, options)
      .then((snapshot) => {
        writeSnapshot(snapshot);
        return { status: 'ready', snapshot, stale: false };
      })
      .catch((error) => {
        if (cached) {
          return { status: 'stale', snapshot: cached, stale: true, error: error.message };
        }
        return { status: 'error', snapshot: null, error: error.message || 'Weather unavailable right now.' };
      })
      .finally(() => {
        inFlight.delete(flightKey);
      });
    inFlight.set(flightKey, request);
    return request;
  }

  function getCachedWeather(locationName, options = {}) {
    const key = locationCacheKey(locationName);
    return key ? readCachedSnapshot(key, options.ttlMs) : null;
  }

  global.LandosWeatherService = {
    CACHE_KEY,
    GEOCODE_CACHE_KEY,
    DEFAULT_TTL_MS,
    normalizeLocationQuery,
    getCondition,
    normalizeForecastPayload,
    createDaypartForecast,
    createWeatherCallout,
    geocodeLocation,
    getWeather,
    getCachedWeather,
    clearLocation,
    _test: {
      buildForecastUrl,
      findNearestHourIndex,
      locationCacheKey,
      readCachedSnapshot,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
