import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Copy, KeyRound, Plus, RefreshCw, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  createPartnerCredential,
  listPartnerCredentials,
  updatePartnerCredential,
  PARTNER_MODULES,
  type PartnerCredential,
  type PartnerType,
} from '@/lib/partnerAuthApi';

export default function AdminPartnerAccess({ partnerType }: { partnerType: PartnerType }) {
  const { t: adminT } = useLanguage();

  const cfg = PARTNER_MODULES[partnerType];
  const isDamAlem = partnerType === 'dam_alem';
  const [rows, setRows] = useState<PartnerCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(cfg.defaultDisplayName);
  const [saving, setSaving] = useState(false);

  const partnerAdminUrl = useMemo(() => {
    if (typeof window === 'undefined') return cfg.route;
    return `${window.location.origin}${cfg.route}`;
  }, [cfg.route]);

  async function copyPartnerLink() {
    try {
      await navigator.clipboard.writeText(partnerAdminUrl);
      toast.success(adminT("admin.ui.1306"));
    } catch {
      toast.error(adminT("admin.ui.1307"));
    }
  }

  async function load() {
    setLoading(true);
    try {
      setRows(await listPartnerCredentials(partnerType));
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [partnerType]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() && !phone.trim()) {
      toast.error(adminT("admin.ui.1308"));
      return;
    }
    if (password.length < (isDamAlem ? 10 : 6)) {
      toast.error(adminT(isDamAlem ? 'admin.dam.roles.password' : "admin.ui.1309"));
      return;
    }
    setSaving(true);
    try {
      await createPartnerCredential(partnerType, {
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        display_name: displayName.trim() || cfg.defaultDisplayName,
        ...(isDamAlem ? { access_role: 'owner' as const } : {}),
      });
      toast.success(adminT("admin.ui.1310"));
      setEmail('');
      setPhone('');
      setPassword('');
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: PartnerCredential) {
    try {
      await updatePartnerCredential(partnerType, row.id, { is_active: !row.is_active });
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || e));
    }
  }

  async function toggleRole(row: PartnerCredential) {
    const current = row.access_role || 'owner';
    try {
      await updatePartnerCredential(partnerType, row.id, {
        access_role: current === 'owner' ? 'operator' : 'owner',
      });
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || e));
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className={`h-5 w-5 ${cfg.accentClass}`} />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {isDamAlem ? adminT('admin.dam.roles.title') : <>{adminT("admin.ui.1311")} {partnerType === 'pharmacy' ? adminT('admin.partner.pharmacy.label') : cfg.label}</>}
            </h3>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">
            {isDamAlem ? adminT('admin.dam.roles.help') : adminT("admin.ui.1312")} </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
            <code className="flex-1 break-all text-sm font-semibold text-gray-800 dark:text-slate-100">{partnerAdminUrl}</code>
            <Button type="button" variant="outline" size="sm" onClick={copyPartnerLink} className="gap-1.5 shrink-0">
              <Copy className="h-4 w-4" /> {adminT("admin.ui.1313")} </Button>
            <Button type="button" size="sm" asChild className={`gap-1.5 shrink-0 text-white ${cfg.buttonClass}`}>
              <Link to={cfg.route} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> {adminT("admin.ui.1314")} </Link>
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {adminT("admin.ui.0408")} </Button>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{row.display_name || cfg.defaultDisplayName}</p>
                <p className="text-sm text-gray-500 dark:text-slate-300">{row.email || '—'} · {row.phone || '—'}</p>
              </div>
              <div className="flex items-center gap-2">
                {isDamAlem && (
                  <Badge variant="outline">
                    {adminT((row.access_role || 'owner') === 'owner' ? 'admin.dam.roles.owner' : 'admin.dam.roles.operator')}
                  </Badge>
                )}
                <Badge variant={row.is_active ? 'default' : 'secondary'}>
                  {row.is_active ? adminT("admin.ui.0112") : adminT("admin.ui.1315")}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => toggleActive(row)}>
                  {row.is_active ? adminT("admin.ui.1316") : adminT("admin.ui.1317")}
                </Button>
                {isDamAlem && (
                  <Button variant="outline" size="sm" onClick={() => toggleRole(row)}>
                    {adminT((row.access_role || 'owner') === 'owner' ? 'admin.dam.roles.makeOperator' : 'admin.dam.roles.makeOwner')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="rounded-xl border border-dashed border-gray-200 p-4 space-y-3 dark:border-slate-700">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-slate-100">
          <KeyRound className={`h-4 w-4 ${cfg.accentClass}`} /> {isDamAlem ? adminT('admin.dam.roles.createOwner') : adminT("admin.ui.1318")} </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder={adminT("admin.ui.1319")} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder={adminT("admin.ui.1320")} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input placeholder={adminT("admin.ui.1321")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <Input type="password" placeholder={adminT("admin.ui.1322")} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={saving} className={`gap-1.5 text-white ${cfg.buttonClass}`}>
          <Plus className="h-4 w-4" /> {saving ? adminT("admin.ui.0476") : adminT("admin.ui.1323")}
        </Button>
        <p className="text-xs text-gray-400">
          {isDamAlem
            ? adminT('admin.dam.roles.createOwnerHelp')
            : <>{adminT("admin.ui.1324")} {adminT(`admin.partner.${partnerType}.description`)} {adminT("admin.ui.1325")}</>} </p>
      </form>
    </div>
  );
}
