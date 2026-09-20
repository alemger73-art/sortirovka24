import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Eye, EyeOff, Plus, RefreshCw, Save, Shield, Trash2, UserCog } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createPartnerCredential, deletePartnerCredential, listPartnerCredentials, updatePartnerCredential, PARTNER_MODULES, type PartnerCredential, type PartnerType } from '@/lib/partnerAuthApi';

type Role = 'owner' | 'operator';
type EditState = { role: Role; password: string; showPassword: boolean };

export default function AdminPartnerAccess({ partnerType }: { partnerType: PartnerType }) {
  const { t } = useLanguage();
  const cfg = PARTNER_MODULES[partnerType], isDam = partnerType === 'dam_alem';
  const [rows, setRows] = useState<PartnerCredential[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [email, setEmail] = useState(''), [phone, setPhone] = useState(''), [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false), [displayName, setDisplayName] = useState(cfg.defaultDisplayName), [role, setRole] = useState<Role>('operator');
  const [editing, setEditing] = useState<Record<number, EditState>>({});
  const url = useMemo(() => typeof window === 'undefined' ? cfg.route : `${window.location.origin}${cfg.route}`, [cfg.route]);
  async function load() { setLoading(true); try { setRows(await listPartnerCredentials(partnerType)); } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [partnerType]);
  function editor(row: PartnerCredential): EditState { return editing[row.id] || { role: row.access_role || 'owner', password: '', showPassword: false }; }
  function updateEditor(row: PartnerCredential, patch: Partial<EditState>) { setEditing(current => ({ ...current, [row.id]: { ...editor(row), ...patch } })); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() && !phone.trim()) return toast.error(t('admin.ui.1308'));
    if (password.length < (isDam ? 10 : 6)) return toast.error(t(isDam ? 'admin.dam.roles.password' : 'admin.ui.1309'));
    setSaving(true);
    try { await createPartnerCredential(partnerType, { email: email.trim() || undefined, phone: phone.trim() || undefined, password, display_name: displayName.trim() || cfg.defaultDisplayName, ...(isDam ? { access_role: role } : {}) }); setEmail(''); setPhone(''); setPassword(''); setRole('operator'); toast.success(t('admin.dam.access.created')); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  async function save(row: PartnerCredential) {
    const edit = editor(row);
    if (edit.password && edit.password.length < (isDam ? 10 : 6)) return toast.error(t('admin.dam.roles.password'));
    setSaving(true);
    try { await updatePartnerCredential(partnerType, row.id, { ...(isDam ? { access_role: edit.role } : {}), ...(edit.password ? { password: edit.password } : {}) }); setEditing(current => { const next = { ...current }; delete next[row.id]; return next; }); toast.success(t('admin.dam.access.saved')); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  async function toggle(row: PartnerCredential) { setSaving(true); try { await updatePartnerCredential(partnerType, row.id, { is_active: !row.is_active }); await load(); } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); } }
  async function remove(row: PartnerCredential) { if (!window.confirm(t('admin.dam.access.deleteConfirm').replace('{0}', row.display_name || row.email || row.phone || String(row.id)))) return; setSaving(true); try { await deletePartnerCredential(partnerType, row.id); toast.success(t('admin.dam.access.deleted')); await load(); } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); } }

  return <div className="space-y-6 rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
    <header className="space-y-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-lg font-bold"><Shield className={`h-5 w-5 ${cfg.accentClass}`} />{isDam ? t('admin.dam.roles.title') : `${t('admin.ui.1311')} ${cfg.label}`}</h3><p className="mt-1 text-sm text-muted-foreground">{isDam ? t('admin.dam.access.help') : t('admin.ui.1312')}</p></div><Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{t('admin.ui.0408')}</Button></div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-3 ring-1 ring-border"><code className="min-w-0 flex-1 break-all text-sm font-semibold">{url}</code><Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success(t('admin.ui.1306'))).catch(() => toast.error(t('admin.ui.1307')))}><Copy className="mr-2 h-4 w-4" />{t('admin.ui.1313')}</Button><Button size="sm" asChild className={cfg.buttonClass}><Link to={cfg.route} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />{t('admin.ui.1314')}</Link></Button></div></header>
    <section className="space-y-3"><div><h4 className="font-bold">{t('admin.dam.access.list')}</h4><p className="text-sm text-muted-foreground">{t('admin.dam.access.listHelp')}</p></div>{!loading && !rows.length && <p className="rounded-xl bg-muted p-4 text-sm">{t('admin.dam.access.empty')}</p>}
      {rows.map(row => { const edit = editor(row); return <article key={row.id} className="rounded-2xl border p-4 space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{row.display_name || cfg.defaultDisplayName}</p><p className="text-sm text-muted-foreground">{row.email || '—'} · {row.phone || '—'}</p></div><div className="flex gap-2"><Badge variant="outline">{isDam ? t(edit.role === 'owner' ? 'admin.dam.roles.owner' : 'admin.dam.roles.operator') : cfg.label}</Badge><Badge variant={row.is_active ? 'default' : 'secondary'}>{row.is_active ? t('admin.ui.0112') : t('admin.ui.1315')}</Badge></div></div>
        <div className="grid gap-3 md:grid-cols-2">{isDam && <label className="text-sm font-medium">{t('admin.dam.access.role')}<select className="mt-1 block w-full rounded-lg border bg-background p-2.5" value={edit.role} onChange={e => updateEditor(row, { role: e.target.value as Role })}><option value="owner">{t('admin.dam.roles.owner')}</option><option value="operator">{t('admin.dam.roles.operator')}</option></select><small className="mt-1 block text-muted-foreground">{t(edit.role === 'owner' ? 'admin.dam.access.ownerHelp' : 'admin.dam.access.operatorHelp')}</small></label>}<label className="text-sm font-medium">{t('admin.dam.access.newPassword')}<span className="mt-1 flex gap-2"><Input type={edit.showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder={t('admin.dam.access.passwordLeave')} value={edit.password} onChange={e => updateEditor(row, { password: e.target.value })} /><Button type="button" variant="outline" size="icon" aria-label={t('admin.dam.access.showPassword')} onClick={() => updateEditor(row, { showPassword: !edit.showPassword })}>{edit.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></span></label></div>
        <div className="flex flex-wrap gap-2"><Button disabled={saving} onClick={() => void save(row)}><Save className="mr-2 h-4 w-4" />{t('admin.dam.access.save')}</Button><Button variant="outline" disabled={saving} onClick={() => void toggle(row)}>{row.is_active ? t('admin.ui.1316') : t('admin.ui.1317')}</Button><Button variant="destructive" disabled={saving} onClick={() => void remove(row)}><Trash2 className="mr-2 h-4 w-4" />{t('admin.dam.access.delete')}</Button></div></article>; })}</section>
    <form onSubmit={create} className="rounded-2xl border border-dashed p-4 space-y-3"><div><h4 className="flex items-center gap-2 font-bold"><UserCog className="h-4 w-4" />{t('admin.dam.access.create')}</h4><p className="text-sm text-muted-foreground">{t('admin.dam.access.createHelp')}</p></div><div className="grid gap-3 sm:grid-cols-2"><Input placeholder={t('admin.ui.1321')} value={displayName} onChange={e => setDisplayName(e.target.value)} /><Input placeholder={isDam ? t('admin.dam.access.login') : t('admin.ui.1319')} value={email} onChange={e => setEmail(e.target.value)} /><Input placeholder={t('admin.ui.1320')} value={phone} onChange={e => setPhone(e.target.value)} />{isDam && <select className="rounded-lg border bg-background p-2.5" value={role} onChange={e => setRole(e.target.value as Role)}><option value="operator">{t('admin.dam.roles.operator')}</option><option value="owner">{t('admin.dam.roles.owner')}</option></select>}<span className="flex gap-2 sm:col-span-2"><Input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder={t('admin.dam.roles.passwordPlaceholder')} value={password} onChange={e => setPassword(e.target.value)} /><Button type="button" variant="outline" size="icon" onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></span></div><Button type="submit" disabled={saving}><Plus className="mr-2 h-4 w-4" />{saving ? t('admin.ui.0476') : t('admin.dam.access.createButton')}</Button></form>
  </div>;
}
