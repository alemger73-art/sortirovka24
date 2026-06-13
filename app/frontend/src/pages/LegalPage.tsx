import { Link, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { PRIVACY_POLICY, USER_AGREEMENT } from "@/content/legal";

export default function LegalPage() {
  const { doc } = useParams<{ doc: string }>();
  const content = doc === "privacy" ? PRIVACY_POLICY : USER_AGREEMENT;

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/register" className="text-sm text-blue-600 hover:underline">
          ← Назад к регистрации
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{content.title}</h1>
        <p className="mt-1 text-sm text-gray-500">Обновлено: {content.updated}</p>
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
