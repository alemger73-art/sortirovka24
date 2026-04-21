import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="text-6xl font-bold text-gray-200 mb-4">404</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Страница не найдена</h1>
        <p className="text-gray-500 mb-8">
          К сожалению, запрашиваемая страница не существует или была перемещена.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-blue-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Home className="w-5 h-5" /> На главную
        </Link>
      </div>
    </Layout>
  );
}