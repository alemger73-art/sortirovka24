import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';
import { client, withRetry, formatDate } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Loader2, ExternalLink, Image } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';
import {
  damAlemPromoBannerSizeHint,
  sitePromoBannerSizeHint,
} from '@/lib/bannerSpecs';

interface Banner {
  id: number;
  title: string;
  banner_text?: string;
  subtitle?: string;
  image_url?: string;
  link_url?: string;
  button_text?: string;
  button_url?: string;
  banner_type?: string;
  active?: boolean;
  created_at?: string;
}

function getBANNER_TYPES(adminT: (key: string) => string) {
  const BANNER_TYPES: Record<string, string> = {
  hero: adminT("admin.ui.0098"),
  promo: adminT("admin.ui.0099"),
  awareness: adminT("admin.ui.0100"),
  shop: adminT("admin.ui.0101"),
  food_delivery: adminT("admin.ui.0102"),
  services: adminT("admin.ui.0103"),
  other: adminT("admin.ui.0104"),
};
  return BANNER_TYPES;
}

function bannerImageSizeHint(bannerType?: string): string {
  if (bannerType === 'food_delivery') return damAlemPromoBannerSizeHint();
  return sitePromoBannerSizeHint();
}

export default function AdminBanners() {
  const { t: adminT } = useLanguage();
  const BANNER_TYPES = getBANNER_TYPES(adminT);

  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Banner> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.banners.query({ sort: '-created_at', limit: 50 }));
      setItems(res.data?.items || []);
    } catch { toast.error(adminT("admin.ui.0044")); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, []);

  const openCreate = () => {
    setEditItem({
      title: '', banner_text: '', subtitle: '', image_url: '',
      link_url: '', button_text: '', button_url: '',
      banner_type: 'promo', active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (item: Banner) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.title) {
      toast.error(adminT("admin.ui.0105"));
      return;
    }
    setSaving(true);
    try {
      const data = {
        title: editItem.title,
        banner_text: editItem.banner_text || '',
        subtitle: editItem.subtitle || '',
        image_url: editItem.image_url || '',
        link_url: editItem.link_url || '',
        button_text: editItem.button_text || '',
        button_url: editItem.button_url || '',
        banner_type: editItem.banner_type || 'promo',
        active: editItem.active ?? true,
      };
      if (editItem.id) {
        await withRetry(() => client.entities.banners.update({ id: String(editItem.id), data }));
        toast.success(adminT("admin.ui.0106"));
      } else {
        await withRetry(() => client.entities.banners.create({
          data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) }
        }));
        toast.success(adminT("admin.ui.0107"));
      }
      invalidateAllCaches();
      setDialogOpen(false);
      fetchItems();
    } catch { toast.error(adminT("admin.ui.0055")); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(adminT("admin.ui.0108"))) return;
    try {
      await withRetry(() => client.entities.banners.delete({ id: String(id) }));
      invalidateAllCaches();
      toast.success(adminT("admin.ui.0050"));
      fetchItems();
    } catch { toast.error(adminT("admin.ui.0051")); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} {adminT("admin.ui.0109")}</p>
        <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> {adminT("admin.ui.0110")} </Button>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                {item.image_url ? (
                  <StorageImage objectKey={item.image_url} alt="" className="w-20 h-14 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-20 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Image className="h-6 w-6 text-gray-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {BANNER_TYPES[item.banner_type || 'other'] || item.banner_type}
                    </Badge>
                    {item.active === false ? (
                      <Badge variant="destructive" className="text-xs">{adminT("admin.ui.0111")}</Badge>
                    ) : (
                      <Badge className="text-xs bg-green-100 text-green-800">{adminT("admin.ui.0112")}</Badge>
                    )}
                  </div>
                  <p className="font-medium text-sm text-gray-900 truncate">{item.title}</p>
                  {item.banner_text && <p className="text-xs text-gray-500 truncate">{item.banner_text}</p>}
                  {item.link_url && (
                    <a href={item.link_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 flex items-center gap-1 mt-0.5 hover:underline">
                      <ExternalLink className="h-3 w-3" /> {adminT("admin.ui.0113")} </a>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4 text-blue-600" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">{adminT("admin.ui.0114")}</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? adminT("admin.ui.0115") : adminT("admin.ui.0116")}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0117")}</label>
                <Select value={editItem.banner_type || 'promo'} onValueChange={v => setEditItem({ ...editItem, banner_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BANNER_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0118")}</label>
                <Input value={editItem.title || ''} onChange={e => setEditItem({ ...editItem, title: e.target.value })} placeholder={adminT("admin.ui.0119")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0120")}</label>
                <Input value={editItem.subtitle || ''} onChange={e => setEditItem({ ...editItem, subtitle: e.target.value })} placeholder={adminT("admin.ui.0120")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0079")}</label>
                <Textarea value={editItem.banner_text || ''} onChange={e => setEditItem({ ...editItem, banner_text: e.target.value })} rows={2} placeholder={adminT("admin.ui.0121")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0122")}</label>
                <p className="mt-0.5 text-xs text-gray-500">{bannerImageSizeHint(editItem.banner_type)}</p>
                <div className="mt-2">
                  <ImageUpload
                    value={editItem.image_url || ''}
                    onChange={(key) => setEditItem({ ...editItem, image_url: key })}
                    folder="banners"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0123")}</label>
                <Input value={editItem.link_url || ''} onChange={e => setEditItem({ ...editItem, link_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0124")}</label>
                  <Input value={editItem.button_text || ''} onChange={e => setEditItem({ ...editItem, button_text: e.target.value })} placeholder={adminT("admin.ui.0125")} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0126")}</label>
                  <Input value={editItem.button_url || ''} onChange={e => setEditItem({ ...editItem, button_url: e.target.value })} placeholder="/announcements" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editItem.active ?? true} onCheckedChange={v => setEditItem({ ...editItem, active: v })} />
                <label className="text-sm text-gray-700">{adminT("admin.ui.0112")}</label>
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