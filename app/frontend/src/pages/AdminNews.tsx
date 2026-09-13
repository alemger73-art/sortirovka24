import { adminMetadataLabel } from '@/i18n/adminTranslations';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';
import { client, withRetry, NEWS_CATEGORIES, formatDate } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Eye, Youtube, Loader2, Images } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';
import MultiImageUpload, { StorageGallery } from '@/components/MultiImageUpload';

interface NewsItem {
  id: number;
  title: string;
  content: string;
  short_description?: string;
  category: string;
  image_url?: string;
  gallery_images?: string;
  youtube_url?: string;
  published?: boolean;
  created_at?: string;
}

function getYoutubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

export default function AdminNews() {
  const { t: adminT, lang } = useLanguage();

  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<NewsItem | null>(null);
  const [editItem, setEditItem] = useState<Partial<NewsItem> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.news.query({ sort: '-created_at', limit: 100 }));
      setItems(res.data?.items || []);
    } catch { toast.error(adminT("admin.ui.0958")); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, []);

  const openCreate = () => {
    setEditItem({ title: '', content: '', short_description: '', category: NEWS_CATEGORIES[0], image_url: '', gallery_images: '', youtube_url: '', published: true });
    setDialogOpen(true);
  };

  const openEdit = (item: NewsItem) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.title || !editItem?.content || !editItem?.category) {
      toast.error(adminT("admin.ui.0921"));
      return;
    }
    setSaving(true);
    try {
      const data = {
        title: editItem.title,
        content: editItem.content,
        short_description: editItem.short_description || '',
        category: editItem.category,
        image_url: editItem.image_url || '',
        gallery_images: editItem.gallery_images || '',
        youtube_url: editItem.youtube_url || '',
        published: editItem.published ?? true,
      };
      if (editItem.id) {
        await withRetry(() => client.entities.news.update({ id: String(editItem.id), data }));
        toast.success(adminT("admin.ui.0959"));
      } else {
        await withRetry(() => client.entities.news.create({ data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) } }));
        toast.success(adminT("admin.ui.0960"));
      }
      invalidateAllCaches();
      setDialogOpen(false);
      setEditItem(null);
      fetchItems();
    } catch { toast.error(adminT("admin.ui.0055")); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(adminT("admin.ui.0961"))) return;
    try {
      await withRetry(() => client.entities.news.delete({ id: String(id) }));
      invalidateAllCaches();
      toast.success(adminT("admin.ui.0050"));
      fetchItems();
    } catch { toast.error(adminT("admin.ui.0051")); }
  };

  const getGalleryCount = (item: NewsItem) => {
    if (!item.gallery_images) return 0;
    return item.gallery_images.split(',').filter(k => k.trim()).length;
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} {adminT("admin.ui.0962")}</p>
        <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> {adminT("admin.ui.0062")} </Button>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.id} className="overflow-hidden bg-white">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {item.image_url && (
                    <StorageImage objectKey={item.image_url} alt="" className="w-16 h-12 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{adminMetadataLabel(item.category, adminT)}</Badge>
                      {item.youtube_url && <Badge variant="secondary" className="text-xs"><Youtube className="h-3 w-3 mr-1" />{adminT("admin.ui.0963")}</Badge>}
                      {getGalleryCount(item) > 0 && <Badge variant="secondary" className="text-xs"><Images className="h-3 w-3 mr-1" />{getGalleryCount(item)} {adminT("admin.ui.0224")}</Badge>}
                      {item.published === false && <Badge variant="destructive" className="text-xs">{adminT("admin.ui.0289")}</Badge>}
                    </div>
                    <h3 className="font-medium text-gray-900 text-sm truncate">{item.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{item.created_at ? formatDate(item.created_at, lang) : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setPreviewItem(item)}>
                    <Eye className="h-4 w-4 text-gray-500" />
                  </Button>
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
        {items.length === 0 && <p className="text-center text-gray-400 py-8">{adminT("admin.ui.0964")}</p>}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? adminT("admin.ui.0965") : adminT("admin.ui.0966")}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0118")}</label>
                <Input value={editItem.title || ''} onChange={e => setEditItem({ ...editItem, title: e.target.value })} placeholder={adminT("admin.ui.0967")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0459")}</label>
                <Select value={editItem.category || ''} onValueChange={v => setEditItem({ ...editItem, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NEWS_CATEGORIES.map(c => <SelectItem key={c} value={c}>{adminMetadataLabel(c, adminT)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0968")}</label>
                <Textarea value={editItem.short_description || ''} onChange={e => setEditItem({ ...editItem, short_description: e.target.value })} rows={2} placeholder={adminT("admin.ui.0969")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0970")}</label>
                <Textarea value={editItem.content || ''} onChange={e => setEditItem({ ...editItem, content: e.target.value })} rows={6} placeholder={adminT("admin.ui.0971")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0972")}</label>
                <ImageUpload
                  value={editItem.image_url || ''}
                  onChange={(key) => setEditItem({ ...editItem, image_url: key })}
                  folder="news"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0973")}</label>
                <p className="text-xs text-gray-400 mb-1">{adminT("admin.ui.0234")}</p>
                <MultiImageUpload
                  value={editItem.gallery_images || ''}
                  onChange={(keys) => setEditItem({ ...editItem, gallery_images: keys })}
                  folder="news"
                  maxImages={10}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">{adminT("admin.ui.0974")}</label>
                <Input value={editItem.youtube_url || ''} onChange={e => setEditItem({ ...editItem, youtube_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
                {editItem.youtube_url && getYoutubeEmbedUrl(editItem.youtube_url) && (
                  <div className="mt-2 rounded-lg overflow-hidden aspect-video">
                    <iframe src={getYoutubeEmbedUrl(editItem.youtube_url)!} className="w-full h-full" allowFullScreen title="preview" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="published" checked={editItem.published ?? true} onChange={e => setEditItem({ ...editItem, published: e.target.checked })} className="rounded" />
                <label htmlFor="published" className="text-sm text-gray-700">{adminT("admin.ui.0041")}</label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => setDialogOpen(false)} variant="outline" className="flex-1">{adminT("admin.ui.0095")}</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editItem.id ? adminT("admin.ui.0096") : adminT("admin.ui.0097")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewItem?.title}</DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{adminMetadataLabel(previewItem.category, adminT)}</Badge>
                {previewItem.created_at && <span className="text-xs text-gray-500">{formatDate(previewItem.created_at, lang)}</span>}
              </div>
              {previewItem.image_url && (
                <StorageImage objectKey={previewItem.image_url} alt="" className="w-full rounded-lg max-h-48 object-cover" />
              )}
              {previewItem.gallery_images && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">{adminT("admin.ui.0069")}</p>
                  <StorageGallery keys={previewItem.gallery_images} />
                </div>
              )}
              {previewItem.youtube_url && getYoutubeEmbedUrl(previewItem.youtube_url) && (
                <div className="rounded-lg overflow-hidden aspect-video">
                  <iframe src={getYoutubeEmbedUrl(previewItem.youtube_url)!} className="w-full h-full" allowFullScreen title="video" />
                </div>
              )}
              {previewItem.short_description && <p className="text-sm text-gray-600 italic">{previewItem.short_description}</p>}
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{previewItem.content}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}