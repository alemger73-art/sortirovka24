import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import { accountApi } from "@/lib/accountApi";

type AdminTab =
  | "dashboard"
  | "users"
  | "registrations"
  | "bonuses"
  | "orders"
  | "complaints"
  | "announcements"
  | "logs"
  | "settings";

export default function CabinetAdmin() {
  const { t: coverageT } = useLanguage();
  const roleKeys: Record<string, string> = {"user":"public.coverage.role.user","admin":"public.coverage.role.admin","superadmin":"public.coverage.role.superadmin","moderator":"public.coverage.role.moderator","master":"public.coverage.role.master","driver":"public.coverage.role.driver","courier":"public.coverage.role.courier","seller":"public.coverage.role.seller"};
  const tabKeys: Record<AdminTab, string> = {"dashboard":"public.coverage.tab.dashboard","users":"public.coverage.tab.users","registrations":"public.coverage.registrations","bonuses":"public.coverage.bonuses","orders":"public.coverage.orders","complaints":"public.coverage.complaints","announcements":"public.coverage.announcements","logs":"public.coverage.logs","settings":"public.coverage.settings"};
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [d, u, r, b, o, c, a, l, s] = await Promise.all([
          accountApi.adminDashboard(),
          accountApi.adminUsers(),
          accountApi.adminRegistrations(),
          accountApi.adminBonuses(),
          accountApi.adminOrders(),
          accountApi.adminComplaints(),
          accountApi.adminAnnouncements(),
          accountApi.adminLogs(),
          accountApi.adminSettings(),
        ]);
        setDashboard(d);
        setUsers(u);
        setRegistrations(r);
        setBonuses(b);
        setOrders(o);
        setComplaints(c);
        setAnnouncements(a);
        setLogs(l);
        setSettings(s);
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  return (
    <Layout>
      <div className="min-h-screen bg-[#0B0F19] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="mb-5 text-2xl font-bold">{coverageT("public.coverage.adminTitle")}</h1>
        {error ? <p className="mb-4 text-red-600">{error}</p> : null}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-[#1f2a3f] bg-[#111827] p-4">
            {(["dashboard","users","registrations","bonuses","orders","complaints","announcements","logs","settings"] as AdminTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`mb-2 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                  activeTab === tab ? "bg-yellow-400 text-black" : "bg-[#0f172a] text-slate-200 hover:bg-[#1a2336]"
                }`}
              >
                {coverageT(tabKeys[tab])}
              </button>
            ))}
          </div>
          <div className="space-y-4">
            {activeTab === "dashboard" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <CabinetCard title={coverageT("public.coverage.totalUsers")}><p className="text-2xl font-bold text-gray-900">{dashboard?.total_users || 0}</p></CabinetCard>
                <CabinetCard title={coverageT("public.coverage.newUsers")}><p className="text-2xl font-bold text-gray-900">{dashboard?.new_users_today || 0}</p></CabinetCard>
                <CabinetCard title={coverageT("public.coverage.activeUsers")}><p className="text-2xl font-bold text-gray-900">{dashboard?.active_users || 0}</p></CabinetCard>
                <CabinetCard title={coverageT("public.coverage.totalBonuses")}><p className="text-2xl font-bold text-gray-900">{dashboard?.total_bonuses || 0}</p></CabinetCard>
                <CabinetCard title={coverageT("public.coverage.totalComplaints")}><p className="text-2xl font-bold text-gray-900">{dashboard?.total_complaints || 0}</p></CabinetCard>
                <CabinetCard title={coverageT("public.coverage.totalOrders")}><p className="text-2xl font-bold text-gray-900">{dashboard?.total_orders || 0}</p></CabinetCard>
              </div>
            )}

            {activeTab === "users" && (
              <CabinetCard title={coverageT("public.coverage.usersManagement")} subtitle={coverageT("public.coverage.userFields")}>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm text-gray-700">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-2">{coverageT("public.coverage.name")}</th><th>{coverageT("public.coverage.phone")}</th><th>{coverageT("public.coverage.emailField")}</th><th>{coverageT("public.coverage.role")}</th><th>{coverageT("public.coverage.status")}</th><th>{coverageT("public.coverage.bonus")}</th><th>{coverageT("public.coverage.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-t border-gray-100">
                          <td className="py-2">{u.name}</td>
                          <td>{u.phone}</td>
                          <td>{u.email}</td>
                          <td>{roleKeys[u.role] ? coverageT(roleKeys[u.role]) : u.role}</td>
                          <td>{u.status === 'blocked' ? coverageT('public.coverage.blocked') : u.status === 'active' ? coverageT('public.coverage.active') : u.status}</td>
                          <td>{u.bonus_balance}</td>
                          <td className="space-x-2">
                            <button className="rounded bg-blue-600 px-2 py-1 text-xs text-white" onClick={async () => { await accountApi.adminUpdateUser(u.id, { status: u.status === "blocked" ? "active" : "blocked" }); setUsers(await accountApi.adminUsers()); }}>
                              {u.status === "blocked" ? coverageT('public.coverage.unblock') : coverageT('public.coverage.block')}
                            </button>
                            <button className="rounded bg-amber-500 px-2 py-1 text-xs text-black" onClick={async () => { await accountApi.adminUpdateUser(u.id, { bonus_delta: 100 }); setUsers(await accountApi.adminUsers()); }}>
                              {coverageT("public.coverage.addBonus")}</button>
                            <button className="rounded bg-red-600 px-2 py-1 text-xs text-white" onClick={async () => { await accountApi.adminDeleteUser(u.id); setUsers(await accountApi.adminUsers()); }}>
                              {coverageT("public.coverage.delete")}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CabinetCard>
            )}

            {activeTab === "registrations" && <CabinetCard title={coverageT("public.coverage.registrations")}><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(registrations.slice(0, 30), null, 2)}</pre></CabinetCard>}
            {activeTab === "bonuses" && <CabinetCard title={coverageT("public.coverage.bonuses")}><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(bonuses.slice(0, 30), null, 2)}</pre></CabinetCard>}
            {activeTab === "orders" && <CabinetCard title={coverageT("public.coverage.orders")}><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(orders.slice(0, 30), null, 2)}</pre></CabinetCard>}
            {activeTab === "complaints" && <CabinetCard title={coverageT("public.coverage.complaints")}><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(complaints.slice(0, 30), null, 2)}</pre></CabinetCard>}
            {activeTab === "announcements" && <CabinetCard title={coverageT("public.coverage.announcements")}><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(announcements.slice(0, 30), null, 2)}</pre></CabinetCard>}
            {activeTab === "logs" && <CabinetCard title={coverageT("public.coverage.logs")}><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(logs.slice(0, 50), null, 2)}</pre></CabinetCard>}
            {activeTab === "settings" && <CabinetCard title={coverageT("public.coverage.settings")}><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(settings || {}, null, 2)}</pre></CabinetCard>}
          </div>
        </div>
      </div>
      </div>
    </Layout>
  );
}
