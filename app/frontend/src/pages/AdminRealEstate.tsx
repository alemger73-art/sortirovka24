import { adminMetadataLabel } from '@/i18n/adminTranslations';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';
import { client, withRetry, REAL_ESTATE_TYPES, formatDate, timeAgo } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Eye, Pencil, Check, X, Trash2, Loader2, MapPin, Phone, MessageCircle, Home, Send, EyeOff, Eye as EyeIcon } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';
import MultiImageUpload, { StorageGallery } from '@/components/MultiImageUpload';

interface RealEstateItem {
  id: number;
  re_type: string;
  title: string;
  description: string;
  price?: string;
  rooms?: string;
  area?: string;
  floor_info?: string;
  address?: string;
  image_url?: string;
  gallery_images?: string;
  phone: string;
  whatsapp?: string;
  telegram?: string;
  author_name?: string;
  active?: boolean;
  status?: string;
  created_at?: string;
}

function getSTATUS_MAP(adminT: (key: string) => string) {
  const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: adminT("admin.ui.0039"), color: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: adminT("admin.ui.0040"), color: 'bg-green-100 text-green-800 border-green-200' },
  published: { label: adminT("admin.ui.0041"), color: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: adminT("admin.ui.0042"), color: 'bg-red-100 text-red-800 border-red-200' },
  hidden: { label: adminT("admin.ui.0043"), color: 'bg-gray-100 text-gray-800 border-gray-200' },
};
  return STATUS_MAP;
}

const RE_TYPE_KEYS = Object.keys(REAL_ESTATE_TYPES);

