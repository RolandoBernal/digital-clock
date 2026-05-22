using System.Net.Http.Json;
using System.Text.Json.Serialization;
using DigitalClockBlazor.Models;

namespace DigitalClockBlazor.Services;

public sealed class WeatherService(HttpClient httpClient)
{
    public async Task<WeatherDisplay?> GetCurrentWeatherAsync(
        ClockLocation location,
        TemperatureUnit unit,
        DisplayLanguage language,
        CancellationToken cancellationToken = default)
    {
        var url = "https://api.open-meteo.com/v1/forecast" +
            $"?latitude={location.Latitude}" +
            $"&longitude={location.Longitude}" +
            "&current=temperature_2m,weather_code" +
            "&temperature_unit=fahrenheit";

        var response = await httpClient.GetFromJsonAsync<OpenMeteoResponse>(url, cancellationToken);
        if (response?.Current is null)
        {
            return null;
        }

        var temperature = unit == TemperatureUnit.Celsius
            ? Math.Round((response.Current.TemperatureF - 32) * 5 / 9)
            : Math.Round(response.Current.TemperatureF);

        var symbol = unit == TemperatureUnit.Celsius ? "\u00b0C" : "\u00b0F";
        var label = language == DisplayLanguage.Spanish ? "Clima actual" : "Current Weather";
        return new WeatherDisplay(
            $"{label}: {temperature}{symbol},",
            GetWeatherDescription(response.Current.WeatherCode, language));
    }

    private static string GetWeatherDescription(int weatherCode, DisplayLanguage language)
    {
        var descriptions = language == DisplayLanguage.Spanish ? SpanishDescriptions : EnglishDescriptions;
        return descriptions.TryGetValue(weatherCode, out var description)
            ? description
            : language == DisplayLanguage.Spanish ? "Condiciones actuales" : "Current conditions";
    }

    private static readonly IReadOnlyDictionary<int, string> EnglishDescriptions = new Dictionary<int, string>
    {
        [0] = "Clear sky",
        [1] = "Mainly clear",
        [2] = "Partly cloudy",
        [3] = "Overcast",
        [45] = "Foggy",
        [48] = "Foggy",
        [51] = "Light drizzle",
        [53] = "Drizzle",
        [55] = "Heavy drizzle",
        [56] = "Freezing drizzle",
        [57] = "Freezing drizzle",
        [61] = "Light rain",
        [63] = "Rain",
        [65] = "Heavy rain",
        [66] = "Freezing rain",
        [67] = "Freezing rain",
        [71] = "Light snow",
        [73] = "Snow",
        [75] = "Heavy snow",
        [77] = "Snow grains",
        [80] = "Rain showers",
        [81] = "Rain showers",
        [82] = "Heavy rain showers",
        [85] = "Snow showers",
        [86] = "Heavy snow showers",
        [95] = "Thunderstorm",
        [96] = "Thunderstorm with hail",
        [99] = "Thunderstorm with hail"
    };

    private static readonly IReadOnlyDictionary<int, string> SpanishDescriptions = new Dictionary<int, string>
    {
        [0] = "Cielo despejado",
        [1] = "Principalmente despejado",
        [2] = "Parcialmente nublado",
        [3] = "Nublado",
        [45] = "Neblina",
        [48] = "Neblina",
        [51] = "Llovizna ligera",
        [53] = "Llovizna",
        [55] = "Llovizna intensa",
        [56] = "Llovizna helada",
        [57] = "Llovizna helada",
        [61] = "Lluvia ligera",
        [63] = "Lluvia",
        [65] = "Lluvia intensa",
        [66] = "Lluvia helada",
        [67] = "Lluvia helada",
        [71] = "Nieve ligera",
        [73] = "Nieve",
        [75] = "Nieve intensa",
        [77] = "Granos de nieve",
        [80] = "Chubascos",
        [81] = "Chubascos",
        [82] = "Chubascos intensos",
        [85] = "Nevadas",
        [86] = "Nevadas intensas",
        [95] = "Tormenta electrica",
        [96] = "Tormenta con granizo",
        [99] = "Tormenta con granizo"
    };

    private sealed class OpenMeteoResponse
    {
        [JsonPropertyName("current")]
        public OpenMeteoCurrent? Current { get; init; }
    }

    private sealed class OpenMeteoCurrent
    {
        [JsonPropertyName("temperature_2m")]
        public double TemperatureF { get; init; }

        [JsonPropertyName("weather_code")]
        public int WeatherCode { get; init; }
    }
}
