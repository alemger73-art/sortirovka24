import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Save, RefreshCw, BarChart3, Users, Utensils, ShieldCheck, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface HomepageStats {
  id: number;
  masters_count: number;
  ads_count: number;
  cafes_count: number;
  residents_count: number;
  is_auto: boolean;
  is_visible: boolean;
  updated_at: string;
}

interface AutoCounts {
  masters: number;
  cafes: number;
}

export default function AdminStats() {
  const { t: adminT } = useLanguage();

  const [stats, setStats] = useState<HomepageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoCounts, setAutoCounts] = useState<AutoCounts>({ masters: 0, cafes: 0 });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [mastersCount, setMastersCount] = useState(0);
  const [cafesCount, setCafesCount] = useState(0);
  const [residentsCount, setResidentsCount] = useState(1000);
  const [isAuto, setIsAuto] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    loadStats();
    loadAutoCounts();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await withRetry(() => client.entities.homepage_stats.query({ limit: 1 }));
      const items = res?.data?.items || [];
      if (items.length > 0) {
        const s = items[0] as HomepageStats;
        setStats(s);
        setMastersCount(s.masters_count || 0);
        setCafesCount(s.cafes_count || 0);
        setResidentsCount(s.residents_count ?? 1000);
        setIsAuto(s.is_auto === true || (s.is_auto as any) === 'true');
        setIsVisible(s.is_visible === true || (s.is_visible as any) === 'true');
      }
    } catch (err) {
      setLoadError(true);
      console.error('Failed to load stats:', err);
      setMessage({ type: 'error', text: adminT("admin.ui.1100") });
    } finally {
      setLoading(false);
    }
  };

  const loadAutoCounts = async () => {
    setAutoLoading(true);
    try {
      const [mastersRes, cafesRes] = await Promise.allSettled([
        withRetry(() => client.entities.masters.query({ limit: 1 })),
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
        cafes_count: cafesCount,
        residents_count: residentsCount,
        is_auto: isAuto,
        is_visible: isVisible,
        updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };

      if (stats) {
        await withRetry(() => client.entities.homepage_stats.update({ id: String(stats.id), data }));
      } else {
        await withRetry(() => client.entities.homepage_stats.create({ data: { ...data } }));
      }

      invalidateAllCaches();
      setMessage({ type: 'success', text: adminT("admin.ui.1101") });
      await loadStats();
    } catch (err) {
      console.error('Failed to save stats:', err);
      setMessage({ type: 'error', text: adminT("admin.ui.0055") });
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
        <span className="ml-2 text-gray-500">{adminT("admin.ui.1102")}</span>
      </div>
    );
  }

  if (loadError) return <div role="alert" className="rounded-xl border bg-white p-5 space-y-3"><p>{adminT("admin.ui.0879")}</p><Button onClick={() => void loadStats()}>{adminT("admin.ui.0285")}</Button></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          {adminT("admin.ui.1103")} </h2>
        <p className="text-sm text-gray-500 mt-1">
          {adminT("admin.ui.1104")} </p>
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

      {/* Visibility toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{adminT("admin.ui.1105")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                {isVisible ? <Eye className="w-4 h-4 text-green-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                {isVisible ? adminT("admin.ui.1106") : adminT("admin.ui.1107")}
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">
                {adminT("admin.ui.1108")} </p>
            </div>
            <Switch checked={isVisible} onCheckedChange={setIsVisible} />
          </div>
        </CardContent>
      </Card>

      {/* Mode Switch */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{adminT("admin.ui.1109")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-gray-900">
                {isAuto ? adminT("admin.ui.1110") : adminT("admin.ui.1111")}
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAuto
                  ? adminT("admin.ui.1112")
                  : adminT("admin.ui.1113")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{adminT("admin.ui.1114")}</span>
              <Switch
                checked={isAuto}
                onCheckedChange={setIsAuto}
              />
              <span className="text-xs text-gray-400">{adminT("admin.ui.0701")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Residents count — always manual */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{adminT("admin.ui.1115")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label className="text-sm text-gray-600 flex items-center gap-1.5 mb-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> {adminT("admin.ui.1116")} </Label>
            <Input
              type="number"
              min={0}
              value={residentsCount}
              onChange={(e) => setResidentsCount(parseInt(e.target.value) || 0)}
              placeholder="1000"
            />
            <p className="text-xs text-gray-400 mt-1">{adminT("admin.ui.1117")} {formatDisplay(residentsCount)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Auto counts info */}
      {isAuto && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-blue-900">{adminT("admin.ui.1118")}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadAutoCounts}
                disabled={autoLoading}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${autoLoading ? 'animate-spin' : ''}`} />
                {adminT("admin.ui.0408")} </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-white rounded-xl border border-blue-100">
                <Users className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{autoCounts.masters}</p>
                <p className="text-xs text-gray-500">{adminT("admin.ui.1038")}</p>
              </div>
              <div className="text-center p-3 bg-white rounded-xl border border-blue-100">
                <Utensils className="w-5 h-5 text-orange-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{autoCounts.cafes}</p>
                <p className="text-xs text-gray-500">{adminT("admin.ui.1119")}</p>
              </div>
              <div className="text-center p-3 bg-white rounded-xl border border-blue-100">
                <ShieldCheck className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{residentsCount}</p>
                <p className="text-xs text-gray-500">{adminT("admin.ui.1120")}</p>
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-3">
              {adminT("admin.ui.1121")}{formatDisplay(autoCounts.masters)}»
            </p>
          </CardContent>
        </Card>
      )}

      {/* Manual input */}
      {!isAuto && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{adminT("admin.ui.1122")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-gray-600 flex items-center gap-1.5 mb-1.5">
                  <Users className="w-4 h-4 text-blue-500" /> {adminT("admin.ui.1038")} </Label>
                <Input
                  type="number"
                  min={0}
                  value={mastersCount}
                  onChange={(e) => setMastersCount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
                <p className="text-xs text-gray-400 mt-1">{adminT("admin.ui.1117")} {formatDisplay(mastersCount)}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600 flex items-center gap-1.5 mb-1.5">
                  <Utensils className="w-4 h-4 text-orange-500" /> {adminT("admin.ui.1119")} </Label>
                <Input
                  type="number"
                  min={0}
                  value={cafesCount}
                  onChange={(e) => setCafesCount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
                <p className="text-xs text-gray-400 mt-1">{adminT("admin.ui.1117")} {formatDisplay(cafesCount)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {adminT("admin.ui.1123")} </p>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{adminT("admin.ui.0794")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-6">
            {!isVisible ? (
              <p className="text-white/40 text-sm text-center">{adminT("admin.ui.1124")}</p>
            ) : (
            <div className="flex items-center gap-8 justify-center">
              {(() => {
                const items = isAuto
                  ? [
                      { val: autoCounts.masters, label: adminT("admin.ui.1125") },
                      { val: autoCounts.cafes, label: adminT("admin.ui.1119") },
                      { val: residentsCount, label: adminT("admin.ui.1126") },
                    ]
                  : [
                      { val: mastersCount, label: adminT("admin.ui.1125") },
                      { val: cafesCount, label: adminT("admin.ui.1119") },
                      { val: residentsCount, label: adminT("admin.ui.1126") },
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
                  ? [autoCounts.masters, autoCounts.cafes, residentsCount]
                  : [mastersCount, cafesCount, residentsCount];
                return vals.every(v => v === 0) ? (
                  <p className="text-white/40 text-sm">{adminT("admin.ui.1127")}</p>
                ) : null;
              })()}
            </div>
            )}
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
          {saving ? adminT("admin.ui.0328") : adminT("admin.ui.0096")}
        </Button>
        <Button variant="outline" onClick={loadStats} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {adminT("admin.ui.1128")} </Button>
      </div>
    </div>
  );
}