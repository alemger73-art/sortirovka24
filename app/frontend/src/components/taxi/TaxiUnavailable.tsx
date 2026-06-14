import { Link } from 'react-router-dom';
import { Car } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  compact?: boolean;
};

export default function TaxiUnavailable({ compact = false }: Props) {
  if (compact) {
    return (
      <p className="text-sm text-gray-500">
        Сервис такси временно недоступен.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <div className="rounded-3xl bg-white shadow-xl p-8 md:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
          <Car className="h-8 w-8 text-gray-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Такси скоро запустится</h1>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Сервис такси Сортировка готовится к запуску. Следите за новостями — скоро можно будет заказать поездку по району.
        </p>
        <Button asChild className="mt-6 w-full h-12 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold">
          <Link to="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
