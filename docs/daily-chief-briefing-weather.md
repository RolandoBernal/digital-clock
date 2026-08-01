# Daily Chief Briefing Weather

Weather is implemented as part of Daily Chief Briefing and as a compact summary on the Lando's World launcher card. It is not a standalone weather app.

## Provider

Weather uses Open-Meteo:

- Forecast API: `https://api.open-meteo.com/v1/forecast`
- Geocoding API: `https://geocoding-api.open-meteo.com/v1/search`

Open-Meteo does not require a client-side API key for this usage, so the feature works on GitHub Pages without a private weather backend.

## Architecture

Provider-specific request, cache, geocoding, condition-code, and normalization logic lives in:

- `js/weather-service.js`

The UI consumes the normalized `WeatherSnapshot` shape exposed through `window.LandosWeatherService`.

The launcher card renders its compact weather summary in the Lando's World launcher script inside `index-digital-clock.html`.

The full Daily Chief Briefing weather section is rendered in `js/daily-chief-briefing.js`.

## Location Resolution

Daily Chief Briefing uses the saved `preferredLocation` value from the Daily Chief Briefing settings as the weather location. The settings label is "Weather Location", but the storage key remains `preferredLocation` for compatibility with the existing app data.

Resolution order:

1. Saved Daily Chief Briefing weather location.
2. Cached coordinates for that saved location.
3. A calm "Set your weather location" state.

The app does not automatically request browser geolocation.

## Cache Behavior

Weather cache key:

- `daily_chief_weather_cache_v1`

Geocoding cache key:

- `daily_chief_weather_geocode_cache_v1`

The forecast freshness window is 20 minutes. Fresh cached data is used immediately. Stale cached data remains visible while a refresh is attempted. If the refresh fails, the stale snapshot remains available with a subtle stale indication.

The launcher card and the full briefing both use the same weather service and cache, so opening the briefing moments after the launcher loads should not create a duplicate identical request.

## Normalized Model

The internal snapshot model includes:

- Location name and coordinates
- Timezone
- Current temperature
- Feels-like temperature
- Current condition code, label, and icon
- Today's high and low
- Precipitation probability
- Wind speed
- Morning, afternoon, and evening daypart forecasts
- Fetch timestamp
- Deterministic weather callout

The UI should not render raw Open-Meteo payloads directly.

## Error Behavior

Weather is an enhancement. If location resolution or forecast fetch fails:

- The Daily Chief Briefing still opens.
- Imported or generated briefing content still renders.
- The full weather section shows "Weather unavailable right now" if no cache exists.
- The launcher card either omits weather or shows a compact unavailable state.
- Valid cached weather is not deleted because of a temporary network failure.

## Provider Replacement

To replace Open-Meteo later, keep the public `LandosWeatherService` methods and `WeatherSnapshot` shape stable, then swap the provider-specific implementation inside `js/weather-service.js`.
