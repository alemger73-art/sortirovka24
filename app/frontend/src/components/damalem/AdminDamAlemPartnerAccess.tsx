import { useEffect, useState } from 'react';
import { KeyRound, Plus, RefreshCw, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  createDamAlemPartnerCredential,
  listDamAlemPartnerCredentials,
  updateDamAlemPartnerCredential,
  type PartnerCredential,
} from '@/lib/partnerAuthApi';

export default function AdminDamAlemPartnerAccess() {
  const [rows, setRows] = useState<PartnerCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('DAM ALEM');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setRows(await listDamAlemPartnerCredentials());
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() && !phone.trim()) {
      toast.error('Укажите email или телефон');
      return;
    }
    if (password.length < 6) {
      toast.error('Пароль — минимум 6 символов');
      return;
    }
    setSaving(true);
    try {
      await createDamAlemPartnerCredential({
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        display_name: displayName.trim() || 'DAM ALEM',
      });
      toast.success('Доступ партнёра создан');
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
      await updateDamAlemPartnerCredential(row.id, { is_active: !row.is_active });
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || e));
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#FF3B30]" />
            <h3 className="text-lg font-bold text-gray-900">Доступ партнёра DAM ALEM</h3>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Отдельная админка: <code className="rounded bg-gray-100 px-1">/partner/dam-alem</code> — вход по email или телефону и паролю.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Обновить
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3">
              <div>
                <p className="font-semibold text-gray-900">{row.display_name || 'DAM ALEM'}</p>
                <p className="text-sm text-gray-500">
                  {row.email || '—'} · {row.phone || '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={row.is_active ? 'default' : 'secondary'}>
                  {row.is_active ? 'Активен' : 'Отключён'}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => toggleActive(row)}>
                  {row.is_active ? 'Отключить' : 'Включить'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="rounded-xl border border-dashed border-gray-200 p-4 space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <KeyRound className="h-4 w-4 text-[#FF3B30]" /> Создать или обновить доступ
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Email партнёра" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Телефон (+7…)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input placeholder="Имя в админке" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <Input type="password" placeholder="Пароль (мин. 6 символов)" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={saving} className="gap-1.5 bg-[#FF3B30] hover:bg-[#e8352b]">
          <Plus className="h-4 w-4" /> {saving ? 'Сохранение…' : 'Выдать доступ'}
        </Button>
        <p className="text-xs text-gray-400">
          Передайте партнёру ссылку и пароль. Они смогут управлять меню, заказами, баннерами и настройками доставки без доступа к системной админке.
        </p>
      </form>
    </div>
  );
}
