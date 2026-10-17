import { useLanguage } from '@/contexts/LanguageContext';
import { Link, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { getLegalDocuments, type LegalDocKey } from "@/content/legal";

export default function LegalPage() {
  const { t: publicT, lang } = useLanguage();
  const { doc } = useParams<{ doc: string }>();
  const documents = getLegalDocuments(lang);
  const content = documents[doc as LegalDocKey];
  if (!content) return <Layout><p className="p-8">{lang === 'kz' ? 'Құжат табылмады' : 'Документ не найден'}</p></Layout>;

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/register" className="text-sm text-blue-600 hover:underline">
          {publicT("public.LegalPage.text206")} </Link>
        <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{content.title}</h1>
        <p className="mt-1 text-sm text-gray-500">{publicT("public.LegalPage.text207")} {content.updated}</p>
        <nav aria-label={lang === 'kz' ? 'Құжаттар' : 'Документы'} className="mt-4 flex flex-wrap gap-3 text-sm text-blue-600">
          {Object.entries(documents).map(([key, item]) => <Link key={key} to={`/legal/${key}`} className="underline" aria-current={key === doc ? 'page' : undefined}>{item.title}</Link>)}
        </nav>
        <div className="mt-8 space-y-6">
          {content.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{s.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{s.body}</p>
            </section>
          ))}
        </div>
        <div className="mt-8 space-y-2 border-t pt-4 text-sm">
          <a className="block text-blue-600 underline" href="https://www.gov.kz/memleket/entities/mti-kzpp?lang=ru" target="_blank" rel="noopener noreferrer">{lang === 'kz' ? 'Тұтынушылардың құқықтарын қорғау комитеті: байланыстар және сотқа дейінгі реттеу' : 'Комитет по защите прав потребителей: контакты и досудебное урегулирование'}</a>
          <a className="block text-blue-600 underline" href="https://eotinish.kz/" target="_blank" rel="noopener noreferrer">{lang === 'kz' ? 'Мемлекеттік органға өтініш (e-Otinish)' : 'Обращение в государственный орган (e-Otinish)'}</a>
        </div>
      </div>
    </Layout>
  );
}
