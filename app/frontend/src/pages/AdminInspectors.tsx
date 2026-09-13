import { useLanguage } from '@/contexts/LanguageContext';
import AdminInspectorDirectory from '@/components/AdminInspectorDirectory';
import InspectorCoverageEditor from '@/components/InspectorCoverageEditor';
import { useState, useEffect, useCallback, useRef } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { apiUrl } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2, Phone, MapPin, Hash, Map as MapIcon, Star, Clock, Building2, X, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Inspector {
  id: number;
  full_name: string;
  position?: string;
  photo_url?: string;
  precinct_number?: string;
  district?: string;
  address?: string;
  schedule?: string;
  phone: string;
  whatsapp?: string;
  streets: string;
  coverage?: string;
  description?: string;
  lat?: number;
  lng?: number;
  boundary_coords?: string;
  is_leadership?: boolean;
  leadership_order?: number;
  created_at?: string;
}

const DEFAULT_CENTER: [number, number] = [48, 67];

function ClickableMap({ onSetCenter, onAddBoundaryPoint }: {
  onSetCenter: (lat: number, lng: number) => void;
  onAddBoundaryPoint: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onAddBoundaryPoint(e.latlng.lat, e.latlng.lng);
    },
    dblclick(e) {
      e.originalEvent.preventDefault();
      onSetCenter(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function InspectorAdminCard({ item, onEdit, onDelete }: {
  item: Inspector;
  onEdit: (item: Inspector) => void;
  onDelete: (id: number) => void;
}) {
  const { t: adminT } = useLanguage();

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {item.is_leadership && (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  <Star className="h-3 w-3 mr-0.5" /> {adminT("admin.ui.0805")} </Badge>
              )}
              {item.precinct_number && (
                <Badge variant="outline" className="text-xs">
                  <Hash className="h-3 w-3 mr-0.5" /> {adminT("admin.ui.0806")} {item.precinct_number}
                </Badge>
              )}
              {item.district && (
                <Badge variant="secondary" className="text-xs">
                  <MapPin className="h-3 w-3 mr-0.5" /> {item.district}
                </Badge>
              )}
              {item.lat && item.lng && (
                <Badge variant="secondary" className="text-xs bg-green-50 text-green-700">
                  <MapIcon className="h-3 w-3 mr-0.5" /> {adminT("admin.ui.0807")} </Badge>
              )}
            </div>
            <p className="font-semibold text-sm text-gray-900">{item.full_name}</p>
            {item.position && (
              <p className="text-xs text-gray-500 mt-0.5">{item.position}</p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</span>
              {item.whatsapp && <span className="text-green-600">WhatsApp: {item.whatsapp}</span>}
            </div>
            {item.address && (
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {item.address}
              </p>
            )}
            {item.schedule && (
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {item.schedule}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1 line-clamp-1">
              {adminT("admin.ui.0808")} {item.streets}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={adminT("admin.extra.1289").replace('{0}', () => String(item.full_name))} onClick={() => onEdit(item)}>
              <Pencil className="h-4 w-4 text-blue-600" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={adminT("admin.extra.1290").replace('{0}', () => String(item.full_name))} onClick={() => onDelete(item.id)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminInspectors() {
  const { t: adminT } = useLanguage();

  const [items, setItems] = useState<Inspector[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const savingRef = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Inspector> | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [showMapEditor, setShowMapEditor] = useState(false);
  const [boundaryPoints, setBoundaryPoints] = useState<[number, number][]>([]);

  const fetchItems = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await withRetry(() => client.entities.inspectors.query({ sort: 'precinct_number', limit: 2000 }));
      setItems(res.data?.items || []);
    } catch { setLoadError(true); toast.error(adminT("admin.ui.0044")); }
    finally { setLoading(false); setLoaded(true); }
  };

  useEffect(() => { fetchItems(); }, []);

  const openCreate = () => {
    setEditItem({
      full_name: '', position: '', photo_url: '', precinct_number: '', district: 'Сортировка',
      address: '', schedule: '', phone: '', whatsapp: '', streets: '', description: '',
      lat: undefined, lng: undefined, boundary_coords: '',
      is_leadership: false, leadership_order: 0,
    });
    setBoundaryPoints([]);
    setShowMapEditor(false);
    setDialogOpen(true);
  };

  const openEdit = (item: Inspector) => {
    setEditItem({ ...item });
    try {
      const parsed = item.boundary_coords ? JSON.parse(item.boundary_coords) : [];
      setBoundaryPoints(Array.isArray(parsed) ? parsed : []);
    } catch {
      setBoundaryPoints([]);
    }
    setShowMapEditor(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (savingRef.current || photoUploading) return;
    if (!editItem?.full_name?.trim() || !editItem.photo_url || (!editItem.is_leadership && !editItem.streets?.trim())) {
      toast.error(adminT("admin.ui.0810"));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const data: Record<string, any> = {
        full_name: editItem.full_name,
        position: editItem.position || '',
        photo_url: editItem.photo_url || '',
        precinct_number: editItem.precinct_number || '',
        district: editItem.district || '',
        address: editItem.address || '',
        schedule: editItem.schedule || '',
        phone: editItem.phone || '',
        whatsapp: editItem.whatsapp || '',
        streets: editItem.streets || '',
        coverage: editItem.coverage || '',
        description: editItem.description || '',
        lat: editItem.lat || null,
        lng: editItem.lng || null,
        boundary_coords: boundaryPoints.length >= 3 ? JSON.stringify(boundaryPoints) : '',
        is_leadership: editItem.is_leadership || false,
        leadership_order: editItem.leadership_order || 0,
      };
      if (editItem.id) {
        await client.entities.inspectors.update({ id: String(editItem.id), data });
        toast.success(adminT("admin.ui.0811"));
      } else {
        await client.entities.inspectors.create({
          data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) }
        });
        toast.success(adminT("admin.ui.0812"));
      }
      invalidateAllCaches();
      setDialogOpen(false);
      fetchItems();
    } catch { toast.error(adminT("admin.ui.0055")); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(adminT("admin.ui.0813"))) return;
    try {
      await withRetry(() => client.entities.inspectors.delete({ id: String(id) }));
      invalidateAllCaches();
      toast.success(adminT("admin.ui.0050"));
      fetchItems();
    } catch { toast.error(adminT("admin.ui.0051")); }
  };

  const handleReloadFromFile = async () => {
    if (!confirm(
      adminT("admin.ui.0814") +
      adminT("admin.ui.0815")
    )) return;

    setReloading(true);
    try {
      const token = localStorage.getItem('_sp924_token') || localStorage.getItem('token') || '';
      const resp = await fetch(apiUrl('/api/v1/entities/inspectors/admin/reload-from-file'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const bodyText = await resp.text();
      if (!resp.ok) {
        let detail = bodyText;
        try {
          const parsed = JSON.parse(bodyText) as { detail?: string };
          detail = parsed.detail || bodyText;
        } catch { /* keep raw */ }
        throw new Error(detail || `HTTP ${resp.status}`);
      }
      const data = JSON.parse(bodyText) as { message?: string; count?: number };
      invalidateAllCaches();
      toast.success(data.message || adminT("admin.extra.1291").replace('{0}', () => String(data.count ?? 0)));
      fetchItems();
    } catch (err) {
      const message = err instanceof Error ? err.message : adminT("admin.ui.0816");
      toast.error(message.length > 120 ? adminT("admin.ui.0816") : message);
    } finally {
      setReloading(false);
    }
  };

  const handleSetCenter = useCallback((lat: number, lng: number) => {
    setEditItem(prev => prev ? { ...prev, lat, lng } : prev);
  }, []);

  const handleAddBoundaryPoint = useCallback((lat: number, lng: number) => {
    setBoundaryPoints(prev => [...prev, [lat, lng]]);
  }, []);

  const leadershipItems = items.filter(i => i.is_leadership);
  const regularItems = items.filter(i => !i.is_leadership);
  const missingMapCount = regularItems.filter(i => !i.lat || !i.lng).length;

  if (loading && !loaded) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <AdminInspectorDirectory />
      {loadError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{adminT("admin.ui.0817")} <button className="underline min-h-11" onClick={() => void fetchItems()}>{adminT("admin.ui.0285")}</button></div>}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm text-gray-500">{items.length} {adminT("admin.ui.0818")}{leadershipItems.length} {adminT("admin.ui.0819")}</p>
          {missingMapCount > 0 && (
            <p className="text-xs text-amber-600 mt-0.5">{missingMapCount} {adminT("admin.ui.0820")}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleReloadFromFile}
            size="sm"
            variant="outline"
            disabled={reloading}
            className="border-amber-200 text-amber-700 hover:bg-amber-50"
          >
            {reloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
            {adminT("admin.ui.0821")} </Button>
          <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1" /> {adminT("admin.ui.0062")} </Button>
        </div>
      </div>

      {leadershipItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wide flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5" /> {adminT("admin.ui.0805")} </p>
          {leadershipItems.map(item => (
            <InspectorAdminCard key={item.id} item={item} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {leadershipItems.length > 0 && (
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-4">{adminT("admin.ui.0822")}</p>
        )}
        {regularItems.map(item => (
          <InspectorAdminCard key={item.id} item={item} onEdit={openEdit} onDelete={handleDelete} />
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">{adminT("admin.ui.0823")}</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!saving && !photoUploading) setDialogOpen(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? adminT("admin.ui.0824") : adminT("admin.ui.0825")}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <fieldset disabled={saving} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0826")}</label>
                <Input value={editItem.full_name || ''} onChange={e => setEditItem({ ...editItem, full_name: e.target.value })} placeholder={adminT("admin.ui.0827")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0828")}</label>
                <Input value={editItem.position || ''} onChange={e => setEditItem({ ...editItem, position: e.target.value })} placeholder={adminT("admin.ui.0829")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0830")}</label>
                <ImageUpload value={editItem.photo_url || ''} onChange={v => setEditItem(current => current ? { ...current, photo_url: v } : current)} onUploadingChange={setPhotoUploading} folder="inspectors" compact />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0831")}</label>
                  <Input value={editItem.precinct_number || ''} onChange={e => setEditItem({ ...editItem, precinct_number: e.target.value })} placeholder="1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0832")}</label>
                  <Input value={editItem.district || ''} onChange={e => setEditItem({ ...editItem, district: e.target.value })} placeholder={adminT("admin.ui.0809")} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0833")}</label>
                <Input value={editItem.address || ''} onChange={e => setEditItem({ ...editItem, address: e.target.value })} placeholder={adminT("admin.ui.0834")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0835")}</label>
                <Input value={editItem.schedule || ''} onChange={e => setEditItem({ ...editItem, schedule: e.target.value })} placeholder={adminT("admin.ui.0836")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0084")}</label>
                  <Input value={editItem.phone || ''} onChange={e => setEditItem({ ...editItem, phone: e.target.value })} placeholder="+7..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">WhatsApp</label>
                  <Input value={editItem.whatsapp || ''} onChange={e => setEditItem({ ...editItem, whatsapp: e.target.value })} placeholder="+7..." />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0079")}</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={2} placeholder={adminT("admin.ui.0837")} />
              </div>

              {/* Leadership toggle */}
              <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0805")}</label>
                  </div>
                  <button
                    type="button"
                    aria-label={adminT("admin.ui.0805")} role="switch" aria-checked={Boolean(editItem.is_leadership)}
                    onClick={() => setEditItem({ ...editItem, is_leadership: !editItem.is_leadership })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editItem.is_leadership ? 'bg-amber-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editItem.is_leadership ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {editItem.is_leadership && (
                  <div>
                    <label className="text-xs text-gray-500">{adminT("admin.ui.0838")}</label>
                    <Input
                      type="number"
                      value={editItem.leadership_order ?? 0}
                      onChange={e => setEditItem({ ...editItem, leadership_order: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>

              {!editItem.is_leadership && <InspectorCoverageEditor value={editItem.coverage} legacy={editItem.streets} onChange={coverage => {
                const rows = JSON.parse(coverage) as {street:string;houses:string}[];
                setEditItem({...editItem,coverage,streets:rows.map(r=>r.street.trim()).filter(Boolean).join(', ')});
              }}/>}

              {/* Map section */}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <MapIcon className="w-4 h-4 text-blue-600" /> {adminT("admin.ui.0839")} </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMapEditor(!showMapEditor)}
                    className="text-xs"
                  >
                    {showMapEditor ? adminT("admin.ui.0840") : adminT("admin.ui.0841")}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-xs text-gray-500">{adminT("admin.ui.0842")}</label>
                    <Input
                      type="number"
                      step="any"
                      value={editItem.lat ?? ''}
                      onChange={e => setEditItem({ ...editItem, lat: e.target.value ? parseFloat(e.target.value) : undefined })}
                      placeholder="51.1605"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">{adminT("admin.ui.0843")}</label>
                    <Input
                      type="number"
                      step="any"
                      value={editItem.lng ?? ''}
                      onChange={e => setEditItem({ ...editItem, lng: e.target.value ? parseFloat(e.target.value) : undefined })}
                      placeholder="71.4704"
                    />
                  </div>
                </div>

                {showMapEditor && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">
                      <strong>{adminT("admin.ui.0844")}</strong> {adminT("admin.ui.0845")}{' '}
                      <strong>{adminT("admin.ui.0846")}</strong> {adminT("admin.ui.0847")} </p>
                    <div className="h-[300px] rounded-xl overflow-hidden border border-gray-200 relative z-0">
                      <MapContainer
                        center={editItem.lat && editItem.lng ? [editItem.lat, editItem.lng] : DEFAULT_CENTER}
                        zoom={editItem.lat && editItem.lng ? 15 : 5}
                        scrollWheelZoom={true}
                        doubleClickZoom={false}
                        className="h-full w-full"
                        style={{ zIndex: 0 }}
                      >
                        <TileLayer
                          attribution='&copy; OpenStreetMap'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <ClickableMap onSetCenter={handleSetCenter} onAddBoundaryPoint={handleAddBoundaryPoint} />

                        {editItem.lat && editItem.lng && (
                          <Marker position={[editItem.lat, editItem.lng]} />
                        )}

                        {boundaryPoints.length >= 3 && (
                          <Polygon
                            positions={boundaryPoints}
                            pathOptions={{ color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.2, weight: 2 }}
                          />
                        )}
                      </MapContainer>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">
                        {adminT("admin.ui.0848")} {boundaryPoints.length} {boundaryPoints.length < 3 && adminT("admin.ui.0849")}
                      </p>
                      <div className="flex gap-2">
                        {boundaryPoints.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => setBoundaryPoints(prev => prev.slice(0, -1))}
                          >
                            {adminT("admin.ui.0850")} </Button>
                        )}
                        {boundaryPoints.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs text-red-600"
                            onClick={() => setBoundaryPoints([])}
                          >
                            {adminT("admin.ui.0851")} </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={() => setDialogOpen(false)} disabled={photoUploading} variant="outline" className="flex-1">{adminT("admin.ui.0095")}</Button>
                <Button onClick={handleSave} disabled={saving || photoUploading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  {editItem.id ? adminT("admin.ui.0096") : adminT("admin.ui.0097")}
                </Button>
              </div>
            </fieldset>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}