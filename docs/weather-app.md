# Weather App

Lando's World now treats Weather as its own app experience. The old Daily Chief Briefing UI is not loaded from the launcher; the `#/weather` route opens the dedicated Weather surface.

## Provider

Weather data comes from Open-Meteo:

- Forecast API: `https://api.open-meteo.com/v1/forecast`
- Geocoding API: `https://geocoding-api.open-meteo.com/v1/search`

No weather API key or weather backend is required.

## Architecture

Provider logic remains isolated in `js/weather-service.js`. The app UI lives in `js/weather-app.js` and consumes normalized weather snapshots rather than raw provider responses.

Primary UI pieces:

- Current weather hero
- Today forecast
- Weekly forecast
- Ride Today note
- Loading state
- Error state
- Lando's World Weather card

## Location

The Weather app stores its current location in `weather_app_preferences_v1`. On first use, it can migrate the previous Daily Chief Briefing preferred location. If neither exists, it defaults to Nashville, Tennessee so the app opens immediately with useful weather.

Geocoded coordinates are cached locally and reused for the same saved location.

## Cache

The shared cache remains:

- Forecasts: `daily_chief_weather_cache_v1`
- Geocoding: `daily_chief_weather_geocode_cache_v1`

The freshness window is 20 minutes. The Weather app and launcher card share this cache and in-flight request de-duplication.

## Normalized Snapshot

The UI expects current temperature, feels-like temperature, humidity, wind, high/low, rain chance, four dayparts, seven weekly forecast cards, and a fetch timestamp.

Future features such as hourly forecast, radar, air quality, sunrise/sunset, moon phase, alerts, saved cities, maps, and widgets should extend the normalized model without scattering provider-specific request code through the UI.
