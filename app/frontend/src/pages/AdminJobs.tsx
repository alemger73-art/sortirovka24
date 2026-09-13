import { adminMetadataLabel } from '@/i18n/adminTranslations';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';
import { client, withRetry, JOB_CATEGORIES, formatDate, timeAgo } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Eye, Pencil, Check, X, Trash2, Loader2, MapPin, Phone, MessageCircle, Briefcase, Send } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';

interface Job {
  id: number;
  job_title: string;
  employer?: string;
  category?: string;
  description: string;
  salary?: string;
  schedule?: string;
  district?: string;
  phone: string;
  whatsapp?: string;
  telegram?: string;
  image_url?: string;
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
};
  return STATUS_MAP;
}

export default function AdminJobs() {
  const { t: adminT, lang } = useLanguage();
  const STATUS_MAP = getSTATUS_MAP(adminT);

  const [items, setItems] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [viewItem, setViewItem] = useState<Job | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Job> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const query: Record<string, string> = {};
      if (filterStatus !== 'all') query.status = filterStatus;
      const res = await withRetry(() => client.entities.jobs.query({ query, sort: '-created_at', limit: 200 }));
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
      await withRetry(() => client.entities.jobs.update({ id: String(id), data: { status } }));
      toast.success(status === 'approved' ? adminT("admin.ui.0852") : status === 'rejected' ? adminT("admin.ui.0853") : adminT("admin.ui.0047"));
      invalidateAllCaches();
      fetchItems();
      if (viewItem?.id === id) setViewItem({ ...viewItem!, status });
    } catch { toast.error(adminT("admin.ui.0048")); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(adminT("admin.ui.0854"))) return;
    try {
      await withRetry(() => client.entities.jobs.delete({ id: String(id) }));
      toast.success(adminT("admin.ui.0050"));
      invalidateAllCaches();
      fetchItems();
    } catch { toast.error(adminT("admin.ui.0051")); }
  };

  const openCreate = () => {
    setEditItem({
      job_title: '', employer: '', category: JOB_CATEGORIES[0], description: '',
      salary: '', schedule: '', district: 'Сортировка', phone: '', whatsapp: '',
      telegram: '', image_url: '', active: true, status: 'approved',
    });
    setDialogOpen(true);
  };

  const openEdit = (item: Job) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.job_title || !editItem?.phone) {
      toast.error(adminT("admin.ui.0052"));
      return;
    }
    setSaving(true);
    try {
      const data = {
        job_title: editItem.job_title,
        employer: editItem.employer || '',
        category: editItem.category || '',
        description: editItem.description || '',
        salary: editItem.salary || '',
        schedule: editItem.schedule || '',
        district: editItem.district || '',
        phone: editItem.phone,
        whatsapp: editItem.whatsapp || '',
        telegram: editItem.telegram || '',
        image_url: editItem.image_url || '',
        active: editItem.active ?? true,
        status: editItem.status || 'approved',
      };
      if (editItem.id) {
        await withRetry(() => client.entities.jobs.update({ id: String(editItem.id), data }));
        toast.success(adminT("admin.ui.0855"));
      } else {
        await withRetry(() => client.entities.jobs.create({
          data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) }
        }));
        toast.success(adminT("admin.ui.0856"));
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
        <p className="text-sm text-gray-500">{items.length} {adminT("admin.ui.0857")}</p>
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{adminT("admin.ui.0057")}</SelectItem>
              <SelectItem value="pending">{adminT("admin.ui.0039")}</SelectItem>
              <SelectItem value="approved">{adminT("admin.ui.0058")}</SelectItem>
              <SelectItem value="published">{adminT("admin.ui.0059")}</SelectItem>
              <SelectItem value="rejected">{adminT("admin.ui.0060")}</SelectItem>
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
                    {item.image_url ? (
                      <StorageImage objectKey={item.image_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-5 h-5 text-blue-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {item.category && <Badge variant="outline" className="text-xs">{adminMetadataLabel(item.category, adminT)}</Badge>}
                        <Badge className={`text-xs border ${st.color}`}>{st.label}</Badge>
                      </div>
                      <h3 className="font-medium text-gray-900 text-sm truncate">{item.job_title}</h3>
                      <p className="text-xs text-gray-500">{item.employer}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        {item.salary && <span>{item.salary}</span>}
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
                    {item.status !== 'rejected' && (
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
        {items.length === 0 && <p className="text-center text-gray-400 py-8">{adminT("admin.ui.0858")}</p>}
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{adminT("admin.ui.0859")}{viewItem?.id}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {viewItem.category && <Badge variant="outline">{adminMetadataLabel(viewItem.category, adminT)}</Badge>}
                <Badge className={`border ${(STATUS_MAP[viewItem.status || 'pending'] || STATUS_MAP.pending).color}`}>
                  {(STATUS_MAP[viewItem.status || 'pending'] || STATUS_MAP.pending).label}
                </Badge>
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{viewItem.job_title}</h3>
              {viewItem.employer && <p className="text-sm text-gray-600">{adminT("admin.ui.0860")} {viewItem.employer}</p>}
              {viewItem.salary && <p className="text-blue-600 font-bold">{viewItem.salary}</p>}
              <p className="text-sm whitespace-pre-wrap">{viewItem.description}</p>
              <div className="space-y-1 text-sm text-gray-600">
                {viewItem.schedule && <p>{adminT("admin.ui.0861")} {viewItem.schedule}</p>}
                {viewItem.district && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{viewItem.district}</p>}
                <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{viewItem.phone}</p>
                {viewItem.whatsapp && <p className="flex items-center gap-2"><MessageCircle className="h-4 w-4" />{viewItem.whatsapp}</p>}
                {viewItem.telegram && <p className="flex items-center gap-2"><Send className="h-4 w-4" />{viewItem.telegram}</p>}
              </div>
              {viewItem.image_url && (
                <StorageImage objectKey={viewItem.image_url} alt="" className="w-full rounded-lg max-h-48 object-cover" />
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
            <DialogTitle>{editItem?.id ? adminT("admin.ui.0862") : adminT("admin.ui.0863")}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0864")}</label>
                <Input value={editItem.job_title || ''} onChange={e => setEditItem({ ...editItem, job_title: e.target.value })} placeholder={adminT("admin.ui.0865")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0866")}</label>
                <Input value={editItem.employer || ''} onChange={e => setEditItem({ ...editItem, employer: e.target.value })} placeholder={adminT("admin.ui.0867")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0231")}</label>
                <Select value={editItem.category || ''} onValueChange={v => setEditItem({ ...editItem, category: v })}>
                  <SelectTrigger><SelectValue placeholder={adminT("admin.ui.0295")} /></SelectTrigger>
                  <SelectContent>
                    {JOB_CATEGORIES.map(c => <SelectItem key={c} value={c}>{adminMetadataLabel(c, adminT)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0868")}</label>
                  <Input value={editItem.salary || ''} onChange={e => setEditItem({ ...editItem, salary: e.target.value })} placeholder={adminT("admin.ui.0869")} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0870")}</label>
                  <Input value={editItem.schedule || ''} onChange={e => setEditItem({ ...editItem, schedule: e.target.value })} placeholder="5/2, 9:00-18:00" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0832")}</label>
                <Input value={editItem.district || ''} onChange={e => setEditItem({ ...editItem, district: e.target.value })} placeholder={adminT("admin.ui.0809")} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0079")}</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={4} placeholder={adminT("admin.ui.0871")} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0084")}</label>
                  <Input value={editItem.phone || ''} onChange={e => setEditItem({ ...editItem, phone: e.target.value })} placeholder="+7..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">WhatsApp</label>
                  <Input value={editItem.whatsapp || ''} onChange={e => setEditItem({ ...editItem, whatsapp: e.target.value })} placeholder="+7..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Telegram</label>
                  <Input value={editItem.telegram || ''} onChange={e => setEditItem({ ...editItem, telegram: e.target.value })} placeholder="@username" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0331")}</label>
                <ImageUpload value={editItem.image_url || ''} onChange={key => setEditItem({ ...editItem, image_url: key })} folder="jobs" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0089")}</label>
                <Select value={editItem.status || 'approved'} onValueChange={v => setEditItem({ ...editItem, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{adminT("admin.ui.0039")}</SelectItem>
                    <SelectItem value="approved">{adminT("admin.ui.0040")}</SelectItem>
                    <SelectItem value="published">{adminT("admin.ui.0041")}</SelectItem>
                    <SelectItem value="rejected">{adminT("admin.ui.0042")}</SelectItem>
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