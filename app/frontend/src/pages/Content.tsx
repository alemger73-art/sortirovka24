import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { client, withRetry, COMPLAINT_CATEGORIES, NEWS_CATEGORIES, ANN_TYPES, REAL_ESTATE_TYPES, JOB_CATEGORIES, STATUS_LABELS, DIRECTORY_CATEGORIES, timeAgo, formatDate } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { ChevronLeft, MapPin, Phone, MessageCircle, Clock, CheckCircle, AlertTriangle, Star, Briefcase, HelpCircle, Send, BookOpen, Megaphone, Shield, Loader2, Plus, Home, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from "@/components/ImageUpload";
import StorageImg from "@/components/StorageImg";
import MultiImageUpload, { StorageGallery } from '@/components/MultiImageUpload';
import VideoUpload from '@/components/VideoUpload';
import StorageVideo from '@/components/StorageVideo';

function normalizeYoutubeWatchUrl(value: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function buildYoutubeEmbedUrl(value: string): string | null {
  const normalized = normalizeYoutubeWatchUrl(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname.startsWith('/embed/')) return url.toString();
      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/')[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      const id = url.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\/+/, '').split('/')[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

/* ============ NEWS LIST ============ */
export function NewsList() {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');

  useEffect(() => { loadNews(); }, [category]);

  async function loadNews() {
    setLoading(true);
    try {
      const query: any = { published: true };
      if (category) query.category = category;
      const res = await fetchWithCache(`news_list_${category || 'all'}`, () => withRetry(() => client.entities.news.query({ query, sort: '-created_at', limit: 50 })), 5 * 60 * 1000);
      setNews(res.data?.items || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Новости Сортировки</h1>
        <p className="text-gray-500 mb-6">Актуальные события и новости района</p>

        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setCategory('')} className={`px-3 py-1.5 rounded-full text-sm font-medium ${!category ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Все</button>
          {NEWS_CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c === category ? '' : c)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${category === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{c}</button>
          ))}
        </div>

        {loading ? <div className="text-center py-12 text-gray-400">Загрузка...</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {news.map(item => (
              <Link key={item.id} to={`/news/${item.id}`} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-all hover:-translate-y-0.5 group">
                {item.image_url ? (
                  <div className="h-48 overflow-hidden"><StorageImg objectKey={item.image_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" /></div>
                ) : (
                  <div className="h-48 bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center"><span className="text-5xl">📰</span></div>
                )}
                <div className="p-5">
                  <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{item.category}</span>
                  <h3 className="font-semibold text-gray-900 mt-2 line-clamp-2">{item.title}</h3>
                  <p className="text-sm text-gray-500 mt-2 line-clamp-2">{item.short_description}</p>
                  <p className="text-xs text-gray-400 mt-3">{formatDate(item.created_at)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ============ NEWS DETAIL ============ */
export function NewsDetail() {
  const { id } = useParams();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const youtubeWatchUrl = normalizeYoutubeWatchUrl(item?.youtube_url || '');
  const youtubeEmbedUrl = buildYoutubeEmbedUrl(item?.youtube_url || '');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithCache(`news_detail_${id}`, () => withRetry(() => client.entities.news.get({ id: id! })), 5 * 60 * 1000);
        setItem(res.data);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <Layout><div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">Загрузка...</div></Layout>;
  if (!item) return <Layout><div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">Новость не найдена</div></Layout>;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/news" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> Все новости</Link>
        {item.image_url && <StorageImg objectKey={item.image_url} alt={item.title} className="w-full h-64 object-cover rounded-xl mb-6" />}
        {item.gallery_images && (
          <div className="mb-6">
            <StorageGallery keys={item.gallery_images} />
          </div>
        )}
        <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{item.category}</span>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mt-3 mb-2">{item.title}</h1>
        <p className="text-sm text-gray-400 mb-6">{formatDate(item.created_at)}</p>
        <div className="prose prose-gray max-w-none">
          {(item.content || item.short_description || '').split('\n').map((p: string, i: number) => <p key={i} className="text-gray-700 leading-relaxed mb-4">{p}</p>)}
        </div>
        {item.youtube_url && (
          <div className="mt-6">
            {youtubeEmbedUrl ? (
              <iframe
                src={youtubeEmbedUrl}
                className="w-full h-64 md:h-96 rounded-xl"
                allowFullScreen
                title="YouTube video"
              />
            ) : null}
            <a
              href={youtubeWatchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex mt-3 text-sm text-blue-600 hover:text-blue-700 underline underline-offset-2"
            >
              Открыть видео на YouTube
            </a>
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ============ COMPLAINTS LIST ============ */
export function ComplaintsList() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithCache('complaints_list', () => withRetry(() => client.entities.complaints.query({ sort: '-created_at', limit: 50 })), 5 * 60 * 1000);
        const HIDDEN_STATUSES = ['rejected', 'hidden'];
        setComplaints((res.data?.items || []).filter((c: any) => !HIDDEN_STATUSES.includes(c.status)));
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, []);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Жалобы жителей</h1>
            <p className="text-gray-500 mt-1">Проблемы района, о которых сообщают жители</p>
          </div>
          <Link to="/complaints/new" className="inline-flex items-center gap-2 bg-red-600 text-white font-medium px-4 py-2.5 rounded-lg hover:bg-red-700 text-sm">
            <AlertTriangle className="w-4 h-4" /> Подать жалобу
          </Link>
        </div>
        {loading ? <div className="text-center py-12 text-gray-400">Загрузка...</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {complaints.map(c => {
              const st = STATUS_LABELS[c.status] || STATUS_LABELS.new;
              return (
                <div key={c.id} className="bg-white rounded-xl shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">{c.category}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                  </div>
                  <p className="text-gray-700">{c.description}</p>
                  {c.photo_url && (
                    <div className="mt-3">
                      <StorageImg objectKey={c.photo_url} alt="Фото проблемы" className="w-full h-40 object-cover rounded-lg" />
                    </div>
                  )}
                  {c.gallery_images && (
                    <div className="mt-2">
                      <StorageGallery keys={c.gallery_images} />
                    </div>
                  )}
                  {c.complaint_video && (
                    <div className="mt-2">
                      <StorageVideo objectKey={c.complaint_video} />
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                    <div className="flex items-center gap-1 text-sm text-gray-400"><MapPin className="w-3.5 h-3.5" /> {c.address}</div>
                    <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
                  </div>
                  {c.author_name && <p className="text-xs text-gray-400 mt-1">— {c.author_name}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ============ NEW COMPLAINT FORM ============ */
export function NewComplaintForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ category: '', address: '', description: '', author_name: '', phone: '' });
  const [photoKey, setPhotoKey] = useState('');
  const [galleryKeys, setGalleryKeys] = useState('');
  const [videoKey, setVideoKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category || !form.address || !form.description) return;
    if (submitted) return;
    setSubmitting(true);
    setSubmitted(true);
    try {
      await withRetry(() => client.entities.complaints.create({
        data: {
          ...form,
          status: 'new',
          photo_url: photoKey,
          gallery_images: galleryKeys,
          complaint_video: videoKey,
          created_at: new Date().toISOString(),
        },
      }));
      setSuccess(true);
      const photoCount = galleryKeys ? galleryKeys.split(',').filter((k: string) => k.trim()).length : 0;
      const totalPhotos = (photoKey ? 1 : 0) + photoCount;
      client.apiCall.invoke({
        url: '/api/v1/telegram/notify/complaint',
        method: 'POST',
        data: {
          category: form.category,
          address: form.address,
          description: form.description,
          author_name: form.author_name,
          phone: form.phone,
          photo_count: totalPhotos,
          has_video: !!videoKey,
        },
      }).catch((err: unknown) => console.warn('Telegram notification skipped:', err));
    } catch (e) {
      console.error(e);
      toast.error('Ошибка отправки жалобы. Попробуйте ещё раз.');
      setSubmitted(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) return (
    <Layout><div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-green-600" /></div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Жалоба отправлена!</h2>
      <p className="text-gray-500 mb-6">Спасибо за обращение. Мы передадим информацию в соответствующие службы.</p>
      <Link to="/complaints" className="text-blue-600 hover:text-blue-700 font-medium">Все жалобы</Link>
    </div></Layout>
  );

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <Link to="/complaints" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> Назад</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Подать жалобу</h1>
        <p className="text-gray-500 mb-6">Сообщите о проблеме в районе</p>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Категория *</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required>
              <option value="">Выберите категорию</option>
              {COMPLAINT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Адрес *</label>
            <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Укажите точный адрес проблемы" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание проблемы *</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ваше имя</label>
            <input type="text" value={form.author_name} onChange={e => setForm({ ...form, author_name: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Фото (до 5 штук)</label>
            <p className="text-xs text-gray-400 mb-1.5">Загрузите фото проблемы. Перетаскивайте для изменения порядка.</p>
            <MultiImageUpload value={galleryKeys} onChange={setGalleryKeys} folder="complaints" maxImages={5} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Видео (до 50 МБ)</label>
            <p className="text-xs text-gray-400 mb-1.5">MP4, MOV или WebM. Снимите видео проблемы.</p>
            <VideoUpload value={videoKey} onChange={setVideoKey} folder="complaints" />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800 mb-2">📹 Большое видео? Отправьте через Telegram:</p>
            <a
              href="https://t.me/sortировка_portal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#0088cc] text-white font-medium px-4 py-2 rounded-lg hover:bg-[#0077b5] transition-colors text-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Отправить видео через Telegram
            </a>
          </div>

          <button type="submit" disabled={submitting || submitted} className="w-full bg-red-600 text-white font-medium py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Отправка...
              </span>
            ) : 'Отправить жалобу'}
          </button>
        </form>

        <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-green-900 text-sm">Ваша жалоба будет рассмотрена</h3>
              <p className="text-sm text-green-700 mt-1">
                Портал курирует <strong>Кошакаев А.А.</strong> — все обращения передаются в соответствующие службы района Сортировка. Мы следим за решением каждой проблемы.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ============ ANNOUNCEMENTS LIST ============ */
export function AnnouncementsList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => { loadData(); }, [typeFilter]);

  async function loadData() {
    setLoading(true);
    try {
      const query: any = {};
      if (typeFilter) query.ann_type = typeFilter;
      const res = await fetchWithCache(`announcements_list_${typeFilter || 'all'}`, () => withRetry(() => client.entities.announcements.query({ query, sort: '-created_at', limit: 50 })), 5 * 60 * 1000);
      const VISIBLE_STATUSES = ['approved', 'published'];
      setItems((res.data?.items || []).filter((a: any) => VISIBLE_STATUSES.includes(a.status)));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Объявления</h1>
            <p className="text-gray-500 mt-1">Доска объявлений района Сортировка</p>
          </div>
          <Link to="/announcements/new" className="inline-flex items-center gap-2 bg-amber-500 text-white font-medium px-4 py-2.5 rounded-lg hover:bg-amber-600 text-sm">
            <Megaphone className="w-4 h-4" /> Разместить
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setTypeFilter('')} className={`px-3 py-1.5 rounded-full text-sm font-medium ${!typeFilter ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Все</button>
          {Object.entries(ANN_TYPES).map(([key, label]) => (
            <button key={key} onClick={() => setTypeFilter(key === typeFilter ? '' : key)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${typeFilter === key ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{label}</button>
          ))}
        </div>

        {loading ? <div className="text-center py-12 text-gray-400">Загрузка...</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(ann => (
              <Link key={ann.id} to={`/announcements/${ann.id}`} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-all hover:-translate-y-0.5 block">
                {ann.image_url && (
                  <StorageImg objectKey={ann.image_url} alt={ann.title} className="w-full h-40 object-cover" />
                )}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{ANN_TYPES[ann.ann_type] || ann.ann_type}</span>
                    <span className="text-xs text-gray-400">{timeAgo(ann.created_at)}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900">{ann.title}</h3>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{ann.description}</p>
                  {ann.price && <p className="text-blue-600 font-bold mt-2">{ann.price}</p>}
                  {ann.address && <div className="flex items-center gap-1 mt-2 text-xs text-gray-400"><MapPin className="w-3.5 h-3.5" /> {ann.address}</div>}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                    <span className="inline-flex items-center gap-1 text-sm text-blue-600"><Phone className="w-3.5 h-3.5" /> {ann.phone}</span>
                    {ann.whatsapp && <span className="inline-flex items-center gap-1 text-sm text-green-600"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ============ NEW ANNOUNCEMENT FORM ============ */
export function NewAnnouncementForm() {
  const [form, setForm] = useState({ ann_type: '', title: '', description: '', price: '', address: '', phone: '', whatsapp: '', author_name: '' });
  const [galleryKeys, setGalleryKeys] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ann_type || !form.title || !form.description || !form.phone) return;
    if (submitted) return;
    setSubmitting(true);
    setSubmitted(true);
    try {
      await withRetry(() => client.entities.announcements.create({
        data: { ...form, active: true, status: 'pending', gallery_images: galleryKeys, created_at: new Date().toISOString() },
      }));
      setSuccess(true);
      const photoCount = galleryKeys ? galleryKeys.split(',').filter((k: string) => k.trim()).length : 0;
      client.apiCall.invoke({
        url: '/api/v1/telegram/notify/announcement',
        method: 'POST',
        data: {
          ann_type: form.ann_type,
          title: form.title,
          description: form.description,
          price: form.price,
          address: form.address,
          author_name: form.author_name,
          phone: form.phone,
          whatsapp: form.whatsapp,
          photo_count: photoCount,
        },
      }).catch((err: unknown) => console.warn('Telegram notification skipped:', err));
    } catch (e) {
      console.error(e);
      toast.error('Ошибка отправки. Попробуйте ещё раз.');
      setSubmitted(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) return (
    <Layout><div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4"><Clock className="w-8 h-8 text-amber-600" /></div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Ваше объявление отправлено на модерацию!</h2>
      <p className="text-gray-500 mb-6">Объявление будет опубликовано после проверки администратором.</p>
      <Link to="/announcements" className="text-blue-600 hover:text-blue-700 font-medium">Все объявления</Link>
    </div></Layout>
  );

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <Link to="/announcements" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> Назад</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Разместить объявление</h1>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Категория *</label>
            <select value={form.ann_type} onChange={e => setForm({ ...form, ann_type: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required>
              <option value="">Выберите категорию</option>
              {Object.entries(ANN_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Заголовок *</label>
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание *</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Цена</label>
              <input type="text" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Например: 50 000 ₸" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Адрес / район</label>
              <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <input type="tel" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ваше имя</label>
            <input type="text" value={form.author_name} onChange={e => setForm({ ...form, author_name: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Фотографии (до 5 штук)</label>
            <p className="text-xs text-gray-400 mb-1.5">Загрузите фото. Перетаскивайте для изменения порядка.</p>
            <MultiImageUpload value={galleryKeys} onChange={setGalleryKeys} folder="announcements" maxImages={5} />
          </div>
          <button type="submit" disabled={submitting || submitted} className="w-full bg-amber-500 text-white font-medium py-3 rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Отправка...
              </span>
            ) : 'Разместить объявление'}
          </button>
        </form>
      </div>
    </Layout>
  );
}

/* ============ ANNOUNCEMENT DETAIL ============ */
export function AnnouncementDetail() {
  const { id } = useParams();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithCache(`announcement_detail_${id}`, () => withRetry(() => client.entities.announcements.get({ id: id! })), 5 * 60 * 1000);
        setItem(res.data);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <Layout><div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">Загрузка...</div></Layout>;
  if (!item) return <Layout><div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">Объявление не найдено</div></Layout>;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/announcements" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ChevronLeft className="w-4 h-4" /> Все объявления
        </Link>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {item.image_url && (
            <StorageImg objectKey={item.image_url} alt={item.title} className="w-full h-64 object-cover" />
          )}
          <div className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                {ANN_TYPES[item.ann_type] || item.ann_type}
              </span>
              <span className="text-xs text-gray-400">{item.created_at ? formatDate(item.created_at) : ''}</span>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-3">{item.title}</h1>

            {item.price && (
              <p className="text-xl text-blue-600 font-bold mb-4">{item.price}</p>
            )}

            <div className="prose prose-gray max-w-none mb-6">
              {item.description.split('\n').map((p: string, i: number) => (
                <p key={i} className="text-gray-700 leading-relaxed mb-3">{p}</p>
              ))}
            </div>

            {item.gallery_images && (
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-500 mb-2">Фотографии:</p>
                <StorageGallery keys={item.gallery_images} />
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 space-y-2">
              {item.address && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400" /> {item.address}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4 text-gray-400" />
                <a href={`tel:${item.phone}`} className="text-blue-600 hover:text-blue-700 font-medium">{item.phone}</a>
              </div>
              {item.whatsapp && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MessageCircle className="w-4 h-4 text-green-500" />
                  <a href={`https://wa.me/${item.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 font-medium">
                    WhatsApp: {item.whatsapp}
                  </a>
                </div>
              )}
              {item.author_name && (
                <p className="text-sm text-gray-500">Автор: {item.author_name}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ============ JOBS LIST ============ */
export function JobsList() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => { loadJobs(); }, [categoryFilter]);

  async function loadJobs() {
    setLoading(true);
    try {
      const query: any = {};
      if (categoryFilter) query.category = categoryFilter;
      const res = await fetchWithCache(`jobs_list_${categoryFilter || 'all'}`, () => withRetry(() => client.entities.jobs.query({ query, sort: '-created_at', limit: 50 })), 5 * 60 * 1000);
      const VISIBLE_STATUSES = ['approved', 'published'];
      setJobs((res.data?.items || []).filter((j: any) => VISIBLE_STATUSES.includes(j.status)));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Работа / Вакансии</h1>
            <p className="text-gray-500 mt-1">Актуальные вакансии в районе Сортировка</p>
          </div>
          <Link to="/jobs/new" className="inline-flex items-center gap-2 bg-blue-600 text-white font-medium px-4 py-2.5 rounded-lg hover:bg-blue-700 text-sm">
            <Plus className="w-4 h-4" /> Разместить вакансию
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setCategoryFilter('')} className={`px-3 py-1.5 rounded-full text-sm font-medium ${!categoryFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Все</button>
          {JOB_CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategoryFilter(c === categoryFilter ? '' : c)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${categoryFilter === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{c}</button>
          ))}
        </div>

        {loading ? <div className="text-center py-12 text-gray-400">Загрузка...</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {jobs.length === 0 && <p className="text-gray-400 col-span-2 text-center py-12">Пока нет вакансий</p>}
            {jobs.map(job => (
              <div key={job.id} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-all">
                <div className="flex items-start gap-4">
                  {job.image_url ? (
                    <StorageImg objectKey={job.image_url} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-6 h-6 text-blue-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {job.category && <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{job.category}</span>}
                    </div>
                    <h3 className="font-semibold text-gray-900 text-lg">{job.job_title || job.category || 'Вакансия'}</h3>
                    {job.employer && <p className="text-sm text-gray-500">{job.employer}</p>}
                    {job.salary && <p className="text-blue-600 font-bold mt-1">{job.salary}</p>}
                    <p className="text-sm text-gray-600 mt-2 line-clamp-3">{job.description}</p>
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-400">
                      {job.schedule && <span>📅 {job.schedule}</span>}
                      {job.district && <span>📍 {job.district}</span>}
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                      <a href={`tel:${job.phone}`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"><Phone className="w-3.5 h-3.5" /> {job.phone}</a>
                      {job.whatsapp && <a href={`https://wa.me/${job.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-green-600 hover:text-green-700"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ============ NEW JOB FORM ============ */
export function NewJobForm() {
  const [form, setForm] = useState({
    job_title: '', employer: '', category: '', salary: '', schedule: '',
    district: '', description: '', phone: '', whatsapp: '',
  });
  const [imageKey, setImageKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.job_title || !form.description || !form.phone || !form.category) return;
    if (submitted) return;
    setSubmitting(true);
    setSubmitted(true);
    try {
      await withRetry(() => client.entities.jobs.create({
        data: {
          ...form,
          active: true,
          status: 'pending',
          image_url: imageKey,
          created_at: new Date().toISOString(),
        },
      }));
      setSuccess(true);
      client.apiCall.invoke({
        url: '/api/v1/telegram/notify/job',
        method: 'POST',
        data: {
          job_title: form.job_title,
          employer: form.employer,
          category: form.category,
          salary: form.salary,
          schedule: form.schedule,
          district: form.district,
          phone: form.phone,
          whatsapp: form.whatsapp,
          description: form.description,
          has_image: !!imageKey,
        },
      }).catch((err: unknown) => console.warn('Telegram notification skipped:', err));
    } catch (e) {
      console.error(e);
      toast.error('Ошибка отправки. Попробуйте ещё раз.');
      setSubmitted(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) return (
    <Layout><div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"><Clock className="w-8 h-8 text-blue-600" /></div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Ваша вакансия отправлена на модерацию!</h2>
      <p className="text-gray-500 mb-6">Вакансия будет опубликована после проверки администратором.</p>
      <Link to="/jobs" className="text-blue-600 hover:text-blue-700 font-medium">Все вакансии</Link>
    </div></Layout>
  );

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <Link to="/jobs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> Назад</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Разместить вакансию</h1>
        <p className="text-gray-500 mb-6">Заполните форму — вакансия появится на сайте после модерации</p>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название вакансии *</label>
            <input type="text" value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Например: Продавец-консультант" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Работодатель / организация</label>
            <input type="text" value={form.employer} onChange={e => setForm({ ...form, employer: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Название компании или ваше имя" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Категория вакансии *</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required>
              <option value="">Выберите категорию</option>
              {JOB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Зарплата</label>
              <input type="text" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="от 150 000 ₸" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">График работы</label>
              <input type="text" value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="5/2, сменный..." />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Адрес / район</label>
            <input type="text" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Район Сортировка, ул. ..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание вакансии *</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Обязанности, требования, условия..." required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <input type="tel" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Фото / логотип</label>
            <ImageUpload value={imageKey} onChange={setImageKey} folder="jobs" compact />
          </div>
          <button type="submit" disabled={submitting || submitted} className="w-full bg-blue-600 text-white font-medium py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Отправка...
              </span>
            ) : 'Разместить вакансию'}
          </button>
        </form>
      </div>
    </Layout>
  );
}

/* ============ QUESTIONS LIST ============ */
export function QuestionsList() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithCache('questions_list', () => withRetry(() => client.entities.questions.query({ sort: '-created_at', limit: 50 })), 5 * 60 * 1000);
        setQuestions(res.data?.items || []);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, []);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Вопросы жителей</h1>
            <p className="text-gray-500 mt-1">Спрашивайте и отвечайте — помогайте соседям</p>
          </div>
          <Link to="/questions/new" className="inline-flex items-center gap-2 bg-purple-600 text-white font-medium px-4 py-2.5 rounded-lg hover:bg-purple-700 text-sm">
            <HelpCircle className="w-4 h-4" /> Задать вопрос
          </Link>
        </div>
        {loading ? <div className="text-center py-12 text-gray-400">Загрузка...</div> : (
          <div className="space-y-3">
            {questions.map(q => (
              <Link key={q.id} to={`/questions/${q.id}`} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-all flex items-center justify-between block">
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-5 h-5 text-purple-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-gray-900">{q.question_text}</h3>
                    <p className="text-xs text-gray-400 mt-1">{q.author_name && `${q.author_name} • `}{timeAgo(q.created_at)}</p>
                  </div>
                </div>
                <span className="text-sm text-gray-400 whitespace-nowrap ml-4">{q.answers_count || 0} ответов</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ============ QUESTION DETAIL ============ */
export function QuestionDetail() {
  const { id } = useParams();
  const [question, setQuestion] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [answerText, setAnswerText] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const results = await Promise.allSettled([
        fetchWithCache(`question_detail_${id}`, () => withRetry(() => client.entities.questions.get({ id: id! })), 5 * 60 * 1000),
        fetchWithCache(`question_answers_${id}`, () => withRetry(() => client.entities.question_answers.query({ query: { question_id: Number(id) }, sort: 'created_at', limit: 50 })), 3 * 60 * 1000),
      ]);
      if (results[0].status === 'fulfilled') setQuestion(results[0].value.data);
      if (results[1].status === 'fulfilled') setAnswers(results[1].value.data?.items || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answerText.trim()) return;
    setSubmitting(true);
    try {
      await withRetry(() => client.entities.question_answers.create({
        data: { question_id: Number(id), answer_text: answerText, author_name: authorName || 'Аноним', created_at: new Date().toISOString() }
      }));
      setAnswerText('');
      setAuthorName('');
      loadData();
    } catch (e) { console.error(e); } finally { setSubmitting(false); }
  }

  if (loading) return <Layout><div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">Загрузка...</div></Layout>;
  if (!question) return <Layout><div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">Вопрос не найден</div></Layout>;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/questions" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> Все вопросы</Link>
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h1 className="text-xl font-bold text-gray-900">{question.question_text}</h1>
          <p className="text-sm text-gray-400 mt-2">{question.author_name && `${question.author_name} • `}{formatDate(question.created_at)}</p>
        </div>

        <h3 className="font-semibold text-gray-900 mb-3">Ответы ({answers.length})</h3>
        <div className="space-y-3 mb-6">
          {answers.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Пока нет ответов. Будьте первым!</div>
          ) : answers.map(a => (
            <div key={a.id} className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-gray-700">{a.answer_text}</p>
              <p className="text-xs text-gray-400 mt-2">— {a.author_name} • {timeAgo(a.created_at)}</p>
            </div>
          ))}
        </div>

        <form onSubmit={submitAnswer} className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Ваш ответ</h3>
          <textarea value={answerText} onChange={e => setAnswerText(e.target.value)} rows={3} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none mb-3" placeholder="Напишите ваш ответ..." required />
          <input type="text" value={authorName} onChange={e => setAuthorName(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-3" placeholder="Ваше имя (необязательно)" />
          <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 bg-purple-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50">
            <Send className="w-4 h-4" /> {submitting ? 'Отправка...' : 'Ответить'}
          </button>
        </form>
      </div>
    </Layout>
  );
}

/* ============ NEW QUESTION FORM ============ */
export function NewQuestionForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ question_text: '', author_name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.question_text.trim()) return;
    setSubmitting(true);
    try {
      await withRetry(() => client.entities.questions.create({
        data: { ...form, author_name: form.author_name || 'Аноним', answers_count: 0, created_at: new Date().toISOString() }
      }));
      setSuccess(true);
    } catch (e) { console.error(e); toast.error('Ошибка'); } finally { setSubmitting(false); }
  }

  if (success) return (
    <Layout><div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-green-600" /></div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Вопрос опубликован!</h2>
      <Link to="/questions" className="text-blue-600 hover:text-blue-700 font-medium">Все вопросы</Link>
    </div></Layout>
  );

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <Link to="/questions" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> Назад</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Задать вопрос</h1>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ваш вопрос *</label>
            <textarea value={form.question_text} onChange={e => setForm({ ...form, question_text: e.target.value })} rows={4} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" placeholder="Задайте вопрос жителям района..." required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ваше имя</label>
            <input type="text" value={form.author_name} onChange={e => setForm({ ...form, author_name: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Необязательно" />
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-purple-600 text-white font-medium py-3 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50">
            {submitting ? 'Отправка...' : 'Опубликовать вопрос'}
          </button>
        </form>
      </div>
    </Layout>
  );
}

/* ============ REAL ESTATE LIST (Modern Premium Design) ============ */
const RE_HERO_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-22/239eba9e-e793-4adc-a70a-f2cad35db132.png';
const RE_FALLBACK_IMAGES = [
  'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-22/c83eeaff-9091-405e-9032-5908700e9593.png',
  'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-22/6f4290d1-fefd-4261-982d-94ebf83e72a4.png',
  'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-22/082ab9a3-356f-48e7-92b4-61c3affe5cd6.png',
];

const RE_QUICK_FILTERS = [
  { key: '', label: 'Все', icon: '🏠' },
  { key: 'sell_apartment', label: 'Квартиры', icon: '🏢' },
  { key: 'sell_house', label: 'Дома', icon: '🏡' },
  { key: 'rent_apartment', label: 'Аренда', icon: '🔑' },
  { key: 'commercial', label: 'Коммерция', icon: '🏪' },
];

const RE_DEAL_TYPES = [
  { key: '', label: 'Все сделки' },
  { key: 'sell', label: 'Продажа' },
  { key: 'rent', label: 'Аренда' },
  { key: 'need', label: 'Ищу' },
];

const RE_ROOM_OPTIONS = ['', '1', '2', '3', '4+'];

export function RealEstateList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [dealFilter, setDealFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('re_favorites') || '[]'); } catch { return []; }
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetchWithCache('real_estate_list', () => withRetry(() => client.entities.real_estate.query({ sort: '-created_at', limit: 100 })), 5 * 60 * 1000);
      const VISIBLE_STATUSES = ['approved', 'published'];
      setItems((res.data?.items || []).filter((a: any) => VISIBLE_STATUSES.includes(a.status)));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  function toggleFavorite(e: React.MouseEvent, id: number) {
    e.preventDefault();
    e.stopPropagation();
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      localStorage.setItem('re_favorites', JSON.stringify(next));
      return next;
    });
  }

  const filteredItems = items.filter(item => {
    if (typeFilter && item.re_type !== typeFilter) return false;
    if (dealFilter === 'sell' && !item.re_type?.startsWith('sell')) return false;
    if (dealFilter === 'rent' && !item.re_type?.startsWith('rent')) return false;
    if (dealFilter === 'need' && !item.re_type?.startsWith('need')) return false;
    if (roomFilter) {
      if (roomFilter === '4+') { if (parseInt(item.rooms) < 4) return false; }
      else if (item.rooms !== roomFilter) return false;
    }
    if (priceFrom) {
      const p = parseInt((item.price || '').replace(/\D/g, ''));
      if (!p || p < parseInt(priceFrom)) return false;
    }
    if (priceTo) {
      const p = parseInt((item.price || '').replace(/\D/g, ''));
      if (!p || p > parseInt(priceTo)) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!(item.title || '').toLowerCase().includes(q) && !(item.address || '').toLowerCase().includes(q) && !(item.description || '').toLowerCase().includes(q)) return false;
    }
    if (showFavoritesOnly && !favorites.includes(item.id)) return false;
    return true;
  });

  function getFallbackImg(id: number) { return RE_FALLBACK_IMAGES[id % RE_FALLBACK_IMAGES.length]; }

  function getImageSrc(item: any) {
    if (item.gallery_images) {
      const keys = item.gallery_images.split(',').filter((k: string) => k.trim());
      if (keys.length > 0) return null; // will use StorageImage
    }
    if (item.image_url) return null; // will use StorageImage
    return getFallbackImg(item.id);
  }

  const activeFilterCount = [typeFilter, dealFilter, roomFilter, priceFrom, priceTo].filter(Boolean).length;

  return (
    <Layout>
      <div className="bg-[#f8f9fa] min-h-screen">
        {/* ═══ HERO ═══ */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img src={RE_HERO_IMG} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/80 via-emerald-800/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          </div>
          <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-20">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">🏠 Недвижимость</span>
              </div>
              <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
                Квартиры, дома и аренда
              </h1>
              <p className="text-white/70 text-base md:text-lg mt-3">
                Найдите идеальное жильё в вашем районе
              </p>
            </div>
          </div>
        </section>

        {/* ═══ SEARCH BAR ═══ */}
        <div className="max-w-7xl mx-auto px-4 -mt-7 relative z-10">
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 p-4 md:p-5">
            <div className="flex gap-3 items-center">
              <div className="relative flex-1">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Поиск по району, улице, описанию..."
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 rounded-xl border-0 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-shadow"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300">
                    <span className="text-xs text-gray-600">✕</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-2 border-transparent'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                Фильтры
                {activeFilterCount > 0 && (
                  <span className="w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{activeFilterCount}</span>
                )}
              </button>
              <Link
                to="/real-estate/new"
                className="hidden sm:flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-200/50"
              >
                <Home className="w-4 h-4" /> Разместить
              </Link>
            </div>

            {/* Expanded filters */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in slide-in-from-top-2 duration-200">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Тип сделки</label>
                  <select value={dealFilter} onChange={e => setDealFilter(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border-0 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                    {RE_DEAL_TYPES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Комнат</label>
                  <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border-0 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                    <option value="">Любое</option>
                    {RE_ROOM_OPTIONS.filter(Boolean).map(r => <option key={r} value={r}>{r} {r === '4+' ? 'и более' : 'комн.'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Цена от (₸)</label>
                  <input type="number" value={priceFrom} onChange={e => setPriceFrom(e.target.value)} placeholder="0" className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border-0 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Цена до (₸)</label>
                  <input type="number" value={priceTo} onChange={e => setPriceTo(e.target.value)} placeholder="∞" className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border-0 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setDealFilter(''); setRoomFilter(''); setPriceFrom(''); setPriceTo(''); setTypeFilter(''); }}
                    className="col-span-2 sm:col-span-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium py-1"
                  >
                    ✕ Сбросить все фильтры
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 pt-6 pb-24">
          {/* ═══ QUICK FILTERS ═══ */}
          <div className="flex gap-2.5 overflow-x-auto pb-4 mb-2 scrollbar-hide -mx-4 px-4">
            {RE_QUICK_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setTypeFilter(f.key === typeFilter ? '' : f.key)}
                className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                  typeFilter === f.key
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200/40 scale-105'
                    : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                showFavoritesOnly
                  ? 'bg-red-500 text-white shadow-lg shadow-red-200/40 scale-105'
                  : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
              }`}
            >
              ❤️ Избранное {favorites.length > 0 && `(${favorites.length})`}
            </button>
          </div>

          {/* Mobile add button */}
          <Link
            to="/real-estate/new"
            className="sm:hidden flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white w-full py-3 rounded-xl text-sm font-semibold mb-5 shadow-md shadow-emerald-200/50"
          >
            <Home className="w-4 h-4" /> Разместить объявление
          </Link>

          {/* ═══ RESULTS HEADER ═══ */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">
                {showFavoritesOnly ? 'Избранное' : typeFilter ? (REAL_ESTATE_TYPES[typeFilter] || 'Результаты') : 'Все объявления'}
              </h2>
              <span className="text-sm text-gray-400">{filteredItems.length} объявлений</span>
            </div>
          </div>

          {/* ═══ LISTINGS GRID ═══ */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="relative w-14 h-14 mx-auto mb-3">
                  <div className="absolute inset-0 border-4 border-emerald-100 rounded-full" />
                  <div className="absolute inset-0 border-4 border-transparent border-t-emerald-500 rounded-full animate-spin" />
                  <Home className="absolute inset-0 m-auto w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-gray-500 font-medium text-sm">Загружаем объявления...</p>
              </div>
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredItems.map(item => {
                const isFav = favorites.includes(item.id);
                const fallbackSrc = getFallbackImg(item.id);
                const hasStorageImg = item.image_url || item.gallery_images;
                const firstGalleryKey = item.gallery_images ? item.gallery_images.split(',')[0]?.trim() : '';
                const imgKey = firstGalleryKey || item.image_url || '';
                const isSale = item.re_type?.startsWith('sell');
                const isRent = item.re_type?.startsWith('rent');

                return (
                  <Link
                    key={item.id}
                    to={`/real-estate/${item.id}`}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group block"
                  >
                    <div className="h-52 bg-gray-100 relative overflow-hidden">
                      {hasStorageImg ? (
                        <StorageImg objectKey={imgKey} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        <img src={fallbackSrc} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

                      {/* Badges */}
                      <div className="absolute top-3 left-3 flex gap-1.5">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg ${
                          isSale ? 'bg-emerald-500 text-white' : isRent ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
                        }`}>
                          {REAL_ESTATE_TYPES[item.re_type] || item.re_type}
                        </span>
                      </div>

                      {/* Favorite button */}
                      <button
                        onClick={e => toggleFavorite(e, item.id)}
                        className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-lg ${
                          isFav ? 'bg-red-500 text-white scale-110' : 'bg-white/90 backdrop-blur-sm text-gray-400 hover:text-red-500 hover:bg-white'
                        }`}
                      >
                        <svg className="w-4.5 h-4.5" fill={isFav ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      </button>

                      {/* Photo count */}
                      {item.gallery_images && (
                        <span className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                          📷 {item.gallery_images.split(',').filter((k: string) => k.trim()).length} фото
                        </span>
                      )}

                      {/* Price overlay */}
                      {item.price && (
                        <div className="absolute bottom-3 left-3">
                          <span className="bg-white/95 backdrop-blur-sm text-gray-900 font-extrabold text-base px-3 py-1.5 rounded-xl shadow-lg">
                            {item.price}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 text-[15px] leading-tight line-clamp-1 group-hover:text-emerald-700 transition-colors">
                        {item.title}
                      </h3>

                      {item.address && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{item.address}</span>
                        </div>
                      )}

                      {/* Characteristics chips */}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {item.rooms && (
                          <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-lg">
                            {item.rooms} комн.
                          </span>
                        )}
                        {item.area && (
                          <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-lg">
                            {item.area} м²
                          </span>
                        )}
                        {item.floor_info && (
                          <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-lg">
                            {item.floor_info} этаж
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-400 mt-2.5 line-clamp-2 leading-relaxed">{item.description}</p>

                      {/* Contact bar */}
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                        <a
                          href={`tel:${item.phone}`}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" /> Позвонить
                        </a>
                        {item.whatsapp && (
                          <a
                            href={`https://wa.me/${item.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-100 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                          </a>
                        )}
                        <span className="text-[10px] text-gray-300 ml-auto">{timeAgo(item.created_at)}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Home className="w-8 h-8 text-emerald-300" />
              </div>
              <p className="text-gray-500 font-medium">
                {showFavoritesOnly ? 'Нет избранных объявлений' : 'Объявлений не найдено'}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {showFavoritesOnly ? 'Нажмите ❤️ на карточке, чтобы добавить в избранное' : 'Попробуйте изменить параметры поиска'}
              </p>
              {(activeFilterCount > 0 || searchQuery) && (
                <button
                  onClick={() => { setTypeFilter(''); setDealFilter(''); setRoomFilter(''); setPriceFrom(''); setPriceTo(''); setSearchQuery(''); setShowFavoritesOnly(false); }}
                  className="mt-4 text-sm text-emerald-600 hover:text-emerald-700 font-semibold"
                >
                  Сбросить все фильтры
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

/* ============ REAL ESTATE DETAIL (Modern Premium Design) ============ */
export function RealEstateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithCache(`real_estate_detail_${id}`, () => withRetry(() => client.entities.real_estate.get({ id: id! })), 5 * 60 * 1000);
        setItem(res.data);
        const favs = JSON.parse(localStorage.getItem('re_favorites') || '[]');
        setIsFav(favs.includes(res.data?.id));
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, [id]);

  function toggleFav() {
    if (!item) return;
    const favs: number[] = JSON.parse(localStorage.getItem('re_favorites') || '[]');
    const next = favs.includes(item.id) ? favs.filter((f: number) => f !== item.id) : [...favs, item.id];
    localStorage.setItem('re_favorites', JSON.stringify(next));
    setIsFav(!isFav);
  }

  function getGalleryKeys(): string[] {
    if (!item) return [];
    const keys: string[] = [];
    if (item.image_url) keys.push(item.image_url);
    if (item.gallery_images) {
      item.gallery_images.split(',').forEach((k: string) => {
        const trimmed = k.trim();
        if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
      });
    }
    return keys;
  }

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center min-h-[60vh] bg-[#f8f9fa]">
        <div className="text-center">
          <div className="relative w-14 h-14 mx-auto mb-3">
            <div className="absolute inset-0 border-4 border-emerald-100 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-emerald-500 rounded-full animate-spin" />
          </div>
          <p className="text-gray-500 text-sm">Загрузка...</p>
        </div>
      </div>
    </Layout>
  );

  if (!item) return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Home className="w-8 h-8 text-gray-300" />
        </div>
        <p className="text-gray-500 font-medium">Объявление не найдено</p>
        <Link to="/real-estate" className="text-emerald-600 hover:text-emerald-700 font-medium text-sm mt-3 inline-block">← Все объявления</Link>
      </div>
    </Layout>
  );

  const galleryKeys = getGalleryKeys();
  const isSale = item.re_type?.startsWith('sell');
  const isRent = item.re_type?.startsWith('rent');
  const fallbackSrc = RE_FALLBACK_IMAGES[(item.id || 0) % RE_FALLBACK_IMAGES.length];

  return (
    <Layout>
      <div className="bg-[#f8f9fa] min-h-screen pb-28">
        {/* Back nav */}
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-2">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
            <ChevronLeft className="w-4 h-4" /> Назад
          </button>
        </div>

        {/* ═══ PHOTO GALLERY ═══ */}
        <div className="max-w-4xl mx-auto px-4 mb-6">
          <div className="relative rounded-2xl overflow-hidden bg-gray-100 shadow-lg">
            <div className="aspect-[16/9] md:aspect-[16/8]">
              {galleryKeys.length > 0 ? (
                <StorageImage
                  objectKey={galleryKeys[activePhotoIdx] || galleryKeys[0]}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <img src={fallbackSrc} alt={item.title} className="w-full h-full object-cover" />
              )}
            </div>

            {/* Photo counter */}
            {galleryKeys.length > 1 && (
              <span className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
                📷 {activePhotoIdx + 1} / {galleryKeys.length}
              </span>
            )}

            {/* Favorite */}
            <button
              onClick={toggleFav}
              className={`absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${
                isFav ? 'bg-red-500 text-white' : 'bg-white/90 backdrop-blur-sm text-gray-400 hover:text-red-500'
              }`}
            >
              <svg className="w-5 h-5" fill={isFav ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>

            {/* Nav arrows */}
            {galleryKeys.length > 1 && (
              <>
                <button
                  onClick={() => setActivePhotoIdx(i => (i - 1 + galleryKeys.length) % galleryKeys.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-700" />
                </button>
                <button
                  onClick={() => setActivePhotoIdx(i => (i + 1) % galleryKeys.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-700 rotate-180" />
                </button>
              </>
            )}

            {/* Badge */}
            <div className="absolute bottom-4 left-4">
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full shadow-lg ${
                isSale ? 'bg-emerald-500 text-white' : isRent ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
              }`}>
                {REAL_ESTATE_TYPES[item.re_type] || item.re_type}
              </span>
            </div>
          </div>

          {/* Thumbnail strip */}
          {galleryKeys.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide pb-1">
              {galleryKeys.map((key, idx) => (
                <button
                  key={idx}
                  onClick={() => setActivePhotoIdx(idx)}
                  className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden transition-all ${
                    idx === activePhotoIdx ? 'ring-2 ring-emerald-500 ring-offset-2 scale-105' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <StorageImg objectKey={key} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ═══ CONTENT ═══ */}
        <div className="max-w-4xl mx-auto px-4 space-y-5">
          {/* Price & Title */}
          <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
            {item.price && (
              <p className="text-2xl md:text-3xl font-extrabold text-emerald-600 mb-2">{item.price}</p>
            )}
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight">{item.title}</h1>
            {item.address && (
              <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span>{item.address}</span>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">{item.created_at ? formatDate(item.created_at) : ''}</p>
          </div>

          {/* Characteristics */}
          {(item.rooms || item.area || item.floor_info) && (
            <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
              <h2 className="font-bold text-gray-900 mb-4">Характеристики</h2>
              <div className="grid grid-cols-3 gap-4">
                {item.rooms && (
                  <div className="text-center bg-gray-50 rounded-xl p-4">
                    <div className="text-2xl mb-1">🛏</div>
                    <p className="text-lg font-bold text-gray-900">{item.rooms}</p>
                    <p className="text-xs text-gray-400">Комнат</p>
                  </div>
                )}
                {item.area && (
                  <div className="text-center bg-gray-50 rounded-xl p-4">
                    <div className="text-2xl mb-1">📐</div>
                    <p className="text-lg font-bold text-gray-900">{item.area} м²</p>
                    <p className="text-xs text-gray-400">Площадь</p>
                  </div>
                )}
                {item.floor_info && (
                  <div className="text-center bg-gray-50 rounded-xl p-4">
                    <div className="text-2xl mb-1">🏢</div>
                    <p className="text-lg font-bold text-gray-900">{item.floor_info}</p>
                    <p className="text-xs text-gray-400">Этаж</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
            <h2 className="font-bold text-gray-900 mb-3">Описание</h2>
            <div className="prose prose-gray max-w-none">
              {(item.description || 'Описание не указано').split('\n').map((p: string, i: number) => (
                <p key={i} className="text-gray-600 leading-relaxed mb-3 text-sm">{p}</p>
              ))}
            </div>
          </div>

          {/* Author */}
          {item.author_name && (
            <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
              <h2 className="font-bold text-gray-900 mb-3">Контактное лицо</h2>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                  <span className="text-lg font-bold text-emerald-600">{item.author_name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{item.author_name}</p>
                  <p className="text-xs text-gray-400">Автор объявления</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══ FIXED BOTTOM CONTACT BAR ═══ */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 z-40 safe-area-bottom">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            {item.price && (
              <div className="hidden sm:block mr-auto">
                <p className="text-xs text-gray-400">Цена</p>
                <p className="text-lg font-extrabold text-emerald-600">{item.price}</p>
              </div>
            )}
            <a
              href={`tel:${item.phone}`}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-200/50 active:scale-[0.98]"
            >
              <Phone className="w-4 h-4" /> Позвонить
            </a>
            {item.whatsapp && (
              <a
                href={`https://wa.me/${item.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-green-200/50 active:scale-[0.98]"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            )}
            {item.telegram && (
              <a
                href={`https://t.me/${item.telegram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-200/50 active:scale-[0.98]"
              >
                <Send className="w-4 h-4" /> Telegram
              </a>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ============ NEW REAL ESTATE FORM ============ */
export function NewRealEstateForm() {
  const [form, setForm] = useState({
    re_type: '', title: '', description: '', price: '', rooms: '', area: '',
    floor_info: '', address: '', phone: '', whatsapp: '', telegram: '', author_name: ''
  });
  const [galleryKeys, setGalleryKeys] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.re_type || !form.title || !form.description || !form.phone) return;
    if (submitted) return;
    setSubmitting(true);
    setSubmitted(true);
    try {
      await withRetry(() => client.entities.real_estate.create({
        data: { ...form, active: true, status: 'pending', gallery_images: galleryKeys, created_at: new Date().toISOString() },
      }));
      setSuccess(true);
    } catch (e) {
      console.error(e);
      toast.error('Ошибка отправки. Попробуйте ещё раз.');
      setSubmitted(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) return (
    <Layout><div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><Clock className="w-8 h-8 text-emerald-600" /></div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Объявление отправлено на модерацию!</h2>
      <p className="text-gray-500 mb-6">Оно будет опубликовано после проверки администратором.</p>
      <Link to="/real-estate" className="text-blue-600 hover:text-blue-700 font-medium">Вся недвижимость</Link>
    </div></Layout>
  );

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <Link to="/real-estate" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> Назад</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Разместить объявление о недвижимости</h1>
        <p className="text-gray-500 mb-6">Заполните форму — объявление появится после модерации</p>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Тип объявления *</label>
            <select value={form.re_type} onChange={e => setForm({ ...form, re_type: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" required>
              <option value="">Выберите тип</option>
              {Object.entries(REAL_ESTATE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Заголовок *</label>
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Например: 2-комн. квартира, 55 м²" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание *</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Цена</label>
              <input type="text" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="15 000 000 ₸" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Комнат</label>
              <input type="text" value={form.rooms} onChange={e => setForm({ ...form, rooms: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Площадь (м²)</label>
              <input type="text" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="55" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Этаж</label>
              <input type="text" value={form.floor_info} onChange={e => setForm({ ...form, floor_info: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="3/9" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
              <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="ул. Ленина 5" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <input type="tel" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telegram</label>
              <input type="text" value={form.telegram} onChange={e => setForm({ ...form, telegram: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="@username" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ваше имя</label>
            <input type="text" value={form.author_name} onChange={e => setForm({ ...form, author_name: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Фотографии (до 10 штук)</label>
            <MultiImageUpload value={galleryKeys} onChange={setGalleryKeys} folder="real-estate" maxImages={10} />
          </div>
          <button type="submit" disabled={submitting || submitted} className="w-full bg-emerald-600 text-white font-medium py-3 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Отправка...
              </span>
            ) : 'Разместить объявление'}
          </button>
        </form>
      </div>
    </Layout>
  );
}

/* ============ DIRECTORY ============ */
export function DirectoryPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');

  useEffect(() => { loadData(); }, [category]);

  async function loadData() {
    setLoading(true);
    try {
      const query: any = {};
      if (category) query.category = category;
      const res = await fetchWithCache(`directory_entries_${category || 'all'}`, () => withRetry(() => client.entities.directory_entries.query({ query, sort: 'category', limit: 50 })), 10 * 60 * 1000);
      setEntries(res.data?.items || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  const grouped = entries.reduce((acc: Record<string, any[]>, e) => {
    if (!acc[e.category]) acc[e.category] = [];
    acc[e.category].push(e);
    return acc;
  }, {});

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Полезный справочник</h1>
        <p className="text-gray-500 mb-6">Важные телефоны и организации района</p>

        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setCategory('')} className={`px-3 py-1.5 rounded-full text-sm font-medium ${!category ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Все</button>
          {DIRECTORY_CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c === category ? '' : c)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${category === c ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{c}</button>
          ))}
        </div>

        {/* Inspector quick link */}
        <Link to="/inspectors" className="block bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 mb-8 hover:shadow-lg transition-all hover:-translate-y-0.5 group">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/15 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-white/25 transition-colors">
              <BadgeCheck className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-bold text-lg">Участковые инспекторы</h3>
              <p className="text-white/60 text-sm">Найдите участкового по вашей улице</p>
            </div>
            <ChevronLeft className="w-5 h-5 text-white/40 rotate-180 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {loading ? <div className="text-center py-12 text-gray-400">Загрузка...</div> : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-green-600" /> {cat}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((d: any) => (
                    <div key={d.id} className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-all">
                      <h3 className="font-semibold text-gray-900">{d.entry_name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{d.description}</p>
                      {d.address && <div className="flex items-center gap-1 mt-2 text-xs text-gray-400"><MapPin className="w-3.5 h-3.5" /> {d.address}</div>}
                      <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1 mt-2 text-blue-600 font-bold hover:text-blue-700">
                        <Phone className="w-4 h-4" /> {d.phone}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}