import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { Link, useNavigate } from "react-router-dom";
import { Camera, Coins, Save, UserCircle2 } from "lucide-react";
import { accountApi, clearAccountToken, getAccountToken } from "@/lib/accountApi";

type TabId = "profile" | "bonuses" | "orders" | "complaints" | "announcements" | "settings";

function DarkCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_10px_25px_rgba(0,0,0,0.12)] dark:border-[#1f2a3f] dark:bg-[#111827] dark:shadow-[0_10px_25px_rgba(0,0,0,0.25)]">
      {children}
    </div>
  );
}

export default function Cabinet() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [loading, setLoading] = useState(true);
  const [cabinet, setCabinet] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({ name: "", email: "", avatar: "", language: "ru" });
  const [error, setError] = useState("");
  const tabs: { id: TabId; label: string }[] = [
    { id: "profile", label: "Профиль" },
    { id: "bonuses", label: "Бонусы" },
    { id: "orders", label: "История заказов" },
    { id: "complaints", label: "История жалоб" },
    { id: "announcements", label: "История объявлений" },
    { id: "settings", label: "Настройки" },
  ];

  useEffect(() => {
    (async () => {
      if (!getAccountToken()) {
        navigate("/account");
        return;
      }
      try {
        const data = await accountApi.cabinet();
        setCabinet(data);
        setProfileForm({
          name: data?.profile?.name || "",
          email: data?.profile?.email || "",
          avatar: data?.profile?.avatar || "",
          language: data?.profile?.language || "ru",
        });
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const saveProfile = async () => {
    try {
      await accountApi.updateMe({
        name: profileForm.name,
        email: profileForm.email || undefined,
        avatar: profileForm.avatar || undefined,
        language: profileForm.language,
      });
      const refreshed = await accountApi.cabinet();
      setCabinet(refreshed);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  };

  const onAvatarUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProfileForm((p) => ({ ...p, avatar: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const rows = useMemo(() => ({
    bonuses: cabinet?.bonuses || [],
    orders: cabinet?.orders || [],
    complaints: cabinet?.complaints || [],
    announcements: cabinet?.announcements || [],
  }), [cabinet]);

  if (loading) return <Layout><div className="mx-auto max-w-6xl px-4 py-10 text-gray-500 dark:text-slate-300">Загрузка кабинета...</div></Layout>;

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 dark:bg-[#0B0F19] dark:text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold">Личный кабинет</h1>
              <p className="text-gray-500 dark:text-slate-300">{cabinet?.profile?.name} · {cabinet?.profile?.phone}</p>
            </div>
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-[#2a3347] dark:bg-[#111827] dark:text-white dark:hover:bg-[#1a2336]"
              onClick={() => {
                clearAccountToken();
                navigate("/account");
              }}
            >
              Выход
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
                        <Camera className="h-4 w-4" /> Загрузить
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => onAvatarUpload(e.target.files?.[0])} />
                      </label>
                      {profileForm.avatar ? (
                        <button
                          onClick={() => setProfileForm((p) => ({ ...p, avatar: "" }))}
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
                      <button onClick={saveProfile} className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-[#0B0F19]">
                        <Save className="h-4 w-4" /> Сохранить изменения
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
                    <p className="mt-1 text-sm text-yellow-100/70">Доступные начисления и история изменений</p>
                  </div>
                  <div className="mt-4 space-y-2">
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
                  <h2 className="mb-4 text-xl font-bold">Настройки</h2>
                  <p className="mb-5 text-sm text-slate-300">Язык интерфейса, согласия и безопасность аккаунта управляются через профиль и серверные политики.</p>
                  <button
                    onClick={() => {
                      clearAccountToken();
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
