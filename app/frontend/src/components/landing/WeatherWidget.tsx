import { useCallback, useEffect, useState } from "react";
import { Cloud, CloudRain, Snowflake, Sun } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { client, withRetry } from "@/lib/api";

function WeatherIcon({ weatherMain, className }: { weatherMain: string; className?: string }) {
  const main = (weatherMain || "").toLowerCase();
  if (main.includes("snow")) return <Snowflake className={className} />;
  if (main.includes("rain") || main.includes("drizzle") || main.includes("thunderstorm")) {
    return <CloudRain className={className} />;
  }
  if (main.includes("cloud") || main.includes("mist") || main.includes("fog") || main.includes("haze")) {
    return <Cloud className={className} />;
  }
  return <Sun className={className} />;
}

function getWeatherIconColor(weatherMain: string): string {
  const main = (weatherMain || "").toLowerCase();
  if (main.includes("snow")) return "text-blue-200";
  if (main.includes("rain") || main.includes("drizzle") || main.includes("thunderstorm")) return "text-blue-300";
  if (main.includes("cloud") || main.includes("mist") || main.includes("fog") || main.includes("haze")) return "text-gray-300";
  return "text-amber-300";
}

function weatherTipKey(temp: number): "hero.weatherCold" | "hero.weatherCool" | "hero.weatherNice" {
  if (temp < 0) return "hero.weatherCold";
  if (temp <= 15) return "hero.weatherCool";
  return "hero.weatherNice";
}

export default function WeatherWidget() {
  const { t } = useLanguage();
  const [weather, setWeather] = useState<{
    temp: number | null;
    weather_main: string;
    success: boolean;
  }>({ temp: null, weather_main: "", success: false });

  const applyWeather = (res: unknown) => {
    const data = res && typeof res === "object" && "data" in res ? (res as { data: any }).data : res;
    if (data && data.success && data.temp !== null && data.temp !== undefined) {
      setWeather({
        temp: data.temp,
        weather_main: data.weather_main || "",
        success: true,
      });
    }
  };

  const fetchWeather = useCallback(async () => {
    try {
      const res = await withRetry(
        () =>
          client.apiCall.invoke<any>({
            url: "/api/v1/weather",
            method: "GET",
          }),
        2,
        800,
      );
      applyWeather(res);
    } catch {
      setTimeout(fetchWeatherQuiet, 15000);
    }
  }, []);

  const fetchWeatherQuiet = useCallback(async () => {
    try {
      const res = await withRetry(
        () =>
          client.apiCall.invoke<any>({
            url: "/api/v1/weather",
            method: "GET",
          }),
        2,
        3000,
      );
      applyWeather(res);
    } catch {
      // keep hidden
    }
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(fetchWeather, 800);
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchWeather]);

  if (!weather.success || weather.temp === null) return null;

  const iconColor = getWeatherIconColor(weather.weather_main);
  const tip = t(weatherTipKey(weather.temp));

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-md">
      <WeatherIcon weatherMain={weather.weather_main} className={`h-4 w-4 ${iconColor}`} />
      <p className="text-sm font-bold leading-none text-white">
        {weather.temp > 0 ? "+" : ""}
        {weather.temp}°C
      </p>
      <p className="hidden text-[11px] leading-none text-white/60 sm:block">{tip}</p>
    </div>
  );
}
