import { adminMetadataLabel } from '@/i18n/adminTranslations';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';
import { client, withRetry, ANN_TYPES, formatDate, timeAgo } from '@/lib/api';
import { defaultExpiresAtIso } from '@/lib/announcements';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Eye, Pencil, Check, X, Trash2, Loader2, MapPin, Phone, MessageCircle, Send, EyeOff, Eye as EyeIcon } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';
import MultiImageUpload, { StorageGallery } from '@/components/MultiImageUpload';

interface Announcement {
  id: number;
  ann_type: string;
  title: string;
  description: string;
  price?: string;
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
  category_id?: number;
  expires_at?: string;
  promoted_until?: string;
  promotion_tier?: string;
  views_count?: number;
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

const ANN_TYPE_KEYS = Object.keys(ANN_TYPES);

export default function AdminAnnouncements() {
  const { t: adminT, lang } = useLanguage();
  const STATUS_MAP = getSTATUS_MAP(adminT);

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [viewItem, setViewItem] = useState<Announcement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Announcement> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const query: Record<string, string> = {};
      if (filterStatus !== 'all') query.status = filterStatus;
      const res = await withRetry(() => client.entities.announcements.query({ query, sort: '-created_at', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error(adminT("admin.ui.0044")); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, 30_000);
    return () => clearInterval(id);
  }, [filterStatus]);

  const changeStatus = async (id: number, status: string) => {
    try {
      const patch: Record<string, string> = { status };
      if (status === 'approved' || status === 'published') {
        const item = items.find((i) => i.id === id);
        if (item && !item.expires_at) patch.expires_at = defaultExpiresAtIso(30);
      }
      await withRetry(() => client.entities.announcements.update({ id: String(id), data: patch }));
      toast.success(status === 'approved' ? adminT("admin.ui.0045") : status === 'rejected' ? adminT("admin.ui.0046") : adminT("admin.ui.0047"));
      invalidateAllCaches();
      fetchItems();
      if (viewItem?.id === id) setViewItem({ ...viewItem!, status });
    } catch { toast.error(adminT("admin.ui.0048")); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(adminT("admin.ui.0049"))) return;
    try {
      await withRetry(() => client.entities.announcements.delete({ id: String(id) }));
      toast.success(adminT("admin.ui.0050"));
      invalidateAllCaches();
      fetchItems();
    } catch { toast.error(adminT("admin.ui.0051")); }
  };

  const openCreate = () => {
    setEditItem({
      ann_type: 'sell', title: '', description: '', price: '', address: '',
      image_url: '', gallery_images: '', phone: '', whatsapp: '', telegram: '',
      author_name: '', active: true, status: 'approved',
      expires_at: defaultExpiresAtIso(30),
    });
    setDialogOpen(true);
  };

  const openEdit = (item: Announcement) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.title || !editItem?.phone) {
      toast.error(adminT("admin.ui.0052"));
      return;
    }
    setSaving(true);
    try {
      const data = {
        ann_type: editItem.ann_type || 'sell',
        title: editItem.title,
        description: editItem.description || '',
        price: editItem.price || '',
        address: editItem.address || '',
        image_url: editItem.image_url || '',
        gallery_images: editItem.gallery_images || '',
        phone: editItem.phone,
        whatsapp: editItem.whatsapp || '',
        telegram: editItem.telegram || '',
        author_name: editItem.author_name || '',
        active: editItem.active ?? true,
        status: editItem.status || 'approved',
        category_id: editItem.category_id,
        expires_at: editItem.expires_at || defaultExpiresAtIso(30),
        promoted_until: editItem.promoted_until || '',
        promotion_tier: editItem.promotion_tier || '',
      };
      if (editItem.id) {
        await withRetry(() => client.entities.announcements.update({ id: String(editItem.id), data }));
        toast.success(adminT("admin.ui.0053"));
      } else {
        await withRetry(() => client.entities.announcements.create({
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">{items.length} {adminT("admin.ui.0056")}</p>
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{adminT("admin.ui.0057")}</SelectItem>
              <SelectItem value="pending">{adminT("admin.ui.0039")}</SelectItem>
              <SelectItem value="approved">{adminT("admin.ui.0058")}</SelectItem>
              <SelectItem value="published">{adminT("admin.ui.0059")}</SelectItem>
              <SelectItem value="rejected">{adminT("admin.ui.0060")}</SelectItem>
              <SelectItem value="hidden">{adminT("admin.ui.0061")}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1" /> {adminT("admin.ui.0062")} </Button>
        </div>
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const st = STATUS_MAP[item.status || 'pending'] || STATUS_MAP.pending;
          return (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {item.image_url && (
                      <StorageImage objectKey={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{adminMetadataLabel(ANN_TYPES[item.ann_type] || item.ann_type, adminT)}</Badge>
                        <Badge className={`text-xs border ${st.color}`}>{st.label}</Badge>
                        {item.promotion_tier === 'vip' && <Badge className="text-xs bg-purple-100 text-purple-800 border-purple-200">VIP</Badge>}
                        {item.promotion_tier === 'boost' && <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200">{adminT("admin.ui.0063")}</Badge>}
                      </div>
                      <h3 className="font-medium text-gray-900 text-sm truncate">{item.title}</h3>
                      <p className="text-xs text-gray-500 line-clamp-1">{item.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        {item.author_name && <span>{item.author_name}</span>}
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
        {items.length === 0 && <p className="text-center text-gray-400 py-8">{adminT("admin.ui.0066")}</p>}
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{adminT("admin.ui.0067")}{viewItem?.id}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{adminMetadataLabel(ANN_TYPES[viewItem.ann_type] || viewItem.ann_type, adminT)}</Badge>
                <Badge className={`border ${(STATUS_MAP[viewItem.status || 'pending'] || STATUS_MAP.pending).color}`}>
                  {(STATUS_MAP[viewItem.status || 'pending'] || STATUS_MAP.pending).label}
                </Badge>
              </div>
              <h3 className="font-semibold text-gray-900">{viewItem.title}</h3>
              <p className="text-sm whitespace-pre-wrap">{viewItem.description}</p>
              {viewItem.price && <p className="text-blue-600 font-bold">{viewItem.price}</p>}
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
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className={viewItem.status === 'approved' ? "bg-green-600 text-white" : ''}
                    variant={viewItem.status === 'approved' ? 'default' : 'outline'}
                    onClick={() => changeStatus(viewItem.id, 'approved')}
                  >
                    <Check className="h-4 w-4 mr-1" /> {adminT("admin.ui.0071")} </Button>
                  <Button
                    size="sm"
                    variant={viewItem.status === 'rejected' ? 'default' : 'outline'}
                    className={viewItem.status === 'rejected' ? "bg-red-600 text-white" : ''}
                    onClick={() => changeStatus(viewItem.id, 'rejected')}
                  >
                    <X className="h-4 w-4 mr-1" /> {adminT("admin.ui.0072")} </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setViewItem(null); openEdit(viewItem); }}
                  >
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
            <DialogTitle>{editItem?.id ? adminT("admin.ui.0074") : adminT("admin.ui.0075")}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0076")}</label>
                <Select value={editItem.ann_type || 'sell'} onValueChange={v => setEditItem({ ...editItem, ann_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANN_TYPE_KEYS.map(k => <SelectItem key={k} value={k}>{adminMetadataLabel(ANN_TYPES[k], adminT)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0077")}</label>
                <Input value={editItem.title || ''} onChange={e => setEditItem({ ...editItem, title: e.target.value })} placeholder={adminT("admin.ui.0078")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0079")}</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={4} placeholder={adminT("admin.ui.0080")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0081")}</label>
                  <Input value={editItem.price || ''} onChange={e => setEditItem({ ...editItem, price: e.target.value })} placeholder="50 000 ₸" />
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
                <Input value={editItem.author_name || ''} onChange={e => setEditItem({ ...editItem, author_name: e.target.value })} placeholder={adminT("admin.ui.0086")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0087")}</label>
                <ImageUpload
                  value={editItem.image_url || ''}
                  onChange={(key) => setEditItem({ ...editItem, image_url: key })}
                  folder="announcements"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0088")}</label>
                <MultiImageUpload
                  value={editItem.gallery_images || ''}
                  onChange={(keys) => setEditItem({ ...editItem, gallery_images: keys })}
                  folder="announcements-gallery"
                  maxImages={10}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0089")}</label>
                <Select value={editItem.status || 'approved'} onValueChange={v => setEditItem({ ...editItem, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{adminT("admin.ui.0039")}</SelectItem>
                    <SelectItem value="approved">{adminT("admin.ui.0040")}</SelectItem>
                    <SelectItem value="published">{adminT("admin.ui.0041")}</SelectItem>
                    <SelectItem value="rejected">{adminT("admin.ui.0042")}</SelectItem>
                    <SelectItem value="hidden">{adminT("admin.ui.0043")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0090")}</label>
                  <Input
                    type="datetime-local"
                    value={editItem.expires_at ? editItem.expires_at.slice(0, 16) : ''}
                    onChange={(e) => setEditItem({ ...editItem, expires_at: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0091")}</label>
                  <Input
                    type="datetime-local"
                    value={editItem.promoted_until ? editItem.promoted_until.slice(0, 16) : ''}
                    onChange={(e) => setEditItem({ ...editItem, promoted_until: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0092")}</label>
                <Select value={editItem.promotion_tier || 'none'} onValueChange={v => setEditItem({ ...editItem, promotion_tier: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{adminT("admin.ui.0093")}</SelectItem>
                    <SelectItem value="boost">{adminT("admin.ui.0094")}</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => setDialogOpen(false)} variant="outline" className="flex-1">{adminT("admin.ui.0095")}</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
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