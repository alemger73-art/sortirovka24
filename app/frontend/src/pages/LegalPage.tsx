import { useLanguage } from '@/contexts/LanguageContext';
import { Link, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { PRIVACY_POLICY, USER_AGREEMENT } from "@/content/legal";

export default function LegalPage() {
  const { t: publicT } = useLanguage();
  const USER_AGREEMENT = { title: publicT('public.legal.USER_AGREEMENT.title'), updated: publicT('public.legal.USER_AGREEMENT.updated'), sections: Array.from({ length: 7 }, (_, i) => ({ heading: publicT(`public.legal.USER_AGREEMENT.${i}.heading`), body: publicT(`public.legal.USER_AGREEMENT.${i}.body`) })) };
  const PRIVACY_POLICY = { title: publicT('public.legal.PRIVACY_POLICY.title'), updated: publicT('public.legal.PRIVACY_POLICY.updated'), sections: Array.from({ length: 8 }, (_, i) => ({ heading: publicT(`public.legal.PRIVACY_POLICY.${i}.heading`), body: publicT(`public.legal.PRIVACY_POLICY.${i}.body`) })) };
  const { doc } = useParams<{ doc: string }>();
  const content = doc === "privacy" ? PRIVACY_POLICY : USER_AGREEMENT;

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/register" className="text-sm text-blue-600 hover:underline">
          {publicT("public.LegalPage.text206")} </Link>
        <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{content.title}</h1>
        <p className="mt-1 text-sm text-gray-500">{publicT("public.LegalPage.text207")} {content.updated}</p>
        <div className="mt-8 space-y-6">
          {content.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{s.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </Layout>
  );
}
