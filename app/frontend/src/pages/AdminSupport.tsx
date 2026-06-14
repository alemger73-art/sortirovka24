import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ImageUpload from '@/components/ImageUpload';
import { invalidateSupportSettingsCache, supportApi } from '@/lib/supportApi';
import { Heart, Loader2, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';

const FIELDS: { key: string; label: string; placeholder?: string; multiline?: boolean }[] = [
  { key: 'recipient', label: 'Получатель', placeholder: 'ИП Иванов И.И.' },
  { key: 'bank', label: 'Банк', placeholder: 'АО «Kaspi Bank»' },
  { key: 'iban', label: 'IBAN', placeholder: 'KZ...' },
  { key: 'bin', label: 'БИН / ИИН', placeholder: '12 цифр' },
  { key: 'kaspi_phone', label: 'Kaspi (номер)', placeholder: '+7 (700) 123-45-67' },
  { key: 'purpose', label: 'Назначение платежа', placeholder: 'Поддержка Sortirovka24' },
  { key: 'contact_email', label: 'Email для вопросов', placeholder: 'sortirovka.portal@mail.ru' },
];

export default function AdminSupport() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supportApi.adminSettings();
      setSettings(data);
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка загрузки'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const updated = await supportApi.adminUpdateSettings(settings);
      setSettings(updated);
      invalidateSupportSettingsCache();
      toast.success('Настройки поддержки сохранены');
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка сохранения'));
    } finally {
      setSaving(false);
    }
  }

  const promoOn = settings.promo_enabled !== 'false';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-5 h-5 text-rose-500" />
              <h2 className="text-lg font-bold text-gray-900">Поддержка проекта</h2>
            </div>
            <p className="text-sm text-gray-500">
              Реквизиты на странице <code className="text-xs bg-gray-100 px-1 rounded">/support</code>.
              Промо-блок на главной и ссылка в футере включаются отдельно.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, promo_enabled: promoOn ? 'false' : 'true' })}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 shrink-0"
          >
            {promoOn ? <ToggleRight className="w-8 h-8 text-emerald-500" /> : <ToggleLeft className="w-8 h-8 text-gray-400" />}
            Промо на сайте
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">Реквизиты</h3>
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <Input
              value={settings[key] || ''}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
              placeholder={placeholder}
              className="rounded-xl"
            />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
        <h3 className="font-semibold text-gray-900">Kaspi QR</h3>
        <p className="text-sm text-gray-500">
          Загрузите QR-код из приложения Kaspi — он появится на странице поддержки рядом с реквизитами.
        </p>
        <ImageUpload
          value={settings.kaspi_qr_url || ''}
          onChange={(url) => setSettings({ ...settings, kaspi_qr_url: url })}
          folder="support"
        />
      </div>

      <Button onClick={save} disabled={saving} className="rounded-xl gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Сохранить
      </Button>
    </div>
  );
}
