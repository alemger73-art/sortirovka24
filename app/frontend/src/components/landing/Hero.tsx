import { Link } from "react-router-dom";
import { BookOpen, Car, Shield, ShoppingBag, Utensils, Wrench, Users, Coffee, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTaxiEnabled } from "@/hooks/useTaxiEnabled";
import { useModules } from "@/hooks/useModules";
import { useHomepageHeroStats, type HeroStatItem } from "@/hooks/useHomepageHeroStats";
import WeatherWidget from "@/components/landing/WeatherWidget";

const HERO_BG =
  "https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/ad8caa55-9593-448b-8f7a-39be84ed5053.png";

const glassBtn =
  "group rounded-2xl border border-white/45 bg-black/35 px-5 py-4 text-white shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-[1.03] hover:shadow-white/15 hover:shadow-2xl";

const COUNTER_ICONS: Record<HeroStatItem["labelKey"], typeof Users> = {
  "hero.mastersShort": Users,
  "hero.cafesShort": Coffee,
  "hero.residentsShort": ShieldCheck,
};

export default function Hero() {
  const { t } = useLanguage();
  const taxiEnabled = useTaxiEnabled();
  const { isEnabled } = useModules();
  const { visible: counterVisible, items: counterItems } = useHomepageHeroStats();

  const showTaxi = taxiEnabled === true;
  const showFood = isEnabled("food");
  const showGastronom = isEnabled("gastronom");
  const showMasters = isEnabled("masters");
  const showInspectors = isEnabled("inspectors");
  const showDirectory = isEnabled("directory");
  const btnCount = [showTaxi, showFood, showGastronom, showMasters, showInspectors, showDirectory].filter(Boolean).length;
  const gridCols = btnCount >= 5 ? "grid-cols-2 lg:grid-cols-3" : btnCount === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3";

  return (
    <section className="relative min-h-[520px] overflow-hidden md:min-h-[640px]">
      <img
        src={HERO_BG}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        fetchPriority="high"
      />

      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.8),rgba(0,0,0,0.2))]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.75)_0%,rgba(0,0,0,0.45)_35%,rgba(0,0,0,0.05)_65%,rgba(0,0,0,0)_100%)]" />

      <div className="relative z-10">
        <div className="mx-auto flex min-h-[450px] max-w-7xl items-end px-4 pb-8 pt-6 md:min-h-[560px] md:px-8 md:pb-14">
          <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur-sm">
                {t("hero.todayIn")}
              </span>
              <WeatherWidget />
            </div>

            <h1 className="text-[2.35rem] font-black leading-[0.95] tracking-[-0.03em] text-balance text-white sm:text-5xl md:text-7xl">
              <span className="text-yellow-400">{t("hero.title1")}</span>{" "}
              <br className="hidden md:block" />
              {t("hero.title2")}
            </h1>

            <p className="mt-4 max-w-xl text-lg leading-snug text-white/80 md:text-3xl md:leading-[1.05]">
              {t("hero.subtitleLead")} <br className="hidden md:block" />
              {t("hero.subtitleRest")}
            </p>

            <div className={`mt-7 grid gap-3 ${gridCols}`}>
              {showTaxi && (
                <Link
                  to="/taxi"
                  className="group rounded-2xl bg-yellow-400 px-5 py-4 text-gray-900 shadow-xl transition-all duration-200 hover:scale-[1.03] hover:shadow-yellow-300/30 hover:shadow-2xl"
                >
                  <div className="flex items-center gap-2">
                    <Car className="h-5 w-5" />
                    <p className="text-base font-bold">{t("hero.taxi")}</p>
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-800">{t("hero.taxiDesc")}</p>
                </Link>
              )}
              {showFood && (
                <Link to="/food" className={glassBtn}>
                  <div className="flex items-center gap-2">
                    <Utensils className="h-5 w-5 shrink-0" />
                    <p className="text-base font-bold">{t("hero.food")}</p>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-white/75">{t("hero.foodDesc")}</p>
                </Link>
              )}
              {showGastronom && (
                <Link to="/gastronom" className={`${glassBtn} border-emerald-400/35`}>
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 shrink-0 text-emerald-300" />
                    <p className="text-base font-bold">{t("hero.gastronom")}</p>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-white/75">{t("hero.gastronomDesc")}</p>
                </Link>
              )}
              {showMasters && (
                <Link to="/masters" className={glassBtn}>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 shrink-0" />
                    <p className="text-base font-bold">{t("hero.mastersBtn")}</p>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-white/75">{t("hero.mastersDesc")}</p>
                </Link>
              )}
              {showInspectors && (
                <Link to="/inspectors" className={glassBtn}>
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 shrink-0" />
                    <p className="text-base font-bold">{t("hero.inspector")}</p>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-white/75">{t("hero.inspectorDesc")}</p>
                </Link>
              )}
              {showDirectory && (
                <Link to="/directory" className={glassBtn}>
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 shrink-0" />
                    <p className="text-base font-bold">{t("hero.directory")}</p>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-white/75">{t("hero.directoryDesc")}</p>
                </Link>
              )}
            </div>

            {counterVisible && counterItems.length > 0 && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md md:px-6 md:py-4">
                <div className={`grid gap-2 md:gap-4 grid-cols-${Math.min(counterItems.length, 3)}`} style={{ gridTemplateColumns: `repeat(${counterItems.length}, minmax(0, 1fr))` }}>
                  {counterItems.map((item) => {
                    const Icon = COUNTER_ICONS[item.labelKey];
                    return (
                      <div key={item.labelKey} className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-white/80" />
                        <div>
                          <p className="text-xl font-extrabold leading-none text-white md:text-3xl">{item.value}+</p>
                          <p className="text-[10px] leading-tight text-white/70 md:text-xs">{t(item.labelKey)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
