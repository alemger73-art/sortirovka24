import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';
import { client, withRetry, formatDate } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Eye, Loader2, Calendar, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';

interface HistoryEvent {
  id: number;
  year: number;
  title: string;
  description: string;
  image_url?: string;
  image_url_after?: string;
  category: string;
  is_published: boolean;
  created_at?: string;
}

function getHISTORY_CATEGORIES(adminT: (key: string) => string) {
  const HISTORY_CATEGORIES = [
  { value: 'Infrastructure', label: adminT("admin.ui.0771") },
  { value: 'Culture', label: adminT("admin.ui.0772") },
  { value: 'People', label: adminT("admin.ui.0773") },
  { value: 'Transport', label: adminT("admin.ui.0774") },
];
  return HISTORY_CATEGORIES;
}

function getCATEGORY_LABELS(adminT: (key: string) => string) {
  const CATEGORY_LABELS: Record<string, string> = {
  Infrastructure: adminT("admin.ui.0775"),
  Culture: adminT("admin.ui.0776"),
  People: adminT("admin.ui.0777"),
  Transport: adminT("admin.ui.0778"),
};
  return CATEGORY_LABELS;
}

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  Infrastructure: 'border-blue-300 text-blue-700 bg-blue-50',
  Culture: 'border-purple-300 text-purple-700 bg-purple-50',
  People: 'border-amber-300 text-amber-700 bg-amber-50',
  Transport: 'border-emerald-300 text-emerald-700 bg-emerald-50',
};

