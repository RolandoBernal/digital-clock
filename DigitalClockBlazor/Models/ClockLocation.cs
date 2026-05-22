namespace DigitalClockBlazor.Models;

public sealed record ClockLocation(
    string Id,
    string City,
    string TimeZoneId,
    double Latitude,
    double Longitude,
    string WeatherCacheKey);
