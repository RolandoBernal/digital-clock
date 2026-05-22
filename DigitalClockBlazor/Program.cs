using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using DigitalClockBlazor;
using DigitalClockBlazor.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
builder.Services.AddSingleton<ClockCatalog>();
builder.Services.AddSingleton<ClockFormatter>();
builder.Services.AddScoped<WeatherService>();
builder.Services.AddScoped<PreferenceService>();

await builder.Build().RunAsync();
