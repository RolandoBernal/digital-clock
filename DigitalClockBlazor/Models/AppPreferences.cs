namespace DigitalClockBlazor.Models;

public sealed record AppPreferences(TemperatureUnit Unit, DisplayLanguage Language);

public enum TemperatureUnit
{
    Fahrenheit,
    Celsius
}

public enum DisplayLanguage
{
    English,
    Spanish
}
