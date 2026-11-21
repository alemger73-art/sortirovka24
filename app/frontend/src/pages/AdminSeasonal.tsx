/** Admin: New Year decoration — on/off, dates, snow, garland, countdown, banner and greeting, with a preview link. */
import { useEffect, useState } from 'react';
import { Loader2, Save, Snowflake, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ImageUpload from '@/components/ImageUpload';
import { useSeasonal } from '@/components/seasonal/SeasonalThemeProvider';
import { SEASONAL_DEFAULTS, SeasonalSettings, fetchSettings, inWindow, saveSettings } from '@/lib/seasonal';

type Flag = 'enabled' | 'snow' | 'garland' | 'countdown';
type Text = 'title_ru' | 'title_kz' | 'greeting_ru' | 'greeting_kz';

const FLAGS: { key: Flag; label: string; hint: string }[] = [
  { key: 'enabled', label: 'Новогоднее оформление', hint: 'Главный выключатель. Когда выключено, сайт выглядит как обычно.' },
  { key: 'snow', label: 'Падающий снег', hint: 'Жители могут сами остановить снег кнопкой под таймером.' },
  { key: 'garland', label: 'Гирлянда под верхней панелью', hint: '' },
  { key: 'countdown', label: 'Таймер до Нового года', hint: 'После полуночи 1 января сам сменится поздравлением.' },
];

const TEXTS: { key: Text; label: string }[] = [
  { key: 'title_ru', label: 'Надпись на главной (RU)' },
  { key: 'title_kz', label: 'Надпись на главной (KZ)' },
  { key: 'greeting_ru', label: 'Поздравление после полуночи (RU)' },
  { key: 'greeting_kz', label: 'Поздравление после полуночи (KZ)' },
];

const INTENSITY = [
  { value: 1, label: 'Лёгкий' },
  { value: 2, label: 'Средний' },
  { value: 3, label: 'Сильный' },
];

export default function AdminSeasonal() {
  const { apply } = useSeasonal();
  const [form, setForm] = useState<SeasonalSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings().then(setForm).catch(() => { setForm(SEASONAL_DEFAULTS); toast.error('Не удалось загрузить настройки, показаны значения по умолчанию'); });
  }, []);

  if (!form) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  const set = <K extends keyof SeasonalSettings>(key: K, value: SeasonalSettings[K]) => setForm({ ...form, [key]: value });
  const datesOk = form.starts_at <= form.ends_at;

  async function save() {
    if (!form || !datesOk) return;
    setSaving(true);
    try {
      const saved = await saveSettings(form);
      setForm(saved);
      apply(saved);
      toast.success('Сохранено');
    } catch (e) {
      toast.error(String((e as Error)?.message || 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Snowflake className="h-5 w-5 text-sky-500" />
          <h2 className="text-lg font-bold text-gray-900">Новогоднее оформление</h2>
        </div>
        <p className="text-sm text-gray-500">
          Сейчас: <b>{inWindow(form) ? 'включено для всех' : 'не показывается'}</b>. Оформление само включается и выключается по датам ниже (время Алматы).
        </p>
        <a href="/?ny=1" target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">
          <ExternalLink className="h-4 w-4" />Предпросмотр в новой вкладке
        </a>
        <p className="mt-1 text-xs text-gray-400">Предпросмотр виден только вам в этой вкладке. Чтобы выйти из него — откройте сайт с адресом /?ny=0.</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {FLAGS.map((f) => (
          <label key={f.key} className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={form[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
            <span><span className="font-medium text-gray-900">{f.label}</span>{f.hint && <span className="block text-xs text-gray-500">{f.hint}</span>}</span>
          </label>
        ))}
        <div>
          <p className="mb-1 text-sm font-medium text-gray-900">Сколько снега</p>
          <div className="flex gap-2">
            {INTENSITY.map((o) => (
              <button key={o.value} type="button" onClick={() => set('snow_intensity', o.value)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${form.snow_intensity === o.value ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700' : 'border-gray-300 text-gray-700'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="mb-1 block font-medium text-gray-900">Включить с</span>
            <Input type="date" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium text-gray-900">Выключить после</span>
            <Input type="date" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></label>
        </div>
        {!datesOk && <p className="text-sm text-red-600">Дата выключения раньше даты включения.</p>}
      </div>

      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <p className="mb-1 text-sm font-medium text-gray-900">Праздничный баннер главной</p>
          <ImageUpload value={form.hero_image} onChange={(url) => set('hero_image', url || SEASONAL_DEFAULTS.hero_image)} folder="seasonal" />
          {form.hero_image !== SEASONAL_DEFAULTS.hero_image && (
            <button type="button" className="mt-2 text-sm text-blue-700 hover:underline" onClick={() => set('hero_image', SEASONAL_DEFAULTS.hero_image)}>
              Вернуть стандартный зимний баннер
            </button>
          )}
        </div>
        {TEXTS.map((f) => (
          <label key={f.key} className="block text-sm"><span className="mb-1 block font-medium text-gray-900">{f.label}</span>
            <Input value={form[f.key]} maxLength={300} onChange={(e) => set(f.key, e.target.value)} /></label>
        ))}
        <p className="text-xs text-gray-500">Первое слово надписи на главной пишется золотым рукописным шрифтом.</p>
      </div>

      <Button onClick={() => void save()} disabled={saving || !datesOk}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Сохранить
      </Button>
    </div>
  );
}
