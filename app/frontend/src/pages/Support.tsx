import { useState } from 'react';

import { Link } from 'react-router-dom';

import Layout from '@/components/Layout';

import { useLanguage } from '@/contexts/LanguageContext';

import { useSupportSettings } from '@/hooks/useSupportSettings';

import StorageImg from '@/components/StorageImg';

import {

  Heart, Users, Utensils, Wrench, Megaphone, Bus, Shield,

  Copy, Check, ChevronLeft, Sparkles, Smartphone

} from 'lucide-react';

import { toast } from 'sonner';



function CopyButton({ value, label }: { value: string; label: string }) {

  const [copied, setCopied] = useState(false);



  const handleCopy = async () => {

    if (!value) return;

    try {

      await navigator.clipboard.writeText(value);

      setCopied(true);

      toast.success(label);

      setTimeout(() => setCopied(false), 2000);

    } catch {

      toast.error('Не удалось скопировать');

    }

  };



  if (!value) return null;



  return (

    <button

      type="button"

      onClick={handleCopy}

      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 transition-colors"

    >

      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}

      {copied ? 'Скопировано' : 'Копировать'}

    </button>

  );

}



export default function SupportPage() {

  const { t } = useLanguage();

  const { settings } = useSupportSettings();



  const benefits = [

    { icon: Utensils, title: t('support.benefitFood'), desc: t('support.benefitFoodDesc'), color: 'bg-orange-500' },

    { icon: Wrench, title: t('support.benefitMasters'), desc: t('support.benefitMastersDesc'), color: 'bg-blue-500' },

    { icon: Megaphone, title: t('support.benefitCommunity'), desc: t('support.benefitCommunityDesc'), color: 'bg-emerald-500' },

    { icon: Bus, title: t('support.benefitTransport'), desc: t('support.benefitTransportDesc'), color: 'bg-purple-500' },

    { icon: Shield, title: t('support.benefitSafety'), desc: t('support.benefitSafetyDesc'), color: 'bg-rose-500' },

    { icon: Users, title: t('support.benefitLocal'), desc: t('support.benefitLocalDesc'), color: 'bg-teal-500' },

  ];



  const requisites = [

    { label: t('support.reqRecipient'), value: settings.recipient },

    { label: t('support.reqBank'), value: settings.bank },

    { label: 'IBAN', value: settings.iban },

    { label: 'БИН / ИИН', value: settings.bin },

    { label: 'Kaspi', value: settings.kaspi_phone },

    { label: t('support.reqPurpose'), value: settings.purpose },

  ].filter((item) => item.value);



  const kaspiDigits = settings.kaspi_phone.replace(/\D/g, '');



  return (

    <Layout>

      <section className="bg-gradient-to-br from-rose-900 via-blue-900 to-indigo-900 py-14 md:py-20">

        <div className="max-w-4xl mx-auto px-4 text-center">

          <span className="text-xs font-bold text-rose-200 bg-rose-500/20 backdrop-blur-sm px-4 py-1.5 rounded-full inline-flex items-center gap-1.5 mb-6">

            <Heart className="w-3.5 h-3.5" />

            {t('support.badge')}

          </span>

          <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-4 leading-tight">

            {t('support.title')}

          </h1>

          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto">

            {t('support.subtitle')}

          </p>

        </div>

      </section>



      <div className="bg-[#f5f5f7] dark:bg-gray-950">

        <div className="max-w-5xl mx-auto px-4 py-10 md:py-14 space-y-14">

          <Link

            to="/"

            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"

          >

            <ChevronLeft className="w-4 h-4" />

            {t('support.backHome')}

          </Link>



          <section className="bg-white dark:bg-gray-900 rounded-2xl p-6 md:p-8 border border-gray-100 dark:border-gray-800 shadow-sm">

            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-4">

              {t('support.aboutTitle')}

            </h2>

            <div className="space-y-4 text-gray-600 dark:text-gray-300 leading-relaxed">

              <p>{t('support.aboutP1')}</p>

              <p>{t('support.aboutP2')}</p>

              <p>{t('support.aboutP3')}</p>

            </div>

          </section>



          <section>

            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-2">

              {t('support.whyTitle')}

            </h2>

            <p className="text-gray-500 dark:text-gray-400 mb-6">{t('support.whySubtitle')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

              {benefits.map(({ icon: Icon, title, desc, color }) => (

                <div

                  key={title}

                  className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm"

                >

                  <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>

                    <Icon className="w-5 h-5 text-white" />

                  </div>

                  <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-1">{title}</h3>

                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>

                </div>

              ))}

            </div>

          </section>



          <section className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 rounded-2xl p-6 md:p-8 border border-blue-100 dark:border-blue-900/50">

            <div className="flex items-start gap-3">

              <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />

              <div>

                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">

                  {t('support.fundsTitle')}

                </h2>

                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">

                  <li>• {t('support.funds1')}</li>

                  <li>• {t('support.funds2')}</li>

                  <li>• {t('support.funds3')}</li>

                  <li>• {t('support.funds4')}</li>

                </ul>

                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 italic">

                  {t('support.fundsNote')}

                </p>

              </div>

            </div>

          </section>



          <section id="requisites" className="bg-white dark:bg-gray-900 rounded-2xl p-6 md:p-8 border border-gray-100 dark:border-gray-800 shadow-sm">

            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-2">

              {t('support.reqTitle')}

            </h2>

            <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">{t('support.reqSubtitle')}</p>



            <div className={`grid gap-6 ${settings.kaspi_qr_url ? 'lg:grid-cols-[1fr_220px]' : ''}`}>

              <div className="space-y-3">

                {requisites.map(({ label, value }) => (

                  <div

                    key={label}

                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3"

                  >

                    <div className="min-w-0">

                      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>

                      <p className="font-medium text-gray-900 dark:text-white break-all">{value}</p>

                    </div>

                    <CopyButton value={value} label={`${label} скопирован`} />

                  </div>

                ))}

              </div>



              {settings.kaspi_qr_url && (

                <div className="flex flex-col items-center rounded-2xl border border-red-100 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-4">

                  <StorageImg

                    objectKey={settings.kaspi_qr_url}

                    alt="Kaspi QR"

                    className="w-44 h-44 object-contain rounded-xl bg-white p-2"

                  />

                  <p className="mt-3 text-xs text-center text-gray-600 dark:text-gray-300 font-medium">

                    {t('support.kaspiQrHint')}

                  </p>

                  {kaspiDigits && (

                    <a

                      href={`tel:${kaspiDigits}`}

                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:underline"

                    >

                      <Smartphone className="w-4 h-4" />

                      {settings.kaspi_phone}

                    </a>

                  )}

                </div>

              )}

            </div>



            {settings.contact_email && (

              <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">

                {t('support.reqContact')}{' '}

                <a

                  href={`mailto:${settings.contact_email}`}

                  className="text-blue-600 dark:text-blue-400 hover:underline"

                >

                  {settings.contact_email}

                </a>

              </p>

            )}

          </section>

        </div>

      </div>

    </Layout>

  );

}


