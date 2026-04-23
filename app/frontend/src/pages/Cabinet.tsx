import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { Link, useNavigate } from "react-router-dom";
import {
  CabinetItem,
  changeCurrentUserPassword,
  deleteCabinetItem,
  getCabinetData,
  getCurrentUser,
  logoutLocalUser,
  onAuthChanged,
  setNotificationsEnabled,
  updateCurrentUserProfile,
  upsertCabinetItem,
} from "@/lib/localAuth";
import { Camera, CheckCircle2, Clock3, Coins, Edit3, Save, ShieldCheck, Trash2, UserCircle2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type TabId = "profile" | "bonuses" | "history" | "actions" | "settings";
type ActionSection = "announcements" | "complaints" | "masterRequests";

function formatCabinetDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DarkCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#1f2a3f] bg-[#111827] p-5 shadow-[0_10px_25px_rgba(0,0,0,0.25)]">
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const value = status || "В процессе";
  const low = value.toLowerCase();
  const isModeration = low.includes("модерац");
  const isDone = low.includes("выполн") || low.includes("отправ");
  const cls = isModeration
    ? "bg-amber-500/20 text-amber-300"
    : isDone
      ? "bg-emerald-500/20 text-emerald-300"
      : "bg-blue-500/20 text-blue-300";
  const Icon = isModeration ? ShieldCheck : isDone ? CheckCircle2 : Clock3;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {value}
    </span>
  );
}

