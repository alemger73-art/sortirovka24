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
        <h1 className="mb-5 text-2xl font-bold">Admin Dashboard</h1>
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
                {tab}
              </button>
            ))}
          </div>
          <div className="space-y-4">
            {activeTab === "dashboard" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <CabinetCard title="total users"><p className="text-2xl font-bold text-gray-900">{dashboard?.total_users || 0}</p></CabinetCard>
                <CabinetCard title="new users today"><p className="text-2xl font-bold text-gray-900">{dashboard?.new_users_today || 0}</p></CabinetCard>
                <CabinetCard title="active users"><p className="text-2xl font-bold text-gray-900">{dashboard?.active_users || 0}</p></CabinetCard>
                <CabinetCard title="total bonuses"><p className="text-2xl font-bold text-gray-900">{dashboard?.total_bonuses || 0}</p></CabinetCard>
                <CabinetCard title="total complaints"><p className="text-2xl font-bold text-gray-900">{dashboard?.total_complaints || 0}</p></CabinetCard>
                <CabinetCard title="total orders"><p className="text-2xl font-bold text-gray-900">{dashboard?.total_orders || 0}</p></CabinetCard>
              </div>
            )}

            {activeTab === "users" && (
              <CabinetCard title="Users management" subtitle="avatar / name / phone / email / role / status / created_at / bonus_balance">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm text-gray-700">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-2">name</th><th>phone</th><th>email</th><th>role</th><th>status</th><th>bonus</th><th>actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-t border-gray-100">
                          <td className="py-2">{u.name}</td>
                          <td>{u.phone}</td>
                          <td>{u.email}</td>
                          <td>{u.role}</td>
                          <td>{u.status}</td>
                          <td>{u.bonus_balance}</td>
                          <td className="space-x-2">
                            <button className="rounded bg-blue-600 px-2 py-1 text-xs text-white" onClick={async () => { await accountApi.adminUpdateUser(u.id, { status: u.status === "blocked" ? "active" : "blocked" }); setUsers(await accountApi.adminUsers()); }}>
                              {u.status === "blocked" ? "unblock" : "block"}
                            </button>
                            <button className="rounded bg-amber-500 px-2 py-1 text-xs text-black" onClick={async () => { await accountApi.adminUpdateUser(u.id, { bonus_delta: 100 }); setUsers(await accountApi.adminUsers()); }}>
                              +bonus
                            </button>
                            <button className="rounded bg-red-600 px-2 py-1 text-xs text-white" onClick={async () => { await accountApi.adminDeleteUser(u.id); setUsers(await accountApi.adminUsers()); }}>
                              delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CabinetCard>
            )}

            {activeTab === "registrations" && <CabinetCard title="Recent registrations"><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(registrations.slice(0, 30), null, 2)}</pre></CabinetCard>}
            {activeTab === "bonuses" && <CabinetCard title="Bonuses"><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(bonuses.slice(0, 30), null, 2)}</pre></CabinetCard>}
            {activeTab === "orders" && <CabinetCard title="Orders"><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(orders.slice(0, 30), null, 2)}</pre></CabinetCard>}
            {activeTab === "complaints" && <CabinetCard title="Complaints"><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(complaints.slice(0, 30), null, 2)}</pre></CabinetCard>}
            {activeTab === "announcements" && <CabinetCard title="Announcements"><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(announcements.slice(0, 30), null, 2)}</pre></CabinetCard>}
            {activeTab === "logs" && <CabinetCard title="Logs"><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(logs.slice(0, 50), null, 2)}</pre></CabinetCard>}
            {activeTab === "settings" && <CabinetCard title="Settings"><pre className="max-h-96 overflow-auto text-xs text-gray-700">{JSON.stringify(settings || {}, null, 2)}</pre></CabinetCard>}
          </div>
        </div>
      </div>
      </div>
    </Layout>
  );
}
