import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const serviceSource = readFileSync(new URL('../js/weather-service.js', import.meta.url), 'utf8');

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    dump: () => Object.fromEntries(store),
  };
}

function createService({ fetch, localStorage = createLocalStorage() } = {}) {
  const context = {
    console,
    Date,
    Intl,
    Map,
    Number,
    Promise,
    String,
    URLSearchParams,
    encodeURIComponent,
    fetch,
    localStorage,
  };
  context.globalThis = context;
  context.window = context;
  vm.runInNewContext(serviceSource, context);
  return { service: context.LandosWeatherService, localStorage };
}

function mockForecastPayload() {
  return {
    timezone: 'America/Chicago',
    current: {
      temperature_2m: 72.4,
      apparent_temperature: 73.2,
      relative_humidity_2m: 58,
      weather_code: 2,
      wind_speed_10m: 7.1,
    },
    daily: {
      time: [
        '2026-08-01',
        '2026-08-02',
        '2026-08-03',
        '2026-08-04',
        '2026-08-05',
        '2026-08-06',
        '2026-08-07',
      ],
      weather_code: [2, 1, 3, 61, 0, 2, 95],
      temperature_2m_max: [84.2, 86, 82, 79, 88, 87, 81],
      temperature_2m_min: [65.8, 66, 64, 62, 67, 69, 63],
      precipitation_probability_max: [30, 10, 15, 45, 5, 20, 60],
      wind_speed_10m_max: [9, 8, 10, 12, 7, 11, 15],
    },
    hourly: {
      time: [
        '2026-08-01T08:00',
        '2026-08-01T14:00',
        '2026-08-01T19:00',
        '2026-08-01T22:00',
      ],
      temperature_2m: [70.1, 83.8, 76.2, 71.5],
      apparent_temperature: [71, 84, 76, 72],
      weather_code: [1, 2, 63, 3],
      precipitation_probability: [5, 10, 30, 20],
      wind_speed_10m: [4, 7, 5, 3],
    },
  };
}

test('maps Open-Meteo condition codes to user-facing labels and icons', () => {
  const { service } = createService();
  const clear = service.getCondition(0);
  const storm = service.getCondition(95);
  assert.equal(clear.code, 0);
  assert.equal(clear.label, 'Clear');
  assert.equal(clear.icon, '☀️');
  assert.equal(storm.code, 95);
  assert.equal(storm.label, 'Thunderstorm');
  assert.equal(storm.icon, '⛈️');
});

test('normalizes forecast payload into the WeatherSnapshot model', () => {
  const { service } = createService();
  const snapshot = service.normalizeForecastPayload(
    mockForecastPayload(),
    {
      locationIdentifier: 'nashville-tennessee',
      locationName: 'Nashville, Tennessee',
      latitude: 36.1627,
      longitude: -86.7816,
      timezone: 'America/Chicago',
    },
    'imperial',
    1785603900000,
  );

  assert.equal(snapshot.locationName, 'Nashville, Tennessee');
  assert.equal(snapshot.currentTemperature, 72);
  assert.equal(snapshot.apparentTemperature, 73);
  assert.equal(snapshot.humidity, 58);
  assert.equal(snapshot.currentConditionLabel, 'Partly cloudy');
  assert.equal(snapshot.todayHigh, 84);
  assert.equal(snapshot.todayLow, 66);
  assert.equal(snapshot.precipitationProbability, 30);
  assert.equal(snapshot.windSpeed, 7);
  assert.equal(snapshot.eveningForecast.conditionLabel, 'Rain');
  assert.equal(snapshot.nightForecast.conditionLabel, 'Cloudy');
  assert.equal(snapshot.weeklyForecast.length, 7);
  assert.equal(snapshot.weeklyForecast[0].label, 'Today');
  assert.equal(snapshot.weeklyForecast[3].conditionLabel, 'Light rain');
  assert.equal(snapshot.weeklyForecast[6].windSpeed, 15);
  assert.equal(snapshot.callout, 'Rain is most likely around 7 PM.');
});

test('selects compact daypart forecasts from representative hours', () => {
  const { service } = createService();
  const daypart = service.createDaypartForecast('Afternoon', mockForecastPayload().hourly);
  assert.equal(daypart.label, 'Afternoon');
  assert.equal(daypart.temperature, 84);
  assert.equal(daypart.conditionLabel, 'Partly cloudy');
  assert.equal(daypart.precipitationProbability, 10);
});

test('reports fresh and stale cached snapshots without deleting stale data', () => {
  const now = Date.now();
  const locationIdentifier = 'nashville tennessee';
  const localStorage = createLocalStorage({
    daily_chief_weather_cache_v1: JSON.stringify({
      [locationIdentifier]: {
        locationIdentifier,
        locationName: 'Nashville, Tennessee',
        fetchedAt: now - 60 * 60 * 1000,
      },
    }),
  });
  const { service } = createService({ localStorage });
  const snapshot = service.getCachedWeather('Nashville Tennessee', { ttlMs: 20 * 60 * 1000 });
  assert.equal(snapshot.locationName, 'Nashville, Tennessee');
  assert.equal(snapshot.isStale, true);
});

test('falls back to stale cache when a refresh fails', async () => {
  const locationIdentifier = 'nashville';
  const localStorage = createLocalStorage({
    daily_chief_weather_geocode_cache_v1: JSON.stringify({
      [locationIdentifier]: {
        locationIdentifier,
        locationName: 'Nashville',
        latitude: 36.1627,
        longitude: -86.7816,
        timezone: 'America/Chicago',
      },
    }),
    daily_chief_weather_cache_v1: JSON.stringify({
      [locationIdentifier]: {
        locationIdentifier,
        locationName: 'Nashville',
        currentTemperature: 72,
        fetchedAt: Date.now() - 60 * 60 * 1000,
      },
    }),
  });
  const { service } = createService({
    localStorage,
    fetch: async () => {
      throw new Error('offline');
    },
  });

  const result = await service.getWeather('Nashville', { ttlMs: 20 * 60 * 1000 });
  assert.equal(result.status, 'stale');
  assert.equal(result.snapshot.currentTemperature, 72);
});

test('prevents duplicate simultaneous forecast requests for the same location', async () => {
  const locationIdentifier = 'nashville';
  const localStorage = createLocalStorage({
    daily_chief_weather_geocode_cache_v1: JSON.stringify({
      [locationIdentifier]: {
        locationIdentifier,
        locationName: 'Nashville',
        latitude: 36.1627,
        longitude: -86.7816,
        timezone: 'America/Chicago',
      },
    }),
  });
  let fetchCount = 0;
  const { service } = createService({
    localStorage,
    fetch: async () => {
      fetchCount += 1;
      return {
        ok: true,
        json: async () => mockForecastPayload(),
      };
    },
  });

  const [first, second] = await Promise.all([
    service.getWeather('Nashville'),
    service.getWeather('Nashville'),
  ]);

  assert.equal(first.status, 'ready');
  assert.equal(second.status, 'ready');
  assert.equal(fetchCount, 1);
});
