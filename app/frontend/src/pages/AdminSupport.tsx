import { useLanguage } from '@/contexts/LanguageContext';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ImageUpload from '@/components/ImageUpload';
import { invalidateSupportSettingsCache, supportApi } from '@/lib/supportApi';
import { Heart, Loader2, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';

function getFIELDS(adminT: (key: string) => string) {
  const FIELDS: { key: string; label: string; placeholder?: string; multiline?: boolean }[] = [
  { key: 'recipient', label: adminT("admin.ui.1129"), placeholder: adminT("admin.ui.1130") },
  { key: 'bank', label: adminT("admin.ui.1131"), placeholder: adminT("admin.ui.1132") },
  { key: 'iban', label: 'IBAN', placeholder: 'KZ...' },
  { key: 'bin', label: adminT("admin.ui.1133"), placeholder: adminT("admin.ui.1134") },
  { key: 'kaspi_phone', label: adminT("admin.ui.1135"), placeholder: '+7 (700) 123-45-67' },
  { key: 'purpose', label: adminT("admin.ui.1136"), placeholder: adminT("admin.ui.1137") },
  { key: 'contact_email', label: adminT("admin.ui.1138"), placeholder: 'sortirovka.portal@mail.ru' },
];
  return FIELDS;
}

export default function AdminSupport() {
  const { t: adminT } = useLanguage();
  const FIELDS = getFIELDS(adminT);

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await supportApi.adminSettings();
      setSettings(data);
    } catch (e: any) {
      setLoadError(true);
      toast.error(String(e?.message || adminT("admin.ui.0044")));
    } finally {
      setLoading(false);
    }
  }, [adminT]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const updated = await supportApi.adminUpdateSettings(settings);
      setSettings(updated);
      invalidateSupportSettingsCache();
      toast.success(adminT("admin.ui.1139"));
    } catch (e: any) {
      toast.error(String(e?.message || adminT("admin.ui.0055")));
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

  if (loadError) return <div role="alert" className="rounded-xl border bg-white p-5 space-y-3"><p>{adminT("admin.ui.0879")}</p><Button onClick={() => void load()}>{adminT("admin.ui.0285")}</Button></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-5 h-5 text-rose-500" />
              <h2 className="text-lg font-bold text-gray-900">{adminT("admin.ui.1140")}</h2>
            </div>
            <p className="text-sm text-gray-500">
              {adminT("admin.ui.1141")} <code className="text-xs bg-gray-100 px-1 rounded">/support</code>{adminT("admin.ui.1142")} </p>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, promo_enabled: promoOn ? 'false' : 'true' })}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 shrink-0"
          >
            {promoOn ? <ToggleRight className="w-8 h-8 text-emerald-500" /> : <ToggleLeft className="w-8 h-8 text-gray-400" />}
            {adminT("admin.ui.1143")} </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">{adminT("admin.ui.1144")}</h3>
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
          {adminT("admin.ui.1145")} </p>
        <ImageUpload
          value={settings.kaspi_qr_url || ''}
          onChange={(url) => setSettings({ ...settings, kaspi_qr_url: url })}
          folder="support"
        />
      </div>

      <Button onClick={save} disabled={saving} className="rounded-xl gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {adminT("admin.ui.0096")} </Button>
    </div>
  );
}
