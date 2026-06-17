import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { Link, useNavigate } from "react-router-dom";
import { Camera, Coins, Save, UserCircle2, UtensilsCrossed, Truck, Store, Wrench, Car, Bike } from "lucide-react";
import { accountApi, getAccountToken } from "@/lib/accountApi";
import { cacheAccountProfile, getCurrentUser, logoutLocalUser } from "@/lib/localAuth";
import { humanizeApiError } from "@/lib/apiErrors";
import { uploadAvatar, assertImageFileSize } from "@/lib/storage";
import { formatTenge, taxiApi, TAXI_STATUS_LABELS, type TaxiRide } from "@/lib/taxiApi";
import { useTaxiEnabled } from "@/hooks/useTaxiEnabled";
import { useLanguage } from "@/contexts/LanguageContext";
import TaxiUnavailable from "@/components/taxi/TaxiUnavailable";

type TabId = "profile" | "bonuses" | "orders" | "masterRequests" | "taxi" | "complaints" | "announcements" | "settings";

const MASTER_REQUEST_STATUS: Record<string, { labelKey: string; color: string }> = {
  new: { labelKey: "cabinet.master.statusNew", color: "bg-yellow-500/20 text-yellow-200" },
  in_progress: { labelKey: "cabinet.master.statusInProgress", color: "bg-blue-500/20 text-blue-200" },
  done: { labelKey: "cabinet.master.statusDone", color: "bg-green-500/20 text-green-200" },
};

const FOOD_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: "Новый", color: "bg-yellow-500/20 text-yellow-200" },
  in_progress: { label: "Готовится", color: "bg-blue-500/20 text-blue-200" },
  done: { label: "Доставлен", color: "bg-green-500/20 text-green-200" },
  cancelled: { label: "Отменён", color: "bg-red-500/20 text-red-200" },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Наличные",
  kaspi_qr: "Kaspi QR",
  halyk_qr: "Halyk QR",
};

function formatOrderDate(raw?: string | null) {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(raw);
  }
}

function DarkCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#1f2a3f] dark:bg-[#111827] dark:shadow-[0_10px_25px_rgba(0,0,0,0.25)]">
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 dark:border-[#2a3347] dark:bg-[#0f172a] dark:text-white dark:placeholder:text-slate-500";

const listCardClass =
  "rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-[#26324a] dark:bg-[#0f172a]";

const sectionTitleClass = "text-xl font-bold text-gray-900 dark:text-white";

export default function Cabinet() {
  const navigate = useNavigate();
  const { t, setLang } = useLanguage();
  const taxiEnabled = useTaxiEnabled();
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [loading, setLoading] = useState(true);
  const [cabinet, setCabinet] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({ name: "", email: "", avatar: "", language: "ru" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);
  const [taxiRides, setTaxiRides] = useState<TaxiRide[]>([]);
  const tabs: { id: TabId; label: string }[] = useMemo(() => {
    const base: { id: TabId; label: string }[] = [
      { id: "profile", label: t("cabinet.tab.profile") },
      { id: "bonuses", label: t("cabinet.tab.bonuses") },
      { id: "orders", label: t("cabinet.tab.orders") },
      { id: "masterRequests", label: t("cabinet.tab.masterRequests") },
      { id: "taxi", label: t("cabinet.tab.taxi") },
      { id: "complaints", label: t("cabinet.tab.complaints") },
      { id: "announcements", label: t("cabinet.tab.announcements") },
      { id: "settings", label: t("cabinet.tab.settings") },
    ];
    if (taxiEnabled === false && taxiRides.length === 0) {
      return base.filter((t) => t.id !== "taxi");
    }
    return base;
  }, [taxiEnabled, taxiRides.length, t]);

  useEffect(() => {
    (async () => {
      if (!getAccountToken()) {
        navigate("/account");
        return;
      }
      try {
        const data = await accountApi.cabinet();
        setCabinet(data);
        setHasPassword(data?.profile?.has_password !== false);
        const lang = data?.profile?.language === "kz" ? "kz" : "ru";
        setProfileForm({
          name: data?.profile?.name || "",
          email: data?.profile?.email || "",
          avatar: data?.profile?.avatar || "",
          language: lang,
        });
        if (lang === "kz" || lang === "ru") setLang(lang);
        taxiApi.myRides().then(setTaxiRides).catch(() => {});
      } catch (e: unknown) {
        const cached = getCurrentUser();
        if (cached) {
          setCabinet({
            profile: {
              name: cached.name,
              phone: cached.phone,
              email: cached.email,
              avatar: cached.avatar,
              has_password: true,
              bonus_balance: 0,
            },
            bonuses: [],
            orders: [],
            complaints: [],
            announcements: [],
          });
          setProfileForm({
            name: cached.name || "",
            email: cached.email || "",
            avatar: cached.avatar || "",
            language: "ru",
          });
          setError("Нет связи с сервером. Показаны сохранённые данные профиля.");
        } else {
          setError(humanizeApiError(e));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const saveProfile = async () => {
    setSavingProfile(true);
    setError("");
    setSuccess("");
    try {
      const avatarForSave =
        profileForm.avatar?.startsWith("blob:") ? undefined : profileForm.avatar?.trim() || undefined;
      const updated = await accountApi.updateMe({
        name: profileForm.name.trim(),
        email: profileForm.email.trim() || undefined,
        avatar: avatarForSave,
        language: profileForm.language,
      });
      cacheAccountProfile({
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        avatar: updated.avatar,
      });
      const refreshed = await accountApi.cabinet();
      setCabinet(refreshed);
      if (profileForm.language === "kz" || profileForm.language === "ru") {
        setLang(profileForm.language);
      }
      setProfileForm({
        name: refreshed?.profile?.name || "",
        email: refreshed?.profile?.email || "",
        avatar: refreshed?.profile?.avatar || "",
        language: refreshed?.profile?.language || "ru",
      });
      setSuccess(t("cabinet.profileSaved"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    } finally {
      setSavingProfile(false);
    }
  };

  const onAvatarUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Выберите изображение (JPG, PNG, WebP)");
      return;
    }
    try {
      assertImageFileSize(file);
    } catch (e: unknown) {
      setError(humanizeApiError(e));
      return;
    }
    setAvatarUploading(true);
    setError("");
    setSuccess("");
    const previewUrl = URL.createObjectURL(file);
    setProfileForm((p) => ({ ...p, avatar: previewUrl }));
    try {
      const result = await uploadAvatar(file);
      const url = result.thumbnailUrl || result.downloadUrl;
      if (!url) throw new Error("Не удалось получить ссылку на загруженное фото");
      const updated = await accountApi.updateMe({
        name: profileForm.name.trim(),
        email: profileForm.email.trim() || undefined,
        avatar: url,
        language: profileForm.language,
      });
      setProfileForm((p) => ({
        ...p,
        avatar: updated.avatar || url,
      }));
      cacheAccountProfile({
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        avatar: updated.avatar,
      });
      setCabinet((prev: any) =>
        prev
          ? { ...prev, profile: { ...prev.profile, avatar: updated.avatar || url } }
          : prev
      );
      setSuccess(t("cabinet.avatarSaved"));
    } catch (e: unknown) {
      setProfileForm((p) => ({
        ...p,
        avatar: cabinet?.profile?.avatar || "",
      }));
      setError(humanizeApiError(e));
    } finally {
      URL.revokeObjectURL(previewUrl);
      setAvatarUploading(false);
    }
  };

  const changePassword = async () => {
    setChangingPassword(true);
    setError("");
    setSuccess("");
    try {
      if (passwordForm.next.length < 8) throw new Error("Новый пароль должен быть не короче 8 символов");
      if (passwordForm.next !== passwordForm.confirm) throw new Error("Пароли не совпадают");
      if (hasPassword) {
        await accountApi.changePassword({
          current_password: passwordForm.current,
          new_password: passwordForm.next,
        });
        setSuccess(t("cabinet.passwordChanged"));
      } else {
        await accountApi.setPassword({ new_password: passwordForm.next });
        setHasPassword(true);
        setSuccess(t("cabinet.passwordSet"));
      }
      setPasswordForm({ current: "", next: "", confirm: "" });
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    } finally {
      setChangingPassword(false);
    }
  };

  const rows = useMemo(() => ({
    bonuses: cabinet?.bonuses || [],
    orders: cabinet?.orders || [],
    master_requests: cabinet?.master_requests || [],
    complaints: cabinet?.complaints || [],
    announcements: cabinet?.announcements || [],
  }), [cabinet]);

  if (loading) return <Layout><div className="mx-auto max-w-6xl px-4 py-10 text-gray-500 dark:text-slate-300">{t("cabinet.loading")}</div></Layout>;

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 dark:bg-[#0B0F19] dark:text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold">{t("cabinet.personalTitle")}</h1>
              <p className="text-gray-500 dark:text-slate-300">{cabinet?.profile?.name} · {cabinet?.profile?.phone}</p>
              {(cabinet?.profile?.role === "master" || cabinet?.profile?.role === "admin" || cabinet?.profile?.role === "superadmin") && (
                <Link
                  to="/cabinet/master"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                >
                  <Wrench className="h-4 w-4" /> {t("cabinet.masterTitle")} →
                </Link>
              )}
              {cabinet?.profile?.role === "driver" && (
                <Link
                  to="/cabinet/driver"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-yellow-600 hover:text-yellow-700 dark:text-yellow-400"
                >
                  <Car className="h-4 w-4" /> Кабинет водителя — заказы →
                </Link>
              )}
              <Link
                to="/cabinet/courier"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400"
              >
                <Bike className="h-4 w-4" /> Кабинет курьера →
              </Link>
              {cabinet?.profile?.role === "user" && (
                <Link
                  to="/taxi/driver"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-yellow-600 hover:text-yellow-700 dark:text-yellow-400"
                >
                  <Car className="h-4 w-4" /> Стать водителем →
                </Link>
              )}
            </div>
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-[#2a3347] dark:bg-[#111827] dark:text-white dark:hover:bg-[#1a2336]"
              onClick={() => {
                logoutLocalUser();
                navigate("/account");
              }}
            >
              {t("cabinet.logout")}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
            <DarkCard>
              <div className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setError("");
                      setSuccess("");
                      setActiveTab(tab.id);
                    }}
                    className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                      activeTab === tab.id
                        ? "bg-yellow-400 text-[#0B0F19]"
                        : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-[#0f172a] dark:text-slate-200 dark:hover:bg-[#1a2336]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </DarkCard>

            <div className="space-y-4">
              {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p> : null}
              {success ? <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">{success}</p> : null}

              {activeTab === "profile" && (
                <DarkCard>
                  <div className="mb-4 flex items-center justify-between"><h2 className={sectionTitleClass}>Профиль</h2></div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center dark:border-[#2a3347] dark:bg-[#0f172a]">
                      {profileForm.avatar ? (
                        <img src={profileForm.avatar} alt="avatar" className="mx-auto h-28 w-28 rounded-full object-cover ring-2 ring-yellow-400/50" />
                      ) : (
                        <UserCircle2 className="mx-auto h-28 w-28 text-gray-400 dark:text-slate-400" />
                      )}
                      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-semibold text-[#0B0F19]">
                        <Camera className="h-4 w-4" /> {avatarUploading ? "Загрузка..." : "Загрузить"}
                        <input type="file" accept="image/*" className="hidden" disabled={avatarUploading} onChange={(e) => onAvatarUpload(e.target.files?.[0])} />
                      </label>
                      {profileForm.avatar ? (
                        <button
                          onClick={async () => {
                            setError("");
                            setSuccess("");
                            try {
                              const updated = await accountApi.updateMe({ avatar: "" });
                              setProfileForm((p) => ({ ...p, avatar: "" }));
                              cacheAccountProfile({
                                id: updated.id,
                                name: updated.name,
                                phone: updated.phone,
                                email: updated.email,
                                avatar: updated.avatar,
                              });
                              setSuccess(t("cabinet.avatarRemoved"));
                            } catch (e: unknown) {
                              setError(humanizeApiError(e));
                            }
                          }}
                          className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-[#2a3347] dark:text-slate-200 dark:hover:bg-[#1a2336]"
                        >
                          Удалить фото
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      <input value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} className={inputClass} placeholder="Имя" />
                      <input disabled value={cabinet?.profile?.phone || ""} className={`${inputClass} opacity-80`} placeholder="Телефон" />
                      <input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} className={inputClass} placeholder="Email" />
                      <select value={profileForm.language} onChange={e => setProfileForm(p => ({ ...p, language: e.target.value }))} className={inputClass}>
                        <option value="ru">Русский</option>
                        <option value="kz">Қазақша</option>
                      </select>
                      <button onClick={saveProfile} disabled={savingProfile || avatarUploading} className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-[#0B0F19] disabled:opacity-60">
                        <Save className="h-4 w-4" /> {savingProfile ? "Сохранение..." : "Сохранить изменения"}
                      </button>
                    </div>
                  </div>
                </DarkCard>
              )}

              {activeTab === "bonuses" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">Мои бонусы</h2>
                  <div className="rounded-2xl border border-yellow-400/30 bg-gradient-to-r from-yellow-500/20 to-amber-400/10 p-5">
                    <p className="text-sm text-yellow-100/80">Текущий баланс бонусов</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Coins className="h-7 w-7 text-yellow-300" />
                      <p className="text-4xl font-black text-yellow-300">{Number(cabinet?.profile?.bonus_balance || 0).toLocaleString("ru-RU")}</p>
                    </div>
                    <p className="mt-1 text-sm text-yellow-100/70">+300 за регистрацию · +50 за заказ еды</p>
                  </div>
                  <div className="mt-4 space-y-2">
                    {rows.bonuses.length === 0 ? (
                      <p className="text-sm text-slate-400">Пока нет начислений. Бонусы появятся после регистрации и заказов.</p>
                    ) : null}
                    {rows.bonuses.map((entry: any) => (
                      <div key={entry.id} className={listCardClass}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-900 dark:text-white">{entry.reason || "Начисление"}</p>
                          <p className="font-semibold text-amber-600 dark:text-yellow-300">{entry.points > 0 ? "+" : ""}{entry.points}</p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{entry.created_at || ""}</p>
                      </div>
                    ))}
                  </div>
                </DarkCard>
              )}

              {activeTab === "orders" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">История заказов</h2>
                  <div className="space-y-2">
                    {(rows.orders || []).map((o: any) => {
                      const isFood = o.type === "food";
                      const st = isFood ? FOOD_STATUS[o.status] || FOOD_STATUS.new : null;
                      const payLabel = PAYMENT_LABELS[o.payment_method] || o.payment_method;
                      return (
                        <div key={o.id} className={listCardClass}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {isFood ? (
                                <UtensilsCrossed className="h-4 w-4 shrink-0 text-orange-500 dark:text-orange-400" />
                              ) : null}
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {isFood
                                  ? (o.restaurant_name || "DAM ALEM") + (o.order_number ? ` · №${o.order_number}` : "")
                                  : (o.type || "order")}
                              </p>
                            </div>
                            {st ? (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium ${st.color}`}>
                                {st.label}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{o.details || ""}</p>
                          {isFood && (
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-slate-400">
                              {o.delivery_method === "delivery" ? (
                                <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" /> Доставка</span>
                              ) : o.delivery_method === "pickup" ? (
                                <span className="inline-flex items-center gap-1"><Store className="h-3 w-3" /> Самовывоз</span>
                              ) : null}
                              {payLabel ? <span>· {payLabel}</span> : null}
                              {o.created_at ? <span>· {formatOrderDate(o.created_at)}</span> : null}
                            </div>
                          )}
                          <p className="text-sm font-bold text-amber-600 dark:text-yellow-300 mt-2">
                            {Number(o.amount || 0).toLocaleString("ru-RU")} ₸
                          </p>
                        </div>
                      );
                    })}
                    {(rows.orders || []).length === 0 ? <p className="text-sm text-slate-400">Пока нет заказов.</p> : null}
                  </div>
                </DarkCard>
              )}

              {activeTab === "masterRequests" && (
                <DarkCard>
                  <h2 className={`mb-4 ${sectionTitleClass}`}>{t("cabinet.tab.masterRequests")}</h2>
                  <div className="space-y-2">
                    {(rows.master_requests || []).map((r: any) => {
                      const st = MASTER_REQUEST_STATUS[r.status] || MASTER_REQUEST_STATUS.new;
                      return (
                        <div key={r.id} className={listCardClass}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Wrench className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.category || t("cabinet.master.requests")}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium ${st.color}`}>
                              {t(st.labelKey)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 line-clamp-2">{r.problem_description}</p>
                          {r.master_id ? (
                            <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">{t("cabinet.master.personalRequest")} #{r.master_id}</p>
                          ) : null}
                          {r.created_at ? <p className="text-xs text-gray-400 mt-1">{formatOrderDate(r.created_at)}</p> : null}
                        </div>
                      );
                    })}
                    {(rows.master_requests || []).length === 0 ? (
                      <p className="text-sm text-slate-400">{t("cabinet.masterRequestsEmpty")}</p>
                    ) : null}
                  </div>
                  <Link to="/masters/request" className="mt-4 inline-flex text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
                    {t("masters.emptyCtaRequest")} →
                  </Link>
                </DarkCard>
              )}

              {activeTab === "taxi" && (
                <DarkCard>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold">Поездки такси</h2>
                    {taxiEnabled !== false ? (
                      <Link to="/taxi" className="text-sm font-semibold text-yellow-400 hover:text-yellow-300">Заказать →</Link>
                    ) : null}
                  </div>
                  {taxiEnabled === false && taxiRides.length === 0 ? (
                    <TaxiUnavailable compact />
                  ) : (
                  <div className="space-y-2">
                    {taxiRides.map((r) => (
                      <Link key={r.id} to={`/taxi/ride/${r.id}`} className={`block ${listCardClass} hover:border-yellow-400/40 transition-colors`}>
                        <div className="flex justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.from_address}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${TAXI_STATUS_LABELS[r.status]?.color || "bg-gray-100"}`}>
                            {TAXI_STATUS_LABELS[r.status]?.label || r.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">→ {r.to_address}</p>
                        <p className="text-xs text-amber-600 dark:text-yellow-300 mt-1">{formatTenge(r.final_price ?? r.estimated_price)}</p>
                      </Link>
                    ))}
                    {taxiRides.length === 0 ? <p className="text-sm text-slate-400">Пока нет поездок.</p> : null}
                  </div>
                  )}
                </DarkCard>
              )}

              {activeTab === "complaints" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">История жалоб</h2>
                  <div className="space-y-2">
                    {(rows.complaints || []).map((c: any) => (
                      <div key={c.id} className={listCardClass}>
                        <p className="font-semibold text-gray-900 dark:text-white">{c.category || "Жалоба"}</p>
                        <p className="text-xs text-gray-600 dark:text-slate-400">{c.description || ""}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-500">Статус: {c.status || "-"}</p>
                      </div>
                    ))}
                    {(rows.complaints || []).length === 0 ? <p className="text-sm text-slate-400">Пока нет жалоб.</p> : null}
                  </div>
                </DarkCard>
              )}

              {activeTab === "announcements" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">История объявлений</h2>
                  <div className="space-y-2">
                    {(rows.announcements || []).map((a: any) => (
                      <div key={a.id} className={listCardClass}>
                        <p className="font-semibold text-gray-900 dark:text-white">{a.title || "Объявление"}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-500">Статус: {a.status || "-"}</p>
                        <p className="text-xs text-amber-600 dark:text-yellow-300">{a.price || ""}</p>
                      </div>
                    ))}
                    {(rows.announcements || []).length === 0 ? <p className="text-sm text-slate-400">Пока нет объявлений.</p> : null}
                  </div>
                </DarkCard>
              )}

              {activeTab === "settings" && (
                <DarkCard>
                  <h2 className={`mb-4 ${sectionTitleClass}`}>{t("cabinet.tab.settings")}</h2>
                  <div className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-[#2a3347] dark:bg-[#0f172a]">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{hasPassword ? t("cabinet.changePassword") : t("cabinet.setPassword")}</h3>
                    {hasPassword ? (
                      <input
                        type="password"
                        value={passwordForm.current}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                        className={inputClass}
                        placeholder="Текущий пароль"
                        autoComplete="current-password"
                      />
                    ) : null}
                    <input
                      type="password"
                      value={passwordForm.next}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
                      className={inputClass}
                      placeholder="Новый пароль (мин. 8 символов)"
                      autoComplete="new-password"
                    />
                    <input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                      className={inputClass}
                      placeholder="Повторите новый пароль"
                      autoComplete="new-password"
                    />
                    <button
                      onClick={changePassword}
                      disabled={changingPassword}
                      className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-[#0B0F19] disabled:opacity-60"
                    >
                      {changingPassword ? t("cabinet.saving") : hasPassword ? t("cabinet.changePassword") : t("cabinet.setPassword")}
                    </button>
                  </div>
                  <p className="mb-5 text-sm text-gray-600 dark:text-slate-300">{t("cabinet.langHint")}</p>
                  <button
                    onClick={() => {
                      logoutLocalUser();
                      navigate("/account");
                    }}
                    className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    Выйти из аккаунта
                  </button>
                </DarkCard>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
