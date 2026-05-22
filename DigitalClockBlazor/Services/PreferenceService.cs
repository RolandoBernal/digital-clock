using System.Text.Json;
using DigitalClockBlazor.Models;
using Microsoft.JSInterop;

namespace DigitalClockBlazor.Services;

public sealed class PreferenceService(IJSRuntime jsRuntime)
{
    private const string StorageKey = "digit_clock_preferences_v1";

    public async Task<AppPreferences> LoadAsync()
    {
        var raw = await jsRuntime.InvokeAsync<string?>("digitalClockStorage.get", StorageKey);
        if (!string.IsNullOrWhiteSpace(raw))
        {
            try
            {
                var stored = JsonSerializer.Deserialize<StoredPreferences>(raw);
                if (stored is not null)
                {
                    return new AppPreferences(ParseUnit(stored.Unit), ParseLanguage(stored.Language));
                }
            }
            catch (JsonException)
            {
                // Ignore invalid local storage and fall back to browser language.
            }
        }

        var browserLanguage = await jsRuntime.InvokeAsync<string>("digitalClockStorage.getBrowserLanguage");
        var language = browserLanguage.StartsWith("es", StringComparison.OrdinalIgnoreCase)
            ? DisplayLanguage.Spanish
            : DisplayLanguage.English;

        return new AppPreferences(TemperatureUnit.Fahrenheit, language);
    }

    public Task SaveAsync(AppPreferences preferences)
    {
        var stored = new StoredPreferences(
            preferences.Unit == TemperatureUnit.Celsius ? "C" : "F",
            preferences.Language == DisplayLanguage.Spanish ? "es" : "en");

        return jsRuntime.InvokeVoidAsync(
            "digitalClockStorage.set",
            StorageKey,
            JsonSerializer.Serialize(stored)).AsTask();
    }

    private static TemperatureUnit ParseUnit(string? unit)
    {
        return string.Equals(unit, "C", StringComparison.OrdinalIgnoreCase)
            ? TemperatureUnit.Celsius
            : TemperatureUnit.Fahrenheit;
    }

    private static DisplayLanguage ParseLanguage(string? language)
    {
        return string.Equals(language, "es", StringComparison.OrdinalIgnoreCase)
            ? DisplayLanguage.Spanish
            : DisplayLanguage.English;
    }

    private sealed record StoredPreferences(string Unit, string Language);
}
