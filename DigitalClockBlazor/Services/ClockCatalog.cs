using DigitalClockBlazor.Models;

namespace DigitalClockBlazor.Services;

public sealed class ClockCatalog
{
    public IReadOnlyList<ClockLocation> Locations { get; } =
    [
        new("nashville", "Nashville, TN", "America/Chicago", 36.1627, -86.7816, "digit_clock_weather_nashville_v1"),
        new("puerto-vallarta", "Puerto Vallarta, MX", "America/Bahia_Banderas", 20.6534, -105.2253, "digit_clock_weather_puerto_vallarta_v1"),
        new("tepic", "Tepic, MX", "America/Mazatlan", 21.5085, -104.8936, "digit_clock_weather_tepic_v1"),
        new("vancouver", "Vancouver, BC", "America/Vancouver", 49.2827, -123.1207, "digit_clock_weather_vancouver_v1")
    ];
}
