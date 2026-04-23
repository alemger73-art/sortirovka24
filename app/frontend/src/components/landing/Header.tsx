import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Sun, User } from "lucide-react";

const NAV_ITEMS = [
  { label: "Главная", to: "/" },
  { label: "Мастера", to: "/masters" },
  { label: "Объявления", to: "/announcements" },
  { label: "Новости", to: "/news" },
  { label: "Работа", to: "/jobs" },
  { label: "Жалобы", to: "/complaints" },
  { label: "Ещё", to: "/directory" },
];

export default function Header() {
  const [temp, setTemp] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather() {
      try {
        // Karaganda/Sortirovka approximate coordinates
        const resp = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=49.8047&longitude=73.1094&current=temperature_2m"
        );
        const data = await resp.json();
        const value = Number(data?.current?.temperature_2m);
        if (!cancelled && Number.isFinite(value)) {
          setTemp(Math.round(value));
        }
      } catch {
        if (!cancelled) setTemp(18);
      }
    }

    fetchWeather();
    const timer = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <header className="w-full">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400/15">
            <MapPin className="h-5 w-5 text-yellow-400" />
          </div>
          <div className="leading-tight">
            <p className="text-base font-bold text-white">Сортировка 24</p>
            <p className="text-xs text-white/60">портал района</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex">
          {NAV_ITEMS.map((item, index) => (
            <Link
              key={item.label}
              to={item.to}
              className={`text-sm font-medium transition-colors ${
                index === 0
                  ? "text-white underline underline-offset-8"
                  : "text-white/80 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-md sm:flex">
            <Sun className="h-4 w-4 text-yellow-300" />
            <div className="leading-tight">
              <p className="text-xs font-semibold text-white">
                {temp === null ? "—" : `${temp > 0 ? "+" : ""}${temp}°C`}
              </p>
              <p className="text-[11px] text-white/60">Сортировка</p>
            </div>
          </div>
          <Link
            to="/account"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all hover:bg-gray-100"
          >
            <User className="h-4 w-4" />
            Войти
          </Link>
        </div>
      </div>
    </header>
  );
}
