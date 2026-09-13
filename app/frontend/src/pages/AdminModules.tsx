import { adminMetadataLabel } from '@/i18n/adminTranslations';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Save, ToggleLeft, ToggleRight, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { MODULE_DEFS, MODULE_KEYS, DEFAULT_MODULES, type ModuleKey } from '@/config/modules';
import { modulesApi, type ModulesMap } from '@/lib/modulesApi';
import { invalidateModulesCache } from '@/hooks/useModules';

export default function AdminModules() {
  const { t: adminT } = useLanguage();

  const [modules, setModules] = useState<ModulesMap>(DEFAULT_MODULES);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await modulesApi.adminGet();
      setModules(data);
    } catch (e: any) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (key: ModuleKey) => {
    setModules((prev) => ({ ...prev, [key]: prev[key] === false ? true : false }));
  };

  const setAll = (value: boolean) => {
    const next = {} as ModulesMap;
    for (const key of MODULE_KEYS) next[key] = value;
    setModules(next);
  };

  async function save() {
    setSaving(true);
    try {
      const updated = await modulesApi.adminUpdate(modules);
      setModules(updated);
      invalidateModulesCache();
      toast.success(adminT("admin.ui.0951"));
    } catch (e: any) {
      toast.error(String(e?.message || adminT("admin.ui.0055")));
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = MODULE_KEYS.filter((k) => modules[k] !== false).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (loadError) return <div role="alert" className="space-y-3 rounded-xl border bg-white p-5"><p>{adminT("admin.ui.0952")}</p><Button onClick={load}>{adminT("admin.ui.0285")}</Button></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900">{adminT("admin.ui.0953")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {adminT("admin.ui.0954")} </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">
            {adminT("admin.ui.0955")} <b>{enabledCount}</b> {adminT("admin.ui.0447")} {MODULE_KEYS.length}
          </span>
          <span className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={() => setAll(true)} className="gap-1.5">
            <Power className="w-4 h-4" /> {adminT("admin.ui.0956")} </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAll(false)} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
            <PowerOff className="w-4 h-4" /> {adminT("admin.ui.0957")} </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        {MODULE_DEFS.map((def) => {
          const on = modules[def.key] !== false;
          return (
            <button
              key={def.key}
              type="button"
              onClick={() => toggle(def.key)}
              role="switch"
              aria-checked={on}
              className="w-full flex items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{adminMetadataLabel(def.label, adminT)}</p>
              </div>
              <span className={`flex items-center gap-2 text-sm font-medium shrink-0 ${on ? 'text-emerald-600' : 'text-gray-400'}`}>
                {on ? adminT("admin.ui.0618") : adminT("admin.ui.0617")}
                {on ? <ToggleRight className="w-9 h-9 text-emerald-500" /> : <ToggleLeft className="w-9 h-9 text-gray-300" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pt-4 pb-2">
        <Button onClick={save} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {adminT("admin.ui.0038")} </Button>
      </div>
    </div>
  );
}
