import { useState, useEffect } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Save, RefreshCw, BarChart3, Users, Megaphone, Utensils, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface HomepageStats {
  id: number;
  masters_count: number;
  ads_count: number;
  cafes_count: number;
  is_auto: boolean;
  updated_at: string;
}

interface AutoCounts {
  masters: number;
  ads: number;
  cafes: number;
}

export default function AdminStats() {
  const [stats, setStats] = useState<HomepageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoCounts, setAutoCounts] = useState<AutoCounts>({ masters: 0, ads: 0, cafes: 0 });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [mastersCount, setMastersCount] = useState(0);
  const [adsCount, setAdsCount] = useState(0);
  const [cafesCount, setCafesCount] = useState(0);
  const [isAuto, setIsAuto] = useState(true);

  useEffect(() => {
    loadStats();
    loadAutoCounts();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.homepage_stats.query({ limit: 1 }));
      const items = res?.data?.items || [];
      if (items.length > 0) {
        const s = items[0] as HomepageStats;
        setStats(s);
        setMastersCount(s.masters_count || 0);
        setAdsCount(s.ads_count || 0);
        setCafesCount(s.cafes_count || 0);
        setIsAuto(s.is_auto === true || (s.is_auto as any) === 'true');
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
      setMessage({ type: 'error', text: 'Ошибка загрузки статистики' });
    } finally {
      setLoading(false);
    }
  };

  const loadAutoCounts = async () => {
    setAutoLoading(true);
    try {
      const [mastersRes, adsRes, cafesRes] = await Promise.allSettled([
        withRetry(() => client.entities.masters.query({ limit: 1 })),
        withRetry(() => client.entities.announcements.query({ query: { active: true, status: 'approved' }, limit: 1 })),
        withRetry(() => client.entities.food_categories.query({ limit: 1 })),
      ]);

      const getTotal = (r: PromiseSettledResult<any>) => {
        if (r.status === 'fulfilled') {
          return r.value?.data?.total || r.value?.data?.items?.length || 0;
        }
        return 0;
      };

      setAutoCounts({
        masters: getTotal(mastersRes),
        ads: getTotal(adsRes),
        cafes: getTotal(cafesRes),
      });
    } catch {
      // non-critical
    } finally {
      setAutoLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const data = {
        masters_count: mastersCount,
        ads_count: adsCount,
        cafes_count: cafesCount,
        is_auto: isAuto,
        updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };

      if (stats) {
        await withRetry(() => client.entities.homepage_stats.update({ id: String(stats.id), data }));
      } else {
        await withRetry(() => client.entities.homepage_stats.create({ data: { ...data } }));
      }

      invalidateAllCaches();
      setMessage({ type: 'success', text: 'Статистика сохранена!' });
      await loadStats();
    } catch (err) {
      console.error('Failed to save stats:', err);
      setMessage({ type: 'error', text: 'Ошибка сохранения' });
    } finally {
      setSaving(false);
    }
  };

  const formatDisplay = (value: number) => {
    if (value === 0) return '—';
    return `${value}+`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500">Загрузка...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Статистика главной страницы
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Управляйте числами, которые отображаются в секции героя на главной странице
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Mode Switch */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Режим подсчёта</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-gray-900">
                {isAuto ? '🤖 Автоматический подсчёт' : '✏️ Ручной режим'}
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAuto
                  ? 'Значения считаются автоматически из базы данных'
                  : 'Вы задаёте значения вручную'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Ручной</span>
              <Switch
                checked={isAuto}
                onCheckedChange={setIsAuto}
              />
              <span className="text-xs text-gray-400">Авто</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto counts info */}
      {isAuto && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-blue-900">Автоматические значения</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadAutoCounts}
                disabled={autoLoading}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${autoLoading ? 'animate-spin' : ''}`} />
                Обновить
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-white rounded-xl border border-blue-100">
                <Users className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{autoCounts.masters}</p>
                <p className="text-xs text-gray-500">Мастера</p>
              </div>
              <div className="text-center p-3 bg-white rounded-xl border border-blue-100">
                <Megaphone className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{autoCounts.ads}</p>
                <p className="text-xs text-gray-500">Объявления</p>
              </div>
              <div className="text-center p-3 bg-white rounded-xl border border-blue-100">
                <Utensils className="w-5 h-5 text-orange-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{autoCounts.cafes}</p>
                <p className="text-xs text-gray-500">Кафе</p>
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-3">
              ℹ️ Эти значения будут отображаться на главной в формате «{formatDisplay(autoCounts.masters)}»
            </p>
          </CardContent>
        </Card>
      )}

      {/* Manual input */}
      {!isAuto && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ручные значения</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm text-gray-600 flex items-center gap-1.5 mb-1.5">
                  <Users className="w-4 h-4 text-blue-500" /> Мастера
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={mastersCount}
                  onChange={(e) => setMastersCount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
                <p className="text-xs text-gray-400 mt-1">Отображение: {formatDisplay(mastersCount)}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600 flex items-center gap-1.5 mb-1.5">
                  <Megaphone className="w-4 h-4 text-amber-500" /> Объявления
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={adsCount}
                  onChange={(e) => setAdsCount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
                <p className="text-xs text-gray-400 mt-1">Отображение: {formatDisplay(adsCount)}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600 flex items-center gap-1.5 mb-1.5">
                  <Utensils className="w-4 h-4 text-orange-500" /> Кафе
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={cafesCount}
                  onChange={(e) => setCafesCount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
                <p className="text-xs text-gray-400 mt-1">Отображение: {formatDisplay(cafesCount)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              💡 Если значение = 0, блок не будет отображаться на главной странице
            </p>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Предпросмотр</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-6">
            <div className="flex items-center gap-8 justify-center">
              {(() => {
                const items = isAuto
                  ? [
                      { val: autoCounts.masters, label: 'Мастеров' },
                      { val: autoCounts.ads, label: 'Объявлений' },
                      { val: autoCounts.cafes, label: 'Кафе' },
                    ]
                  : [
                      { val: mastersCount, label: 'Мастеров' },
                      { val: adsCount, label: 'Объявлений' },
                      { val: cafesCount, label: 'Кафе' },
                    ];
                return items
                  .filter(i => i.val > 0)
                  .map(i => (
                    <div key={i.label} className="text-center">
                      <p className="text-2xl font-extrabold text-white">{i.val}+</p>
                      <p className="text-white/50 text-xs">{i.label}</p>
                    </div>
                  ));
              })()}
              {(() => {
                const vals = isAuto
                  ? [autoCounts.masters, autoCounts.ads, autoCounts.cafes]
                  : [mastersCount, adsCount, cafesCount];
                return vals.every(v => v === 0) ? (
                  <p className="text-white/40 text-sm">Все значения = 0, блок скрыт</p>
                ) : null;
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saving ? 'Сохранение...' : 'Сохранить'}
        </Button>
        <Button variant="outline" onClick={loadStats} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Сбросить
        </Button>
      </div>
    </div>
  );
}