namespace DigitalClockBlazor.Models;

public sealed record ClockDisplay(
    string Hour,
    string Minute,
    string Second,
    string DayPeriod,
    string LongDate,
    string ShortDate);
