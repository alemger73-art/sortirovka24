import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import { accountApi } from "@/lib/accountApi";

export default function CabinetAdmin() {
  const [users, setUsers] = useState<any[]>([]);
  const [moderation, setModeration] = useState<any>({});
  const [payments, setPayments] = useState<any[]>([]);
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [toggles, setToggles] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [u, m, p, b, t, l] = await Promise.all([
          accountApi.adminUsers(),
          accountApi.adminModeration(),
          accountApi.adminPayments(),
          accountApi.adminBonuses(),
          accountApi.adminFeatureToggles(),
          accountApi.adminLogs(),
        ]);
        setUsers(u);
        setModeration(m);
        setPayments(p);
        setBonuses(b);
        setToggles(t);
        setLogs(l);
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="mb-5 text-2xl font-bold text-gray-900">Admin Cabinet</h1>
        {error ? <p className="mb-4 text-red-600">{error}</p> : null}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CabinetCard title="Users"><p className="text-2xl font-bold">{users.length}</p></CabinetCard>
          <CabinetCard title="Moderation"><p className="text-sm text-gray-600">Ads: {(moderation?.ads || []).length} / Complaints: {(moderation?.complaints || []).length} / News: {(moderation?.news || []).length}</p></CabinetCard>
          <CabinetCard title="Payments"><p className="text-2xl font-bold">{payments.length}</p></CabinetCard>
          <CabinetCard title="Bonuses"><p className="text-2xl font-bold">{bonuses.length}</p></CabinetCard>
          <CabinetCard title="Feature Toggles"><p className="text-2xl font-bold">{toggles.length}</p></CabinetCard>
          <CabinetCard title="Logs"><p className="text-2xl font-bold">{logs.length}</p></CabinetCard>
        </div>
      </div>
    </Layout>
  );
}
