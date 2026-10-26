import { Link } from 'react-router-dom';
import { ArrowRight, FileText, Mail, MessageCircle, Phone, ShieldCheck, Trash2 } from 'lucide-react';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { LEGAL_OPERATOR } from '@/content/legal';
import '@/styles/ads.css';

/** «Поддержка и контакты» in the portal style: navy header, contact cards, documents. */
export default function SupportPage() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const tx = (ru: string, k: string) => (kz ? k : ru);
  const card = 'ads-panel flex items-center gap-4 p-5 transition hover:border-[#3864ed]';
  const icon = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ads-accent-soft)] text-[var(--ads-accent)]';
  return (
    <Layout>
      <div className="ads-surface pb-16">
        <header className="ads-hero">
          <div className="ads-shell relative">
            <span className="ads-kicker">{tx('Сортировка 24 · Помощь', 'Сортировка 24 · Көмек')}</span>
            <h1>{tx('Поддержка и контакты', 'Қолдау және байланыстар')}</h1>
            <p>{tx('Информационные разделы бесплатны. Оплата принимается только за заказы DÄM ALEM.', 'Ақпараттық бөлімдер тегін. Төлем тек DÄM ALEM тапсырысы үшін алынады.')}</p>
            <p className="mt-3 !text-sm">{LEGAL_OPERATOR.name}</p>
          </div>
        </header>
        <div className="ads-shell mt-8 grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-xl font-bold">{tx('Связаться с нами', 'Бізбен байланысу')}</h2>
            <a className={card} href="https://wa.me/77004280280" target="_blank" rel="noopener noreferrer"><span className={icon}><MessageCircle className="h-5 w-5" /></span><span className="flex-1"><b className="block">WhatsApp</b><span className="text-sm text-[var(--ads-muted)]">{tx('Быстрее всего отвечаем здесь', 'Мұнда ең жылдам жауап береміз')}</span></span><ArrowRight className="h-4 w-4 text-[var(--ads-muted)]" /></a>
            <a className={card} href={`tel:${LEGAL_OPERATOR.phoneHref}`}><span className={icon}><Phone className="h-5 w-5" /></span><span className="flex-1"><b className="block">{LEGAL_OPERATOR.phone}</b><span className="text-sm text-[var(--ads-muted)]">{tx('Позвонить', 'Қоңырау шалу')}</span></span><ArrowRight className="h-4 w-4 text-[var(--ads-muted)]" /></a>
            <a className={card} href={`mailto:${LEGAL_OPERATOR.email}`}><span className={icon}><Mail className="h-5 w-5" /></span><span className="flex-1"><b className="block">{LEGAL_OPERATOR.email}</b><span className="text-sm text-[var(--ads-muted)]">{tx('Для писем и официальных обращений', 'Хаттар мен ресми өтініштер үшін')}</span></span><ArrowRight className="h-4 w-4 text-[var(--ads-muted)]" /></a>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-bold">{tx('Документы и данные', 'Құжаттар мен деректер')}</h2>
            <Link className={card} to="/legal/food-terms"><span className={icon}><FileText className="h-5 w-5" /></span><b className="flex-1">{tx('Заказ, доставка и претензии', 'Тапсырыс, жеткізу және шағымдар')}</b><ArrowRight className="h-4 w-4 text-[var(--ads-muted)]" /></Link>
            <Link className={card} to="/legal/privacy"><span className={icon}><ShieldCheck className="h-5 w-5" /></span><b className="flex-1">{tx('Политика конфиденциальности', 'Құпиялылық саясаты')}</b><ArrowRight className="h-4 w-4 text-[var(--ads-muted)]" /></Link>
            <Link className={card} to="/delete-account"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40"><Trash2 className="h-5 w-5" /></span><span className="flex-1"><b className="block text-red-600">{tx('Удалить аккаунт и связанные данные', 'Аккаунт пен байланысты деректерді жою')}</b><span className="text-sm text-[var(--ads-muted)]">{tx('Для отзыва согласия или если войти в аккаунт невозможно, напишите на email выше.', 'Келісімді қайтарып алу немесе аккаунтқа кіре алмасаңыз, жоғарыдағы email-ге жазыңыз.')}</span></span></Link>
          </section>
        </div>
      </div>
    </Layout>
  );
}
