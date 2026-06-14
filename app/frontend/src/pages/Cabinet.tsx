import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { Link, useNavigate } from "react-router-dom";
import { Camera, Coins, Save, UserCircle2 } from "lucide-react";
import { accountApi, getAccountToken } from "@/lib/accountApi";
import { cacheAccountProfile, logoutLocalUser } from "@/lib/localAuth";
import { uploadFile } from "@/lib/storage";
import { formatTenge, taxiApi, TAXI_STATUS_LABELS, type TaxiRide } from "@/lib/taxiApi";
import { useTaxiEnabled } from "@/hooks/useTaxiEnabled";
import { useLanguage } from "@/contexts/LanguageContext";
import TaxiUnavailable from "@/components/taxi/TaxiUnavailable";

type TabId = "profile" | "bonuses" | "orders" | "taxi" | "complaints" | "announcements" | "settings";

function DarkCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_10px_25px_rgba(0,0,0,0.12)] dark:border-[#1f2a3f] dark:bg-[#111827] dark:shadow-[0_10px_25px_rgba(0,0,0,0.25)]">
      {children}
    </div>
  );
}

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
      } catch (e: any) {
        setError(String(e?.message || e));
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
      const updated = await accountApi.updateMe({
        name: profileForm.name.trim(),
        email: profileForm.email.trim() || undefined,
        avatar: profileForm.avatar,
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
    } catch (e: any) {
      setError(String(e?.message || e));
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
    if (file.size > 5 * 1024 * 1024) {
      setError("Максимальный размер файла — 5 МБ");
      return;
    }
    setAvatarUploading(true);
    setError("");
    setSuccess("");
    try {
      const result = await uploadFile(file, "avatars");
      const url = result.downloadUrl || result.thumbnailUrl;
      if (!url) throw new Error("Не удалось получить ссылку на загруженное фото");
      const nextForm = { ...profileForm, avatar: url };
      setProfileForm(nextForm);
      const updated = await accountApi.updateMe({
        name: nextForm.name.trim(),
        email: nextForm.email.trim() || undefined,
        avatar: url,
        language: nextForm.language,
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
      setSuccess(t("cabinet.avatarSaved"));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
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
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setChangingPassword(false);
    }
  };

  const rows = useMemo(() => ({
    bonuses: cabinet?.bonuses || [],
    orders: cabinet?.orders || [],
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
                    onClick={() => setActiveTab(tab.id)}
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
              {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
              {success ? <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">{success}</p> : null}

              {activeTab === "profile" && (
                <DarkCard>
                  <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Профиль</h2></div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
                    <div className="rounded-xl border border-[#2a3347] bg-[#0f172a] p-4 text-center">
                      {profileForm.avatar ? (
                        <img src={profileForm.avatar} alt="avatar" className="mx-auto h-28 w-28 rounded-full object-cover" />
                      ) : (
                        <UserCircle2 className="mx-auto h-28 w-28 text-slate-400" />
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
                            } catch (e: any) {
                              setError(String(e?.message || e));
                            }
                          }}
                          className="mt-2 block w-full rounded-lg border border-[#2a3347] px-3 py-2 text-sm hover:bg-[#1a2336]"
                        >
                          Удалить фото
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      <input value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-xl border border-[#2a3347] bg-[#0f172a] px-4 py-3 text-sm text-white" placeholder="Имя" />
                      <input disabled value={cabinet?.profile?.phone || ""} className="w-full rounded-xl border border-[#2a3347] bg-[#0f172a] px-4 py-3 text-sm text-white opacity-80" placeholder="Телефон" />
                      <input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} className="w-full rounded-xl border border-[#2a3347] bg-[#0f172a] px-4 py-3 text-sm text-white" placeholder="Email" />
                      <select value={profileForm.language} onChange={e => setProfileForm(p => ({ ...p, language: e.target.value }))} className="w-full rounded-xl border border-[#2a3347] bg-[#0f172a] px-4 py-3 text-sm text-white">
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
                      <div key={entry.id} className="rounded-xl border border-[#2a3347] bg-[#0f172a] p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white">{entry.reason || "Начисление"}</p>
                          <p className="font-semibold text-yellow-300">{entry.points > 0 ? "+" : ""}{entry.points}</p>
                        </div>
                        <p className="text-xs text-slate-400">{entry.created_at || ""}</p>
                      </div>
                    ))}
                  </div>
                </DarkCard>
              )}

              {activeTab === "orders" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">История заказов</h2>
                  <div className="space-y-2">
                    {(rows.orders || []).map((o: any) => (
                      <div key={o.id} className="rounded-xl border border-[#26324a] bg-[#0f172a] p-3">
                        <p className="text-sm font-semibold text-white">{o.type || "order"}</p>
                        <p className="text-xs text-slate-400">{o.details || ""}</p>
                        <p className="text-xs text-yellow-300">{o.amount || 0} KZT</p>
                      </div>
                    ))}
                    {(rows.orders || []).length === 0 ? <p className="text-sm text-slate-400">Пока нет заказов.</p> : null}
                  </div>
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
                      <Link key={r.id} to={`/taxi/ride/${r.id}`} className="block rounded-xl border border-[#26324a] bg-[#0f172a] p-3 hover:border-yellow-400/40 transition-colors">
                        <div className="flex justify-between gap-2">
                          <p className="text-sm font-semibold text-white truncate">{r.from_address}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${TAXI_STATUS_LABELS[r.status]?.color || "bg-gray-100"}`}>
                            {TAXI_STATUS_LABELS[r.status]?.label || r.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">→ {r.to_address}</p>
                        <p className="text-xs text-yellow-300 mt-1">{formatTenge(r.final_price ?? r.estimated_price)}</p>
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
                      <div key={c.id} className="rounded-xl border border-[#26324a] bg-[#0f172a] p-3">
                        <p className="font-semibold text-white">{c.category || "Жалоба"}</p>
                        <p className="text-xs text-slate-400">{c.description || ""}</p>
                        <p className="text-xs text-slate-500">Статус: {c.status || "-"}</p>
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
                      <div key={a.id} className="rounded-xl border border-[#26324a] bg-[#0f172a] p-3">
                        <p className="font-semibold text-white">{a.title || "Объявление"}</p>
                        <p className="text-xs text-slate-500">Статус: {a.status || "-"}</p>
                        <p className="text-xs text-yellow-300">{a.price || ""}</p>
                      </div>
                    ))}
                    {(rows.announcements || []).length === 0 ? <p className="text-sm text-slate-400">Пока нет объявлений.</p> : null}
                  </div>
                </DarkCard>
              )}

              {activeTab === "settings" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">{t("cabinet.tab.settings")}</h2>
                  <div className="mb-6 space-y-3 rounded-xl border border-[#2a3347] bg-[#0f172a] p-4">
                    <h3 className="text-sm font-semibold text-white">{hasPassword ? t("cabinet.changePassword") : t("cabinet.setPassword")}</h3>
                    {hasPassword ? (
                      <input
                        type="password"
                        value={passwordForm.current}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                        className="w-full rounded-xl border border-[#2a3347] bg-[#111827] px-4 py-3 text-sm text-white"
                        placeholder="Текущий пароль"
                        autoComplete="current-password"
                      />
                    ) : null}
                    <input
                      type="password"
                      value={passwordForm.next}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
                      className="w-full rounded-xl border border-[#2a3347] bg-[#111827] px-4 py-3 text-sm text-white"
                      placeholder="Новый пароль (мин. 8 символов)"
                      autoComplete="new-password"
                    />
                    <input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                      className="w-full rounded-xl border border-[#2a3347] bg-[#111827] px-4 py-3 text-sm text-white"
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
                  <p className="mb-5 text-sm text-slate-300">{t("cabinet.langHint")}</p>
                  <button
                    onClick={() => {
                      logoutLocalUser();
                      navigate("/account");
                    }}
                    className="rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/10"
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
