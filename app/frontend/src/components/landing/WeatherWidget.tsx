import { useEffect, useState } from "react";
import { Cloud, CloudRain, Snowflake, Sun } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiUrl } from "@/lib/config";

const OPEN_METEO =
  "https://api.open-meteo.com/v1/forecast?latitude=49.8047&longitude=73.1094&current=temperature_2m,weather_code&timezone=Asia/Almaty";

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

function wmoToMain(code: number): string {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Clouds";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Clouds";
}

function readBackendWeather(payload: unknown): { temp: number; weather_main: string } | null {
  const data = payload && typeof payload === "object" && "data" in payload
    ? (payload as { data: unknown }).data
    : payload;
  if (!data || typeof data !== "object") return null;
  const row = data as { success?: boolean; temp?: unknown; weather_main?: string };
  if (typeof row.temp !== "number") return null;
  if (row.success === false) return null;
  return { temp: Math.round(row.temp), weather_main: row.weather_main || "" };
}

async function loadWeather(): Promise<{ temp: number; weather_main: string } | null> {
  try {
    const res = await fetch(apiUrl("/api/v1/weather"));
    if (res.ok) {
      const parsed = readBackendWeather(await res.json());
      if (parsed) return parsed;
    }
  } catch {
    // fall through to Open-Meteo
  }

  try {
    const res = await fetch(OPEN_METEO);
    if (!res.ok) return null;
    const json = await res.json();
    const temp = json?.current?.temperature_2m;
    if (typeof temp !== "number") return null;
    return {
      temp: Math.round(temp),
      weather_main: wmoToMain(Number(json?.current?.weather_code || 0)),
    };
  } catch {
    return null;
  }
}

export default function WeatherWidget() {
  const { t } = useLanguage();
  const [weather, setWeather] = useState<{ temp: number; weather_main: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const next = await loadWeather();
      if (!cancelled && next) setWeather(next);
    }

    run();
    const interval = setInterval(run, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!weather) return null;

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
