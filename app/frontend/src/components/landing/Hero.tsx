import { Link } from "react-router-dom";
import { Car, Utensils, Wrench, Users, Coffee, ShieldCheck } from "lucide-react";

const HERO_BG =
  "https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/ad8caa55-9593-448b-8f7a-39be84ed5053.png";

export default function Hero() {
  return (
    <section className="relative min-h-[520px] overflow-hidden md:min-h-[640px]">
      <img
        src={HERO_BG}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        fetchPriority="high"
      />

      {/* Required vertical overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.8),rgba(0,0,0,0.2))]" />
      {/* Left readability overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.75)_0%,rgba(0,0,0,0.45)_35%,rgba(0,0,0,0.05)_65%,rgba(0,0,0,0)_100%)]" />

      <div className="relative z-10">
        <div className="mx-auto flex min-h-[450px] max-w-7xl items-end px-4 pb-8 pt-6 md:min-h-[560px] md:px-8 md:pb-14">
          <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-5xl font-black leading-[0.95] tracking-[-0.03em] text-white md:text-7xl">
              Сортировка — <br />
              <span className="text-yellow-400">всё</span> для жизни <br />
              рядом
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-snug text-white/80 md:text-3xl md:leading-[1.05]">
              Еда, услуги, объявления и помощь — <br className="hidden md:block" />
              в одном сервисе
            </p>

            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Link
                to="/transport"
                className="group rounded-2xl bg-yellow-400 px-5 py-4 text-gray-900 shadow-xl transition-all duration-200 hover:scale-[1.03] hover:shadow-yellow-300/30 hover:shadow-2xl"
              >
                <div className="flex items-center gap-2">
                  <Car className="h-5 w-5" />
                  <p className="text-base font-bold">Такси</p>
                </div>
                <p className="mt-1 text-sm font-medium text-gray-800">Быстро по району</p>
              </Link>
              <Link
                to="/food"
                className="group rounded-2xl border border-white/45 bg-black/35 px-5 py-4 text-white shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-[1.03] hover:shadow-white/15 hover:shadow-2xl"
              >
                <div className="flex items-center gap-2">
                  <Utensils className="h-5 w-5" />
                  <p className="text-base font-bold">Еда</p>
                </div>
                <p className="mt-1 text-sm text-white/75">Доставка рядом</p>
              </Link>
              <Link
                to="/masters"
                className="group rounded-2xl border border-white/45 bg-black/35 px-5 py-4 text-white shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-[1.03] hover:shadow-white/15 hover:shadow-2xl"
              >
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  <p className="text-base font-bold">Найти мастера</p>
                </div>
                <p className="mt-1 text-sm text-white/75">Все услуги</p>
              </Link>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md md:px-6 md:py-4">
              <div className="grid grid-cols-3 gap-2 md:gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-white/80" />
                  <div>
                    <p className="text-xl font-extrabold leading-none text-white md:text-3xl">8+</p>
                    <p className="text-[10px] leading-tight text-white/70 md:text-xs">мастеров</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Coffee className="h-5 w-5 text-white/80" />
                  <div>
                    <p className="text-xl font-extrabold leading-none text-white md:text-3xl">6+</p>
                    <p className="text-[10px] leading-tight text-white/70 md:text-xs">кафе и ресторанов</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-white/80" />
                  <div>
                    <p className="text-xl font-extrabold leading-none text-white md:text-3xl">1000+</p>
                    <p className="text-[10px] leading-tight text-white/70 md:text-xs">жителей района</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