// Preview component that mimics the public timeline card
function PreviewCard({ item }: { item: Partial<HistoryEvent> }) {
  const { t: adminT } = useLanguage();
  const CATEGORY_LABELS = getCATEGORY_LABELS(adminT);

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      {item.image_url && (
        <div className="aspect-video overflow-hidden bg-gray-100">
          <StorageImage objectKey={item.image_url} alt={item.title || ''} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className={`text-xs ${CATEGORY_BADGE_STYLES[item.category || ''] || ''}`}>
            {CATEGORY_LABELS[item.category || ''] || item.category}
          </Badge>
          <span className="text-sm font-bold text-gray-400">{item.year || '—'}</span>
          {!item.is_published && <Badge variant="destructive" className="text-xs">{adminT("admin.ui.0289")}</Badge>}
        </div>
        <h3 className="font-semibold text-gray-900 mb-2">{item.title || adminT("admin.ui.0450")}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{item.description || adminT("admin.ui.0779")}</p>
      </div>
    </div>
  );
}

export default function AdminHistory() {
  const { t: adminT } = useLanguage();
  const HISTORY_CATEGORIES = getHISTORY_CATEGORIES(adminT);
  const CATEGORY_LABELS = getCATEGORY_LABELS(adminT);

  const [items, setItems] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [editItem, setEditItem] = useState<Partial<HistoryEvent> | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.history_events.query({ sort: '-year', limit: 200 }));
      setItems((res.data?.items || []) as HistoryEvent[]);
    } catch {
      toast.error(adminT("admin.ui.0780"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const openCreate = () => {
    setEditItem({
      year: new Date().getFullYear(),
      title: '',
      description: '',
      image_url: '',
      image_url_after: '',
      category: 'Infrastructure',
      is_published: true,
    });
    setPreviewMode(false);
    setDialogOpen(true);
  };

  const openEdit = (item: HistoryEvent) => {
    setEditItem({ ...item });
    setPreviewMode(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.title || !editItem?.description || !editItem?.category || !editItem?.year) {
      toast.error(adminT("admin.ui.0781"));
      return;
    }
    setSaving(true);
    try {
      const data = {
        year: Number(editItem.year),
        title: editItem.title,
        description: editItem.description,
        image_url: editItem.image_url || '',
        image_url_after: editItem.image_url_after || '',
        category: editItem.category,
        is_published: editItem.is_published ?? true,
      };
      if (editItem.id) {
        await withRetry(() => client.entities.history_events.update({ id: String(editItem.id), data }));
        toast.success(adminT("admin.ui.0782"));
      } else {
        await withRetry(() => client.entities.history_events.create({
          data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) }
        }));
        toast.success(adminT("admin.ui.0783"));
      }
      invalidateAllCaches();
      setDialogOpen(false);
      setEditItem(null);
      fetchItems();
    } catch {
      toast.error(adminT("admin.ui.0055"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(adminT("admin.ui.0784"))) return;
    try {
      await withRetry(() => client.entities.history_events.delete({ id: String(id) }));
      toast.success(adminT("admin.ui.0050"));
      invalidateAllCaches();
      fetchItems();
    } catch {
      toast.error(adminT("admin.ui.0051"));
    }
  };

  const togglePublish = async (item: HistoryEvent) => {
    try {
      await withRetry(() => client.entities.history_events.update({
        id: String(item.id),
        data: { is_published: !item.is_published }
      }));
      toast.success(item.is_published ? adminT("admin.ui.0785") : adminT("admin.ui.0041"));
      invalidateAllCaches();
      fetchItems();
    } catch {
      toast.error(adminT("admin.ui.0048"));
    }
  };

  const filteredItems = filterCategory === 'all'
    ? items
    : items.filter(i => i.category === filterCategory);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{items.length} {adminT("admin.ui.0786")}</p>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder={adminT("admin.ui.0787")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{adminT("admin.ui.0787")}</SelectItem>
              {HISTORY_CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> {adminT("admin.ui.0788")} </Button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filteredItems.map(item => (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {item.image_url && (
                    <StorageImage objectKey={item.image_url} alt="" className="w-16 h-12 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${CATEGORY_BADGE_STYLES[item.category] || ''}`}>
                        {CATEGORY_LABELS[item.category] || item.category}
                      </Badge>
                      <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {item.year}
                      </span>
                      {!item.is_published && <Badge variant="destructive" className="text-xs">{adminT("admin.ui.0289")}</Badge>}
                    </div>
                    <h3 className="font-medium text-gray-900 text-sm truncate">{item.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost" size="sm" className="h-8 w-8 p-0"
                    onClick={() => togglePublish(item)}
                    title={item.is_published ? adminT("admin.ui.0064") : adminT("admin.ui.0789")}
                  >
                    <Eye className={`h-4 w-4 ${item.is_published ? 'text-green-600' : 'text-gray-400'}`} />
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
        {filteredItems.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-3xl mb-2">📜</div>
            <p>{adminT("admin.ui.0790")}{filterCategory !== 'all' ? adminT("admin.ui.0791") : ''}</p>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? adminT("admin.ui.0792") : adminT("admin.ui.0793")}</DialogTitle>
          </DialogHeader>

          {editItem && (
            <div className="space-y-4">
              {/* Preview toggle */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <Label className="text-sm font-medium">{adminT("admin.ui.0794")}</Label>
                <Switch checked={previewMode} onCheckedChange={setPreviewMode} />
              </div>

              {previewMode ? (
                <PreviewCard item={editItem} />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm mb-1.5 block">{adminT("admin.ui.0795")}</Label>
                      <Input
                        type="number"
                        value={editItem.year || ''}
                        onChange={(e) => setEditItem({ ...editItem, year: parseInt(e.target.value) || 0 })}
                        placeholder="1950"
                        min={1800}
                        max={2100}
                      />
                    </div>
                    <div>
                      <Label className="text-sm mb-1.5 block">{adminT("admin.ui.0459")}</Label>
                      <Select
                        value={editItem.category || 'Infrastructure'}
                        onValueChange={(v) => setEditItem({ ...editItem, category: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {HISTORY_CATEGORIES.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm mb-1.5 block">{adminT("admin.ui.0796")}</Label>
                    <Input
                      value={editItem.title || ''}
                      onChange={(e) => setEditItem({ ...editItem, title: e.target.value })}
                      placeholder={adminT("admin.ui.0797")}
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-1.5 block">{adminT("admin.ui.0798")}</Label>
                    <Textarea
                      value={editItem.description || ''}
                      onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                      placeholder={adminT("admin.ui.0799")}
                      rows={5}
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-1.5 block">{adminT("admin.ui.0800")}</Label>
                    <ImageUpload
                      value={editItem.image_url || ''}
                      onChange={(key) => setEditItem({ ...editItem, image_url: key })}
                      folder="history"
                      compact
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-1.5 block">{adminT("admin.ui.0801")}</Label>
                    <ImageUpload
                      value={editItem.image_url_after || ''}
                      onChange={(key) => setEditItem({ ...editItem, image_url_after: key })}
                      folder="history"
                      compact
                    />
                    <p className="text-xs text-gray-400 mt-1">{adminT("admin.ui.0802")}</p>
                  </div>

                  <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                    <Switch
                      checked={editItem.is_published ?? true}
                      onCheckedChange={(v) => setEditItem({ ...editItem, is_published: v })}
                    />
                    <Label className="text-sm">
                      {editItem.is_published ? adminT("admin.ui.0803") : adminT("admin.ui.0804")}
                    </Label>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  <X className="h-4 w-4 mr-1" /> {adminT("admin.ui.0095")} </Button>
                <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
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