import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import ImageUpload from '@/components/ImageUpload';
import MultiImageUpload from '@/components/MultiImageUpload';
import { client, withRetry, MASTER_CATEGORIES, CATEGORY_ICONS } from '@/lib/api';
import { getAccountPrefill } from '@/lib/localAuth';
import { invalidateEntityCache } from '@/lib/cache';
import { ChevronLeft, CheckCircle, User, FileText, Camera, ChevronRight, Sparkles } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const STEPS = ['contact', 'about', 'photos'] as const;

export default function BecomeMasterWizard() {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    category: '',
    phone: '',
    whatsapp: '',
    district: '',
    description: '',
    photo_url: '',
    gallery_images: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const prefill = getAccountPrefill();
    setForm((f) => ({
      ...f,
      name: f.name || prefill.name,
      phone: f.phone || prefill.phone,
      whatsapp: f.whatsapp || prefill.phone,
      district: f.district || t('masters.defaultDistrict'),
    }));
  }, [t]);

  const inputClass =
    'w-full px-5 py-4 border border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base transition-all duration-200';

  const canNext = () => {
    if (step === 0) return form.name.trim() && form.category && form.phone.trim();
    if (step === 1) return form.description.trim().length >= 20;
    return true;
  };

  const handleSubmit = async () => {
    if (!form.name || !form.category || !form.phone) return;
    setSubmitting(true);
    setError('');
    try {
      await withRetry(() =>
        client.entities.become_master_requests.create({
          data: {
            ...form,
            whatsapp: form.whatsapp || form.phone,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        }),
      );
      setSuccess(true);
      invalidateEntityCache('become_master_requests');
    } catch (e: any) {
      console.error(e);
      setError(String(e?.message || t('masters.becomeError')));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-24 text-center">
          <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-3">{t('masters.requestSuccess')}</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4 text-base">{t('masters.becomeSuccessDesc')}</p>
          <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-8 font-medium">{t('masters.becomeSuccessHint')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/cabinet" className="inline-flex items-center justify-center bg-indigo-600 text-white font-bold px-6 py-3 rounded-2xl hover:bg-indigo-700">
              {t('masters.goToCabinet')}
            </Link>
            <Link to="/masters" className="inline-flex items-center justify-center text-indigo-600 font-bold px-6 py-3">
              {t('masters.backToCatalog')}
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const stepIcons = [User, FileText, Camera];
  const stepLabels = [t('masters.stepContact'), t('masters.stepAbout'), t('masters.stepPhotos')];

  return (
    <Layout>
      <div className="bg-gradient-to-b from-indigo-50 to-gray-50 dark:from-gray-950 dark:to-gray-950 min-h-screen">
        <div className="max-w-xl mx-auto px-4 py-10">
          <Link to="/masters" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white mb-6 font-medium">
            <ChevronLeft className="w-4 h-4" /> {t('masters.backToCatalog')}
          </Link>

          {/* Header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
              <Sparkles className="w-4 h-4" /> {t('masters.becomeMaster')}
            </div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">{t('masters.becomeTitle')}</h1>
            <p className="text-gray-500 dark:text-gray-400">{t('masters.becomeSubtitle')}</p>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((_, i) => {
              const Icon = stepIcons[i];
              const active = i === step;
              const done = i < step;
              return (
                <div key={STEPS[i]} className="flex items-center flex-1 gap-2">
                  <div
                    className={`flex items-center gap-2 flex-1 rounded-2xl px-3 py-2.5 transition-all ${
                      active
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40'
                        : done
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-white dark:bg-gray-900 text-gray-400 border border-gray-100 dark:border-gray-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-bold truncate hidden sm:inline">{stepLabels[i]}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`h-0.5 w-2 flex-shrink-0 ${done ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                </div>
              );
            })}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-6 md:p-8">
            {step === 0 && (
              <div className="space-y-5 animate-in fade-in duration-300">
                <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1">{t('masters.stepContactDesc')}</p>
                <Field label={t('masters.fieldName')} required>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Иван Иванов" required />
                </Field>
                <Field label={t('masters.fieldCategory')} required>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputClass} required>
                    <option value="">{t('masters.selectCategory')}</option>
                    {MASTER_CATEGORIES.map(c => (
                      <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('masters.fieldPhone')} required hint={t('masters.phoneHint')}>
                  <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="+7 700 123 45 67" required />
                </Field>
                <Field label="WhatsApp" hint={t('masters.whatsappHint')}>
                  <input type="tel" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} className={inputClass} placeholder={t('masters.whatsappPlaceholder')} />
                </Field>
                <Field label={t('masters.fieldDistrict')}>
                  <input type="text" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} className={inputClass} />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5 animate-in fade-in duration-300">
                <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1">{t('masters.stepAboutDesc')}</p>
                <Field label={t('masters.fieldAbout')} required hint={t('masters.aboutHint')}>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={6}
                    className={`${inputClass} resize-none`}
                    placeholder={t('masters.aboutPlaceholder')}
                    required
                  />
                </Field>
                <p className="text-xs text-gray-400">{form.description.length}/20 {t('masters.charsMin')}</p>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1">{t('masters.stepPhotosDesc')}</p>
                <Field label={t('masters.fieldPhoto')} hint={t('masters.photoHint')}>
                  <ImageUpload value={form.photo_url} onChange={key => setForm({ ...form, photo_url: key })} folder="masters" />
                </Field>
                <Field label={t('masters.fieldGallery')} hint={t('masters.galleryHint')}>
                  <MultiImageUpload
                    value={form.gallery_images}
                    onChange={keys => setForm({ ...form, gallery_images: keys })}
                    folder="masters-gallery"
                    maxImages={10}
                  />
                </Field>
                {!form.photo_url && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3">
                    {t('masters.photoRecommended')}
                  </p>
                )}
              </div>
            )}

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
              {step > 0 ? (
                <button type="button" onClick={() => setStep(s => s - 1)} className="flex-1 py-3.5 rounded-2xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  {t('masters.back')}
                </button>
              ) : (
                <div className="flex-1" />
              )}
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  disabled={!canNext()}
                  onClick={() => setStep(s => s + 1)}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  {t('masters.next')} <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 shadow-lg transition-all"
                >
                  {submitting ? t('masters.submitting') : t('masters.submitApplication')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
        {label}{required ? ' *' : ''}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      {children}
    </div>
  );
}
