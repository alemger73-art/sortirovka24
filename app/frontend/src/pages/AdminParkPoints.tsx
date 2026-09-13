import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Save, X, MapPin, ToggleLeft, ToggleRight, Eye } from 'lucide-react';
import { toast } from 'sonner';
import ParkMap from '@/components/ParkMap';
import type { ParkPoint } from '@/components/ParkMap';

export default function AdminParkPoints() {
  const { t: adminT } = useLanguage();

  const [points, setPoints] = useState<ParkPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ParkPoint> | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => { loadPoints(); }, []);

  async function loadPoints() {
    setLoading(true);
    try {
      const result = await withRetry(() => client.entities.park_points.query({ sort: 'sort_order', limit: 100 }));
      setPoints(result?.data?.items || []);
    } catch { toast.error(adminT("admin.ui.0044")); } finally { setLoading(false); }
  }

  async function savePoint() {
    if (!editing?.name?.trim()) {
      toast.error(adminT("admin.ui.0991"));
      return;
    }
    if (!editing.lat || !editing.lng) {
      toast.error(adminT("admin.ui.0992"));
      return;
    }
    try {
      if (editing.id) {
        const { id, ...data } = editing;
        await withRetry(() => client.entities.park_points.update({ id: String(id), data }));
      } else {
        await withRetry(() => client.entities.park_points.create({
          data: { ...editing, is_active: true, sort_order: editing.sort_order || points.length + 1, created_at: new Date().toISOString() }
        }));
      }
      toast.success(adminT("admin.ui.0993"));
      invalidateAllCaches();
      setEditing(null);
      loadPoints();
    } catch { toast.error(adminT("admin.ui.0055")); }
  }

  async function deletePoint(id: number) {
    if (!confirm(adminT("admin.ui.0994"))) return;
    try {
      await withRetry(() => client.entities.park_points.delete({ id: String(id) }));
      toast.success(adminT("admin.ui.0050"));
      invalidateAllCaches();
      loadPoints();
    } catch { toast.error(adminT("admin.ui.0051")); }
  }

  async function toggleActive(point: ParkPoint) {
    try {
      await withRetry(() => client.entities.park_points.update({ id: String(point.id), data: { is_active: !point.is_active } }));
      loadPoints();
    } catch { toast.error(adminT("admin.ui.0486")); }
  }

  const PARK_CENTER_LAT = 54.9228;
  const PARK_CENTER_LNG = 73.3690;

  if (loading) {
    return <div className="text-center py-8"><div className="inline-block w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h3 className="font-bold text-lg">{adminT("admin.ui.0995")}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{adminT("admin.ui.0996")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={showPreview ? 'default' : 'outline'}
            onClick={() => setShowPreview(!showPreview)}
            className={showPreview ? "bg-green-500 hover:bg-green-600 text-white" : ''}
          >
            <Eye className="w-4 h-4 mr-1" /> {adminT("admin.ui.0997")} </Button>
          <Button size="sm" onClick={() => setEditing({ name: '', lat: PARK_CENTER_LAT, lng: PARK_CENTER_LNG, description: '', sort_order: points.length + 1 })} className="bg-green-500 hover:bg-green-600 text-white">
            <Plus className="w-4 h-4 mr-1" /> {adminT("admin.ui.0062")} </Button>
        </div>
      </div>

      {/* Park Map Preview — shows how customers see the map */}
      {showPreview && (
        <div className="bg-white rounded-xl border shadow-sm p-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">{adminT("admin.ui.0998")}</p>
          <ParkMap
            points={points.filter(p => p.is_active)}
            readOnly
          />
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold text-sm text-green-800">{editing.id ? adminT("admin.ui.0999") : adminT("admin.ui.1000")}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder={adminT("admin.ui.0077")} value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <Input type="number" placeholder={adminT("admin.ui.0216")} value={editing.sort_order || ''} onChange={e => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })} />
          </div>
          <Textarea placeholder={adminT("admin.ui.0079")} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" step="0.0001" placeholder={adminT("admin.ui.0842")} value={editing.lat || ''} onChange={e => setEditing({ ...editing, lat: parseFloat(e.target.value) || 0 })} />
            <Input type="number" step="0.0001" placeholder={adminT("admin.ui.0843")} value={editing.lng || ''} onChange={e => setEditing({ ...editing, lng: parseFloat(e.target.value) || 0 })} />
          </div>
          <p className="text-[10px] text-green-600">{adminT("admin.ui.1001")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={savePoint} className="bg-green-500 hover:bg-green-600 text-white"><Save className="w-4 h-4 mr-1" /> {adminT("admin.ui.0096")}</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}><X className="w-4 h-4 mr-1" /> {adminT("admin.ui.0095")}</Button>
          </div>
        </div>
      )}

      {/* Points list */}
      <div className="space-y-2">
        {points.map(point => (
          <div key={point.id} className={`bg-white rounded-xl border p-3 flex items-center justify-between ${!point.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <span className="font-medium text-sm">{point.name}</span>
                <span className="text-xs text-gray-400 ml-2">#{point.sort_order}</span>
                {point.description && <p className="text-xs text-gray-400 line-clamp-1">{point.description}</p>}
                <p className="text-[10px] text-gray-300">{point.lat}, {point.lng}</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => toggleActive(point)}>
                {point.is_active ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(point)}><Pencil className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deletePoint(point.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}