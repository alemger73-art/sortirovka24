import { useState, useEffect, useCallback } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2, Phone, MapPin, Hash, Map as MapIcon, Star, Clock, Building2 } from 'lucide-react';
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
  description?: string;
  lat?: number;
  lng?: number;
  boundary_coords?: string;
  is_leadership?: boolean;
  leadership_order?: number;
  created_at?: string;
}

const DEFAULT_CENTER: [number, number] = [51.1605, 71.4704];

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
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {item.is_leadership && (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  <Star className="h-3 w-3 mr-0.5" /> Руководство
                </Badge>
              )}
              {item.precinct_number && (
                <Badge variant="outline" className="text-xs">
                  <Hash className="h-3 w-3 mr-0.5" /> Участок {item.precinct_number}
                </Badge>
              )}
              {item.district && (
                <Badge variant="secondary" className="text-xs">
                  <MapPin className="h-3 w-3 mr-0.5" /> {item.district}
                </Badge>
              )}
              {item.lat && item.lng && (
                <Badge variant="secondary" className="text-xs bg-green-50 text-green-700">
                  <MapIcon className="h-3 w-3 mr-0.5" /> На карте
                </Badge>
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
              Улицы: {item.streets}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onEdit(item)}>
              <Pencil className="h-4 w-4 text-blue-600" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onDelete(item.id)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminInspectors() {
  const [items, setItems] = useState<Inspector[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Inspector> | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMapEditor, setShowMapEditor] = useState(false);
  const [boundaryPoints, setBoundaryPoints] = useState<[number, number][]>([]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.inspectors.query({ sort: 'precinct_number', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
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
    if (!editItem?.full_name || !editItem?.phone || !editItem?.streets) {
      toast.error('Заполните обязательные поля: ФИО, Телефон, Улицы');
      return;
    }
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
        phone: editItem.phone,
        whatsapp: editItem.whatsapp || '',
        streets: editItem.streets,
        description: editItem.description || '',
        lat: editItem.lat || null,
        lng: editItem.lng || null,
        boundary_coords: boundaryPoints.length >= 3 ? JSON.stringify(boundaryPoints) : '',
        is_leadership: editItem.is_leadership || false,
        leadership_order: editItem.leadership_order || 0,
      };
      if (editItem.id) {
        await withRetry(() => client.entities.inspectors.update({ id: String(editItem.id), data }));
        toast.success('Участковый обновлён');
      } else {
        await withRetry(() => client.entities.inspectors.create({
          data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) }
        }));
        toast.success('Участковый создан');
      }
      invalidateAllCaches();
      setDialogOpen(false);
      fetchItems();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить участкового?')) return;
    try {
      await withRetry(() => client.entities.inspectors.delete({ id: String(id) }));
      invalidateAllCaches();
      toast.success('Удалено');
      fetchItems();
    } catch { toast.error('Ошибка удаления'); }
  };

  const handleSetCenter = useCallback((lat: number, lng: number) => {
    setEditItem(prev => prev ? { ...prev, lat, lng } : prev);
  }, []);

  const handleAddBoundaryPoint = useCallback((lat: number, lng: number) => {
    setBoundaryPoints(prev => [...prev, [lat, lng]]);
  }, []);

  const leadershipItems = items.filter(i => i.is_leadership);
  const regularItems = items.filter(i => !i.is_leadership);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} участковых ({leadershipItems.length} руководство)</p>
        <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-1" /> Добавить
        </Button>
      </div>

      {leadershipItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wide flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5" /> Руководство
          </p>
          {leadershipItems.map(item => (
            <InspectorAdminCard key={item.id} item={item} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {leadershipItems.length > 0 && (
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-4">Участковые инспекторы</p>
        )}
        {regularItems.map(item => (
          <InspectorAdminCard key={item.id} item={item} onEdit={openEdit} onDelete={handleDelete} />
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Нет участковых</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? 'Редактировать участкового' : 'Новый участковый'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">ФИО *</label>
                <Input value={editItem.full_name || ''} onChange={e => setEditItem({ ...editItem, full_name: e.target.value })} placeholder="Иванов Иван Иванович" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Должность</label>
                <Input value={editItem.position || ''} onChange={e => setEditItem({ ...editItem, position: e.target.value })} placeholder="Участковый инспектор полиции" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Фото</label>
                <ImageUpload value={editItem.photo_url || ''} onChange={v => setEditItem({ ...editItem, photo_url: v })} folder="inspectors" compact />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Номер участка</label>
                  <Input value={editItem.precinct_number || ''} onChange={e => setEditItem({ ...editItem, precinct_number: e.target.value })} placeholder="1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Район</label>
                  <Input value={editItem.district || ''} onChange={e => setEditItem({ ...editItem, district: e.target.value })} placeholder="Сортировка" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Адрес приёма</label>
                <Input value={editItem.address || ''} onChange={e => setEditItem({ ...editItem, address: e.target.value })} placeholder="ул. Абая 10, каб. 5" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">График приёма</label>
                <Input value={editItem.schedule || ''} onChange={e => setEditItem({ ...editItem, schedule: e.target.value })} placeholder="Пн-Пт 09:00-18:00, Сб 10:00-14:00" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Телефон *</label>
                  <Input value={editItem.phone || ''} onChange={e => setEditItem({ ...editItem, phone: e.target.value })} placeholder="+7..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">WhatsApp</label>
                  <Input value={editItem.whatsapp || ''} onChange={e => setEditItem({ ...editItem, whatsapp: e.target.value })} placeholder="+7..." />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Список улиц * <span className="text-gray-400 font-normal">(через запятую)</span></label>
                <Textarea
                  value={editItem.streets || ''}
                  onChange={e => setEditItem({ ...editItem, streets: e.target.value })}
                  rows={3}
                  placeholder="ул. Абая, ул. Ленина, ул. Мира 1-50, пер. Школьный"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Описание</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={2} placeholder="Дополнительная информация" />
              </div>

              {/* Leadership toggle */}
              <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    <label className="text-sm font-medium text-gray-700">Руководство</label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditItem({ ...editItem, is_leadership: !editItem.is_leadership })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editItem.is_leadership ? 'bg-amber-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editItem.is_leadership ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {editItem.is_leadership && (
                  <div>
                    <label className="text-xs text-gray-500">Порядок отображения</label>
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

              {/* Map section */}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <MapIcon className="w-4 h-4 text-blue-600" /> Карта участка
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMapEditor(!showMapEditor)}
                    className="text-xs"
                  >
                    {showMapEditor ? 'Скрыть карту' : 'Показать карту'}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-xs text-gray-500">Широта (lat)</label>
                    <Input
                      type="number"
                      step="any"
                      value={editItem.lat ?? ''}
                      onChange={e => setEditItem({ ...editItem, lat: e.target.value ? parseFloat(e.target.value) : undefined })}
                      placeholder="51.1605"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Долгота (lng)</label>
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
                      <strong>Двойной клик</strong> — установить центр участка (маркер).{' '}
                      <strong>Одинарный клик</strong> — добавить точку границы (полигон).
                    </p>
                    <div className="h-[300px] rounded-xl overflow-hidden border border-gray-200 relative z-0">
                      <MapContainer
                        center={editItem.lat && editItem.lng ? [editItem.lat, editItem.lng] : DEFAULT_CENTER}
                        zoom={15}
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
                        Точек границы: {boundaryPoints.length} {boundaryPoints.length < 3 && '(мин. 3)'}
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
                            Убрать последнюю
                          </Button>
                        )}
                        {boundaryPoints.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs text-red-600"
                            onClick={() => setBoundaryPoints([])}
                          >
                            Очистить
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={() => setDialogOpen(false)} variant="outline" className="flex-1">Отмена</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  {editItem.id ? 'Сохранить' : 'Создать'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}