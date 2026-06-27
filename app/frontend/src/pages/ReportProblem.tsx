import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Bug, CheckCircle2, ChevronLeft, Send } from 'lucide-react';
import { toast } from 'sonner';

import Layout from '@/components/Layout';
import ImageUpload from '@/components/ImageUpload';
import { useLanguage } from '@/contexts/LanguageContext';
import { submitIssueReport } from '@/lib/feedbackApi';
import { getAccountPrefill } from '@/lib/localAuth';
import { resolveImageUrl } from '@/lib/storage';

const SECTION_KEYS = [
  'report.sectionGeneral',
  'report.sectionFood',
  'report.sectionGastronom',
  'report.sectionVolna',
  'report.sectionPharmacy',
  'report.sectionMasters',
  'report.sectionTaxi',
  'report.sectionTransport',
  'report.sectionCabinet',
  'report.sectionOther',
] as const;

export default function ReportProblem() {
  const { t } = useLanguage();
  const location = useLocation();
  const [form, setForm] = useState({
    section: '',
    description: '',
    contact_name: '',
    contact_phone: '',
  });
  const [screenshotKey, setScreenshotKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const prefill = getAccountPrefill();
    if (prefill.name || prefill.phone) {
      setForm((f) => ({
        ...f,
        contact_name: f.contact_name || prefill.name,
        contact_phone: f.contact_phone || prefill.phone,
      }));
    }
  }, []);

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim() || form.description.trim().length < 10) {
      toast.error(t('report.errorDescription'));
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      let screenshotUrl = '';
      if (screenshotKey) {
        try {
          screenshotUrl = await resolveImageUrl(screenshotKey);
        } catch {
          /* optional attachment */
        }
      }

      const pageUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${location.pathname}${location.search}`
          : '';

      const result = await submitIssueReport({
        description: form.description.trim(),
        section: form.section || undefined,
        contact_name: form.contact_name.trim() || undefined,
        contact_phone: form.contact_phone.trim() || undefined,
        page_url: pageUrl,
        user_agent: [
          Capacitor.isNativePlatform() ? 'native-app' : 'web',
          typeof navigator !== 'undefined' ? navigator.userAgent : '',
        ]
          .filter(Boolean)
          .join(' · '),
        screenshot_url: screenshotUrl || undefined,
      });

      if (result.success) {
        setSuccess(true);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('report.errorSend'));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('report.successTitle')}</h1>
          <p className="mt-3 text-gray-500 dark:text-gray-400">{t('report.successDesc')}</p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('report.backHome')}
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 py-8 md:max-w-xl md:py-10">
        <Link
          to="/more"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('report.back')}
        </Link>

        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-200/50 dark:shadow-none">
            <Bug className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">{t('report.title')}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('report.subtitle')}</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-3xl border border-gray-100 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900 md:p-8"
        >
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700 dark:text-gray-300">
              {t('report.fieldSection')}
            </label>
            <select
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
              className={inputClass}
            >
              <option value="">{t('report.sectionPlaceholder')}</option>
              {SECTION_KEYS.map((key) => (
                <option key={key} value={t(key)}>
                  {t(key)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700 dark:text-gray-300">
              {t('report.fieldDescription')} *
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={5}
              required
              minLength={10}
              className={`${inputClass} resize-none`}
              placeholder={t('report.descriptionPlaceholder')}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700 dark:text-gray-300">
              {t('report.fieldScreenshot')}
            </label>
            <p className="mb-2 text-xs text-gray-400">{t('report.screenshotHint')}</p>
            <ImageUpload value={screenshotKey} onChange={setScreenshotKey} folder="feedback" compact allowUrl={false} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700 dark:text-gray-300">
                {t('report.fieldName')}
              </label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                className={inputClass}
                placeholder={t('report.namePlaceholder')}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700 dark:text-gray-300">
                {t('report.fieldPhone')}
              </label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                className={inputClass}
                placeholder="+7 (700) 123-45-67"
              />
            </div>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">{t('report.privacyNote')}</p>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-200/50 transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 dark:shadow-none"
          >
            {submitting ? t('report.submitting') : t('report.submit')}
            {!submitting && <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </Layout>
  );
}