export default function Cabinet() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [user, setUser] = useState(getCurrentUser());

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", phone: "", email: "", avatar: "" });
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "" });
  const [actionForm, setActionForm] = useState({
    section: "announcements" as ActionSection,
    id: "",
    title: "",
    subtitle: "",
    status: "В процессе",
  });
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyType, setHistoryType] = useState<"all" | "food" | "masters" | "announcements" | "complaints">("all");
  const [historySort, setHistorySort] = useState<"new" | "old">("new");
  const [historyPage, setHistoryPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ section: ActionSection; id: string } | null>(null);
  const [error, setError] = useState("");
  const tabs: { id: TabId; label: string }[] = [
    { id: "profile", label: t('cabinet.tab.profile') },
    { id: "bonuses", label: t('cabinet.tab.bonuses') },
    { id: "history", label: t('cabinet.tab.history') },
    { id: "actions", label: t('cabinet.tab.actions') },
    { id: "settings", label: t('cabinet.tab.settings') },
  ];

  useEffect(() => {
    const syncUser = () => setUser(getCurrentUser());
    syncUser();
    return onAuthChanged(syncUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      name: user.name || "",
      phone: user.phone || "",
      email: user.email || "",
      avatar: user.avatar || "",
    });
  }, [user]);

  if (!user) {
    return (
      <Layout>
        <div className="mx-auto max-w-6xl px-4 py-10 text-slate-200">
          <p>{t('cabinet.notLoggedIn')}</p>
          <Link to="/login" className="mt-3 inline-block text-yellow-300">{t('cabinet.loginOrRegister')}</Link>
        </div>
      </Layout>
    );
  }

  const data = getCabinetData(user.id);

  const historyItems = useMemo(() => {
    const sections = [
      ...data.foodOrders.map((x) => ({ ...x, kind: "Заказ еды", type: "food" as const })),
      ...data.masterRequests.map((x) => ({ ...x, kind: "Заявка мастеру", type: "masters" as const })),
      ...data.announcements.map((x) => ({ ...x, kind: "Объявление", type: "announcements" as const })),
      ...data.complaints.map((x) => ({ ...x, kind: "Жалоба", type: "complaints" as const })),
    ];
    const filtered = sections
      .filter((x) => (historyType === "all" ? true : x.type === historyType))
      .filter((x) => {
        if (!historyQuery.trim()) return true;
        const q = historyQuery.toLowerCase();
        return (
          x.kind.toLowerCase().includes(q) ||
          x.title.toLowerCase().includes(q) ||
          (x.subtitle || "").toLowerCase().includes(q) ||
          (x.status || "").toLowerCase().includes(q)
        );
      });
    return filtered.sort((a, b) =>
      historySort === "new"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [data, historyQuery, historyType, historySort]);

  const historyPageSize = 10;
  const historyPageCount = Math.max(1, Math.ceil(historyItems.length / historyPageSize));
  const historyVisible = historyItems.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );

  useEffect(() => {
    setHistoryPage(1);
  }, [historyQuery, historyType, historySort]);

  const actionRows = {
    announcements: data.announcements || [],
    complaints: data.complaints || [],
    masterRequests: data.masterRequests || [],
  };

  const sectionLabel: Record<ActionSection, string> = {
    announcements: "Объявления",
    complaints: "Жалобы",
    masterRequests: "Заявки мастерам",
  };

  const saveProfile = () => {
    setError("");
    try {
      updateCurrentUserProfile(profileForm);
      setEditingProfile(false);
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

  const savePassword = () => {
    setError("");
    try {
      changeCurrentUserPassword(passwordForm.current, passwordForm.next);
      setPasswordForm({ current: "", next: "" });
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  };

  const saveAction = () => {
    if (!actionForm.title.trim()) return;
    const id = actionForm.id || `i_${Date.now()}`;
    upsertCabinetItem(user.id, actionForm.section, {
      id,
      title: actionForm.title.trim(),
      subtitle: actionForm.subtitle.trim() || undefined,
      status: actionForm.status,
      createdAt: new Date().toISOString(),
    });
    setActionForm({ section: actionForm.section, id: "", title: "", subtitle: "", status: "В процессе" });
  };

  return (
    <Layout>
      <div className="min-h-screen bg-[#0B0F19] px-4 py-8 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold">{t('cabinet.personalTitle')}</h1>
              <p className="text-slate-300">{user.name} · {user.phone}</p>
            </div>
            <button
              className="rounded-xl border border-[#2a3347] bg-[#111827] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a2336]"
              onClick={() => {
                logoutLocalUser();
                navigate("/login");
              }}
            >
              {t('auth.logout')}
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
                        : "bg-[#0f172a] text-slate-200 hover:bg-[#1a2336]"
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
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold">Мой профиль</h2>
                    <button
                      onClick={() => setEditingProfile((v) => !v)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#2a3347] px-3 py-2 text-sm hover:bg-[#1a2336]"
                    >
                      <Edit3 className="h-4 w-4" /> Редактировать профиль
                    </button>
                  </div>
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
                      <input disabled={!editingProfile} value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-xl border border-[#2a3347] bg-[#0f172a] px-4 py-3 text-sm text-white disabled:opacity-80" placeholder="Имя" />
                      <input disabled={!editingProfile} value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} className="w-full rounded-xl border border-[#2a3347] bg-[#0f172a] px-4 py-3 text-sm text-white disabled:opacity-80" placeholder="Телефон" />
                      <input disabled={!editingProfile} value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} className="w-full rounded-xl border border-[#2a3347] bg-[#0f172a] px-4 py-3 text-sm text-white disabled:opacity-80" placeholder="Email" />
                      {editingProfile ? (
                        <button onClick={saveProfile} className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-[#0B0F19]">
                          <Save className="h-4 w-4" /> Сохранить изменения
                        </button>
                      ) : null}
                    </div>
                  </div>
                </DarkCard>
              )}

              {activeTab === "bonuses" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">Мои бонусы</h2>
                  <div className="rounded-2xl border border-yellow-400/30 bg-gradient-to-r from-yellow-500/20 to-amber-400/10 p-5">
                    <p className="text-sm text-yellow-100/80">Текущий баланс</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Coins className="h-7 w-7 text-yellow-300" />
                      <p className="text-4xl font-black text-yellow-300">{data.bonusBalance.toLocaleString("ru-RU")}</p>
                    </div>
                    <p className="mt-1 text-sm text-yellow-100/70">Потратить можно на скидки в еде и приоритет размещения объявлений</p>
                  </div>
                  <div className="mt-4 space-y-2">
                    {data.bonusHistory.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-[#2a3347] bg-[#0f172a] p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white">{entry.title}</p>
                          <p className="font-semibold text-yellow-300">+{entry.amount}</p>
                        </div>
                        <p className="text-xs text-slate-400">{formatCabinetDate(entry.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </DarkCard>
              )}

              {activeTab === "history" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">История</h2>
                  <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
                    <input
                      value={historyQuery}
                      onChange={(e) => setHistoryQuery(e.target.value)}
                      className="rounded-xl border border-[#2a3347] bg-[#0f172a] px-3 py-2 text-sm text-white md:col-span-2"
                      placeholder="Поиск по истории..."
                    />
                    <select
                      value={historyType}
                      onChange={(e) => setHistoryType(e.target.value as any)}
                      className="rounded-xl border border-[#2a3347] bg-[#0f172a] px-3 py-2 text-sm text-white"
                    >
                      <option value="all">Все типы</option>
                      <option value="food">Заказы еды</option>
                      <option value="masters">Заявки мастеру</option>
                      <option value="announcements">Объявления</option>
                      <option value="complaints">Жалобы</option>
                    </select>
                    <select
                      value={historySort}
                      onChange={(e) => setHistorySort(e.target.value as "new" | "old")}
                      className="rounded-xl border border-[#2a3347] bg-[#0f172a] px-3 py-2 text-sm text-white"
                    >
                      <option value="new">Сначала новые</option>
                      <option value="old">Сначала старые</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    {historyItems.length === 0 ? (
                      <p className="text-sm text-slate-400">Пока нет действий.</p>
                    ) : (
                      historyVisible.map((item) => (
                        <div key={`${item.kind}-${item.id}`} className="rounded-xl border border-[#26324a] bg-[#0f172a] p-3">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-white">{item.kind}</p>
                            <StatusBadge status={item.status} />
                          </div>
                          <p className="text-sm text-slate-200">{item.title}</p>
                          {item.subtitle ? <p className="text-xs text-slate-400">{item.subtitle}</p> : null}
                          <p className="mt-1 text-xs text-slate-500">{formatCabinetDate(item.createdAt)}</p>
                        </div>
                      ))
                    )}
                  </div>
                  {historyItems.length > historyPageSize && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-xs text-slate-400">
                        Страница {historyPage} из {historyPageCount}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                          disabled={historyPage <= 1}
                          className="rounded-lg border border-[#2a3347] px-3 py-1.5 text-xs text-white disabled:opacity-40"
                        >
                          Назад
                        </button>
                        <button
                          onClick={() => setHistoryPage((p) => Math.min(historyPageCount, p + 1))}
                          disabled={historyPage >= historyPageCount}
                          className="rounded-lg border border-[#2a3347] px-3 py-1.5 text-xs text-white disabled:opacity-40"
                        >
                          Вперёд
                        </button>
                      </div>
                    </div>
                  )}
                </DarkCard>
              )}

              {activeTab === "actions" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">Мои действия</h2>
                  <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <select
                      value={actionForm.section}
                      onChange={(e) => setActionForm((p) => ({ ...p, section: e.target.value as ActionSection, id: "" }))}
                      className="rounded-xl border border-[#2a3347] bg-[#0f172a] px-3 py-2 text-sm text-white"
                    >
                      <option value="announcements">Мои объявления</option>
                      <option value="complaints">Мои жалобы</option>
                      <option value="masterRequests">Мои заявки мастерам</option>
                    </select>
                    <input value={actionForm.title} onChange={(e) => setActionForm((p) => ({ ...p, title: e.target.value }))} className="rounded-xl border border-[#2a3347] bg-[#0f172a] px-3 py-2 text-sm text-white md:col-span-2" placeholder="Заголовок" />
                    <button onClick={saveAction} className="rounded-xl bg-yellow-400 px-3 py-2 text-sm font-semibold text-[#0B0F19]">
                      {actionForm.id ? "Сохранить" : "Создать новое"}
                    </button>
                  </div>
                  <input value={actionForm.subtitle} onChange={(e) => setActionForm((p) => ({ ...p, subtitle: e.target.value }))} className="mb-3 w-full rounded-xl border border-[#2a3347] bg-[#0f172a] px-3 py-2 text-sm text-white" placeholder="Краткое описание" />
                  <input value={actionForm.status} onChange={(e) => setActionForm((p) => ({ ...p, status: e.target.value }))} className="mb-4 w-full rounded-xl border border-[#2a3347] bg-[#0f172a] px-3 py-2 text-sm text-white" placeholder="Статус" />

                  <div className="space-y-2">
                    {(actionRows[actionForm.section] || []).map((item) => (
                      <div key={item.id} className="rounded-xl border border-[#26324a] bg-[#0f172a] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{item.title}</p>
                            <p className="text-xs text-slate-400">{item.subtitle}</p>
                            <p className="text-xs text-slate-500">{formatCabinetDate(item.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setActionForm({ section: actionForm.section, id: item.id, title: item.title, subtitle: item.subtitle || "", status: item.status || "В процессе" })}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#2a3347] px-2 py-1 text-xs text-white hover:bg-[#1a2336]"
                            >
                              <Edit3 className="h-3.5 w-3.5" /> Редактировать
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ section: actionForm.section, id: item.id })}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Удалить
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(actionRows[actionForm.section] || []).length === 0 ? <p className="text-sm text-slate-400">Нет записей в разделе «{sectionLabel[actionForm.section]}».</p> : null}
                  </div>
                </DarkCard>
              )}

              {activeTab === "settings" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">Настройки</h2>
                  <div className="mb-5 rounded-xl border border-[#2a3347] bg-[#0f172a] p-4">
                    <p className="mb-2 text-sm font-semibold text-white">Смена пароля</p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))} className="rounded-xl border border-[#2a3347] bg-[#0b1324] px-3 py-2 text-sm text-white" placeholder="Текущий пароль" />
                      <input type="password" value={passwordForm.next} onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))} className="rounded-xl border border-[#2a3347] bg-[#0b1324] px-3 py-2 text-sm text-white" placeholder="Новый пароль" />
                      <button onClick={savePassword} className="rounded-xl bg-yellow-400 px-3 py-2 text-sm font-semibold text-[#0B0F19]">Сменить пароль</button>
                    </div>
                  </div>

                  <div className="mb-5 rounded-xl border border-[#2a3347] bg-[#0f172a] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Уведомления</p>
                        <p className="text-xs text-slate-400">Включить/выключить уведомления кабинета</p>
                      </div>
                      <button
                        onClick={() => setNotificationsEnabled(user.id, !data.notificationsEnabled)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                          data.notificationsEnabled
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-slate-700 text-slate-200"
                        }`}
                      >
                        {data.notificationsEnabled ? "Включены" : "Выключены"}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      logoutLocalUser();
                      navigate("/login");
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
      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#2a3347] bg-[#111827] p-5 text-white">
            <h3 className="text-lg font-bold">Удалить запись?</h3>
            <p className="mt-2 text-sm text-slate-300">Это действие нельзя отменить.</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-[#2a3347] px-3 py-2 text-sm hover:bg-[#1a2336]"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  deleteCabinetItem(user.id, deleteTarget.section, deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="flex-1 rounded-xl border border-red-500/40 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
