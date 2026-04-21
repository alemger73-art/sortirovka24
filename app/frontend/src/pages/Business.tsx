import { useState } from 'react';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Users, FileText, BookOpen, Utensils, ShoppingBag,
  Wrench, Building2, ArrowRight, CheckCircle2, Send,
  ChevronRight
} from 'lucide-react';

export default function BusinessPage() {
  const { t } = useLanguage();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    whatsapp: '',
    activity: '',
    description: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Build WhatsApp message
    const msg = `Заявка на размещение бизнеса:\n\nИмя: ${form.name}\nТелефон: ${form.phone}\nWhatsApp: ${form.whatsapp}\nДеятельность: ${form.activity}\nОписание: ${form.description}`;
    const waUrl = `https://wa.me/77001234567?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
    setSubmitted(true);
  };

  const benefits = [
    { icon: Users, title: t('business.clientFlow'), desc: t('business.clientFlowDesc'), color: 'bg-blue-500' },
    { icon: FileText, title: t('business.applications'), desc: t('business.applicationsDesc'), color: 'bg-emerald-500' },
    { icon: BookOpen, title: t('business.catalogPlacement'), desc: t('business.catalogPlacementDesc'), color: 'bg-purple-500' },
  ];

  const whoFits = [
    { icon: Utensils, title: t('business.foodDelivery'), desc: t('business.foodDeliveryDesc'), color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    { icon: ShoppingBag, title: t('business.shops'), desc: t('business.shopsDesc'), color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-900/20' },
    { icon: Wrench, title: t('business.mastersServices'), desc: t('business.mastersServicesDesc'), color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { icon: Building2, title: t('business.localBusiness'), desc: t('business.localBusinessDesc'), color: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/20' },
  ];

  const steps = [
    { num: '1', title: t('business.step1'), desc: t('business.step1Desc') },
    { num: '2', title: t('business.step2'), desc: t('business.step2Desc') },
    { num: '3', title: t('business.step3'), desc: t('business.step3Desc') },
  ];

  const examples = [
    { title: t('business.exDelivery'), desc: t('business.exDeliveryDesc'), emoji: '🍕' },
    { title: t('business.exMaster'), desc: t('business.exMasterDesc'), emoji: '🔧' },
    { title: t('business.exShop'), desc: t('business.exShopDesc'), emoji: '🏪' },
  ];

  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 backdrop-blur-sm px-4 py-1.5 rounded-full inline-block mb-6">
            💼 {t('banner.forBusiness')}
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
            {t('business.title')}
          </h1>
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto">
            {t('business.subtitle')}
          </p>
        </div>
      </section>

      <div className="bg-[#f5f5f7] dark:bg-gray-950">
        <div className="max-w-5xl mx-auto px-4 py-12 space-y-16">

          {/* Что вы получите */}
          <section>
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-8 text-center">{t('business.whatYouGet')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {benefits.map(b => (
                <div key={b.title} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
                  <div className={`${b.color} w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                    <b.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-2">{b.title}</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">{b.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Кому подходит */}
          <section>
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-8 text-center">{t('business.whoFits')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {whoFits.map(w => (
                <div key={w.title} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 flex items-start gap-4">
                  <div className={`${w.bg} w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <w.icon className={`w-6 h-6 ${w.color}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">{w.title}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">{w.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Как это работает */}
          <section>
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-8 text-center">{t('business.howItWorks')}</h2>
            <div className="flex flex-col md:flex-row gap-4 md:gap-6">
              {steps.map((s, i) => (
                <div key={s.num} className="flex-1 relative">
                  <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-center h-full">
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-extrabold text-lg flex items-center justify-center mx-auto mb-4">
                      {s.num}
                    </div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-base mb-2">{s.title}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{s.desc}</p>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="hidden md:flex absolute top-1/2 -right-5 -translate-y-1/2 z-10">
                      <ChevronRight className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Примеры */}
          <section>
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-8 text-center">{t('business.examples')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {examples.map(ex => (
                <div key={ex.title} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                  <span className="text-3xl block mb-3">{ex.emoji}</span>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base mb-2">{ex.title}</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">{ex.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Форма заявки */}
          <section id="form">
            <div className="max-w-lg mx-auto">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-8 text-center">{t('business.formTitle')}</h2>

              {submitted ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
                  <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{t('business.thankYou')}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-800 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('business.formName')} *</label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={form.name}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('business.formPhone')} *</label>
                    <input
                      type="tel"
                      name="phone"
                      required
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="+7 (___) ___-__-__"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">WhatsApp</label>
                    <input
                      type="tel"
                      name="whatsapp"
                      value={form.whatsapp}
                      onChange={handleChange}
                      placeholder="+7 (___) ___-__-__"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('business.formActivity')} *</label>
                    <select
                      name="activity"
                      required
                      value={form.activity}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    >
                      <option value="">—</option>
                      <option value="food">{t('business.foodDelivery')}</option>
                      <option value="shop">{t('business.shops')}</option>
                      <option value="master">{t('business.mastersServices')}</option>
                      <option value="local">{t('business.localBusiness')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('business.formDescription')}</label>
                    <textarea
                      name="description"
                      rows={4}
                      value={form.description}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 text-sm min-h-[48px]"
                  >
                    <Send className="w-4 h-4" />
                    {t('business.submit')}
                  </button>
                </form>
              )}
            </div>
          </section>

        </div>
      </div>
    </Layout>
  );
}