export default function AdminRealEstate() {
  const { t: adminT, lang } = useLanguage();
  const STATUS_MAP = getSTATUS_MAP(adminT);

  const [items, setItems] = useState<RealEstateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterType, setFilterType] = useState('all');
  const [viewItem, setViewItem] = useState<RealEstateItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<RealEstateItem> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const query: Record<string, string> = {};
      if (filterStatus !== 'all') query.status = filterStatus;
      if (filterType !== 'all') query.re_type = filterType;
      const res = await withRetry(() => client.entities.real_estate.query({ query, sort: '-created_at', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error(adminT("admin.ui.0044")); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, 30_000);
    return () => clearInterval(id);
  }, [filterStatus, filterType]);

  const changeStatus = async (id: number, status: string) => {
    try {
      await withRetry(() => client.entities.real_estate.update({ id: String(id), data: { status } }));
      const labels: Record<string, string> = { approved: adminT("admin.ui.0040"), rejected: adminT("admin.ui.0042"), hidden: adminT("admin.ui.0043"), pending: adminT("admin.ui.0039") };
      toast.success(labels[status] || adminT("admin.ui.0047"));
      invalidateAllCaches();
      fetchItems();
      if (viewItem?.id === id) setViewItem({ ...viewItem!, status });
    } catch { toast.error(adminT("admin.ui.0048")); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(adminT("admin.ui.0049"))) return;
    try {
      await withRetry(() => client.entities.real_estate.delete({ id: String(id) }));
      toast.success(adminT("admin.ui.0050"));
      invalidateAllCaches();
      fetchItems();
    } catch { toast.error(adminT("admin.ui.0051")); }
  };

  const openCreate = () => {
    setEditItem({
      re_type: 'sell_apartment', title: '', description: '', price: '', rooms: '', area: '',
      floor_info: '', address: '', image_url: '', gallery_images: '', phone: '', whatsapp: '',
      telegram: '', author_name: '', active: true, status: 'approved',
    });
    setDialogOpen(true);
  };

  const openEdit = (item: RealEstateItem) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.title || !editItem?.phone || !editItem?.re_type) {
      toast.error(adminT("admin.ui.1068"));
      return;
    }
    setSaving(true);
    try {
      const data = {
        re_type: editItem.re_type || 'sell_apartment',
        title: editItem.title,
        description: editItem.description || '',
        price: editItem.price || '',
        rooms: editItem.rooms || '',
        area: editItem.area || '',
        floor_info: editItem.floor_info || '',
        address: editItem.address || '',
        image_url: editItem.image_url || '',
        gallery_images: editItem.gallery_images || '',
        phone: editItem.phone,
        whatsapp: editItem.whatsapp || '',
        telegram: editItem.telegram || '',
        author_name: editItem.author_name || '',
        active: editItem.active ?? true,
        status: editItem.status || 'approved',
      };
      if (editItem.id) {
        await withRetry(() => client.entities.real_estate.update({ id: String(editItem.id), data }));
        toast.success(adminT("admin.ui.0053"));
      } else {
        await withRetry(() => client.entities.real_estate.create({
          data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) }
        }));
        toast.success(adminT("admin.ui.0054"));
        invalidateAllCaches();
      }
      setDialogOpen(false);
      fetchItems();
    } catch { toast.error(adminT("admin.ui.0055")); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">{items.length} {adminT("admin.ui.0056")}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{adminT("admin.ui.0209")}</SelectItem>
              {RE_TYPE_KEYS.map(k => <SelectItem key={k} value={k}>{adminMetadataLabel(REAL_ESTATE_TYPES[k], adminT)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{adminT("admin.ui.0057")}</SelectItem>
              <SelectItem value="pending">{adminT("admin.ui.0039")}</SelectItem>
              <SelectItem value="approved">{adminT("admin.ui.0058")}</SelectItem>
              <SelectItem value="rejected">{adminT("admin.ui.0060")}</SelectItem>
              <SelectItem value="hidden">{adminT("admin.ui.0061")}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4 mr-1" /> {adminT("admin.ui.0062")} </Button>
        </div>
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const st = STATUS_MAP[item.status || 'pending'] || STATUS_MAP.pending;
          return (
            <Card key={item.id} className={`overflow-hidden ${item.status === 'hidden' ? 'opacity-60' : ''}`}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {item.image_url ? (
                      <StorageImage objectKey={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Home className="w-6 h-6 text-emerald-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{adminMetadataLabel(REAL_ESTATE_TYPES[item.re_type] || item.re_type, adminT)}</Badge>
                        <Badge className={`text-xs border ${st.color}`}>{st.label}</Badge>
                      </div>
                      <h3 className="font-medium text-gray-900 text-sm truncate">{item.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                        {item.price && <span className="text-emerald-600 font-medium">{item.price}</span>}
                        {item.rooms && <span>🛏 {item.rooms}</span>}
                        {item.area && <span>📐 {item.area} {adminT("admin.ui.1069")}</span>}
                        <span>{item.phone}</span>
                        {item.created_at && <span>{timeAgo(item.created_at, lang)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setViewItem(item)}>
                      <Eye className="h-4 w-4 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4 text-blue-600" />
                    </Button>
                    {item.status !== 'approved' && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => changeStatus(item.id, 'approved')}>
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    {item.status !== 'hidden' && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => changeStatus(item.id, 'hidden')} title={adminT("admin.ui.0064")}>
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      </Button>
                    )}
                    {item.status === 'hidden' && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => changeStatus(item.id, 'approved')} title={adminT("admin.ui.0065")}>
                        <EyeIcon className="h-4 w-4 text-green-500" />
                      </Button>
                    )}
                    {item.status !== 'rejected' && item.status !== 'hidden' && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => changeStatus(item.id, 'rejected')}>
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4 text-gray-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">{adminT("admin.ui.1070")}</p>}
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{adminT("admin.ui.1071")}{viewItem?.id}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{adminMetadataLabel(REAL_ESTATE_TYPES[viewItem.re_type] || viewItem.re_type, adminT)}</Badge>
                <Badge className={`border ${(STATUS_MAP[viewItem.status || 'pending'] || STATUS_MAP.pending).color}`}>
                  {(STATUS_MAP[viewItem.status || 'pending'] || STATUS_MAP.pending).label}
                </Badge>
              </div>
              <h3 className="font-semibold text-gray-900">{viewItem.title}</h3>
              {viewItem.price && <p className="text-emerald-600 font-bold text-lg">{viewItem.price}</p>}
              <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                {viewItem.rooms && <span className="bg-gray-100 px-2 py-0.5 rounded">🛏 {viewItem.rooms} {adminT("admin.ui.1072")}</span>}
                {viewItem.area && <span className="bg-gray-100 px-2 py-0.5 rounded">📐 {viewItem.area} {adminT("admin.ui.1069")}</span>}
                {viewItem.floor_info && <span className="bg-gray-100 px-2 py-0.5 rounded">🏢 {viewItem.floor_info}</span>}
              </div>
              <p className="text-sm whitespace-pre-wrap">{viewItem.description}</p>
              <div className="space-y-1 text-sm text-gray-600">
                {viewItem.address && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{viewItem.address}</p>}
                <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{viewItem.phone}</p>
                {viewItem.whatsapp && <p className="flex items-center gap-2"><MessageCircle className="h-4 w-4" />{viewItem.whatsapp}</p>}
                {viewItem.telegram && <p className="flex items-center gap-2"><Send className="h-4 w-4" />{viewItem.telegram}</p>}
                {viewItem.author_name && <p>{adminT("admin.ui.0068")} {viewItem.author_name}</p>}
              </div>
              {viewItem.image_url && (
                <StorageImage objectKey={viewItem.image_url} alt="" className="w-full rounded-lg max-h-48 object-cover" />
              )}
              {viewItem.gallery_images && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">{adminT("admin.ui.0069")}</p>
                  <StorageGallery keys={viewItem.gallery_images} />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0070")}</label>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" className={viewItem.status === 'approved' ? "bg-green-600 text-white" : ''} variant={viewItem.status === 'approved' ? 'default' : 'outline'} onClick={() => changeStatus(viewItem.id, 'approved')}>
                    <Check className="h-4 w-4 mr-1" /> {adminT("admin.ui.0071")} </Button>
                  <Button size="sm" variant={viewItem.status === 'rejected' ? 'default' : 'outline'} className={viewItem.status === 'rejected' ? "bg-red-600 text-white" : ''} onClick={() => changeStatus(viewItem.id, 'rejected')}>
                    <X className="h-4 w-4 mr-1" /> {adminT("admin.ui.0072")} </Button>
                  <Button size="sm" variant={viewItem.status === 'hidden' ? 'default' : 'outline'} className={viewItem.status === 'hidden' ? "bg-gray-600 text-white" : ''} onClick={() => changeStatus(viewItem.id, 'hidden')}>
                    <EyeOff className="h-4 w-4 mr-1" /> {adminT("admin.ui.0064")} </Button>
                  <Button size="sm" variant="outline" onClick={() => { setViewItem(null); openEdit(viewItem); }}>
                    <Pencil className="h-4 w-4 mr-1" /> {adminT("admin.ui.0073")} </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? adminT("admin.ui.0073") : adminT("admin.ui.1073")}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0076")}</label>
                <Select value={editItem.re_type || 'sell_apartment'} onValueChange={v => setEditItem({ ...editItem, re_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RE_TYPE_KEYS.map(k => <SelectItem key={k} value={k}>{adminMetadataLabel(REAL_ESTATE_TYPES[k], adminT)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0118")}</label>
                <Input value={editItem.title || ''} onChange={e => setEditItem({ ...editItem, title: e.target.value })} placeholder={adminT("admin.ui.1074")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0079")}</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={4} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0081")}</label>
                  <Input value={editItem.price || ''} onChange={e => setEditItem({ ...editItem, price: e.target.value })} placeholder="15 000 000 ₸" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.1075")}</label>
                  <Input value={editItem.rooms || ''} onChange={e => setEditItem({ ...editItem, rooms: e.target.value })} placeholder="2" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.1076")}</label>
                  <Input value={editItem.area || ''} onChange={e => setEditItem({ ...editItem, area: e.target.value })} placeholder="55" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.1077")}</label>
                  <Input value={editItem.floor_info || ''} onChange={e => setEditItem({ ...editItem, floor_info: e.target.value })} placeholder="3/9" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0082")}</label>
                  <Input value={editItem.address || ''} onChange={e => setEditItem({ ...editItem, address: e.target.value })} placeholder={adminT("admin.ui.0083")} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0084")}</label>
                  <Input value={editItem.phone || ''} onChange={e => setEditItem({ ...editItem, phone: e.target.value })} placeholder="+7..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">WhatsApp</label>
                  <Input value={editItem.whatsapp || ''} onChange={e => setEditItem({ ...editItem, whatsapp: e.target.value })} placeholder="+7..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Telegram</label>
                  <Input value={editItem.telegram || ''} onChange={e => setEditItem({ ...editItem, telegram: e.target.value })} placeholder="@username" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0085")}</label>
                <Input value={editItem.author_name || ''} onChange={e => setEditItem({ ...editItem, author_name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0087")}</label>
                <ImageUpload value={editItem.image_url || ''} onChange={key => setEditItem({ ...editItem, image_url: key })} folder="real-estate" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0088")}</label>
                <MultiImageUpload value={editItem.gallery_images || ''} onChange={keys => setEditItem({ ...editItem, gallery_images: keys })} folder="real-estate-gallery" maxImages={10} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0089")}</label>
                <Select value={editItem.status || 'approved'} onValueChange={v => setEditItem({ ...editItem, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{adminT("admin.ui.0039")}</SelectItem>
                    <SelectItem value="approved">{adminT("admin.ui.0040")}</SelectItem>
                    <SelectItem value="rejected">{adminT("admin.ui.0042")}</SelectItem>
                    <SelectItem value="hidden">{adminT("admin.ui.0043")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => setDialogOpen(false)} variant="outline" className="flex-1">{adminT("admin.ui.0095")}</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  {editItem.id ? adminT("admin.ui.0096") : adminT("admin.ui.0097")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}