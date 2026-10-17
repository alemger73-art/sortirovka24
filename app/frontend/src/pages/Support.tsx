import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { LEGAL_OPERATOR } from '@/content/legal';
export default function SupportPage() {
  const { lang } = useLanguage();
  return <Layout><div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
    <h1 className="text-2xl font-bold">{lang === 'kz' ? 'Қолдау және байланыстар' : 'Поддержка и контакты'}</h1>
    <p>{LEGAL_OPERATOR.name}</p>
    <p>{lang === 'kz' ? 'Ақпараттық бөлімдер тегін. Төлем тек DÄM ALEM тапсырысы үшін алынады.' : 'Информационные разделы бесплатны. Оплата принимается только за заказы DÄM ALEM.'}</p>
    <a className="block text-blue-600 underline" href={`tel:${LEGAL_OPERATOR.phoneHref}`}>{LEGAL_OPERATOR.phone}</a>
    <a className="block text-blue-600 underline" href={`mailto:${LEGAL_OPERATOR.email}`}>{LEGAL_OPERATOR.email}</a>
    <Link className="block text-red-600 underline" to="/delete-account">{lang === 'kz' ? 'Аккаунт пен байланысты деректерді жою' : 'Удалить аккаунт и связанные данные'}</Link>
    <p>{lang === 'kz' ? 'Келісімді қайтарып алу немесе аккаунтқа кіре алмаған жағдайда көрсетілген email-ге хабарласыңыз.' : 'Для отзыва согласия или если войти в аккаунт невозможно, обратитесь на указанный email.'}</p>
    <Link className="block text-blue-600 underline" to="/legal/food-terms">{lang === 'kz' ? 'Тапсырыс, жеткізу және шағымдар' : 'Заказ, доставка и претензии'}</Link>
    <Link className="block text-blue-600 underline" to="/legal/privacy">{lang === 'kz' ? 'Құпиялылық саясаты' : 'Политика конфиденциальности'}</Link>
  </div></Layout>;
}
