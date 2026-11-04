/** A section that is being filled: said plainly instead of an empty page. */
import { Link } from 'react-router-dom';
import { Hourglass } from 'lucide-react';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ComingSoon({ title }: { title: { ru: string; kz: string } }) {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  return <Layout><div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
    <Hourglass className="h-12 w-12 text-blue-500" aria-hidden="true" />
    <h1 className="mt-5 text-2xl font-extrabold">{kz ? title.kz : title.ru}</h1>
    <p className="mt-3 text-gray-600 dark:text-gray-300">{kz
      ? 'Бөлім дайындалуда: деректер жүктелуде. Жақында осында пайда болады.'
      : 'Раздел готовится: идёт загрузка данных. Скоро всё появится здесь.'}</p>
    <Link to="/directory" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 font-semibold text-white">{kz ? 'Анықтамалыққа' : 'Открыть справочник'}</Link>
  </div></Layout>;
}
