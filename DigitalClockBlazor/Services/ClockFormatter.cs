using System.Globalization;
using DigitalClockBlazor.Models;

namespace DigitalClockBlazor.Services;

public sealed class ClockFormatter
{
    public ClockDisplay Format(ClockLocation location, DisplayLanguage language, DateTimeOffset now)
    {
        var culture = language == DisplayLanguage.Spanish
            ? CultureInfo.GetCultureInfo("es-US")
            : CultureInfo.GetCultureInfo("en-US");

        var timeZone = TimeZoneInfo.FindSystemTimeZoneById(location.TimeZoneId);
        var localTime = TimeZoneInfo.ConvertTime(now, timeZone);

        return new ClockDisplay(
            localTime.ToString("%h", culture),
            localTime.ToString("mm", culture),
            localTime.ToString("ss", culture),
            localTime.ToString("tt", culture),
            localTime.ToString("ddd, MMMM d, yyyy", culture),
            localTime.ToString("MM / dd / yyyy", culture));
    }
}
