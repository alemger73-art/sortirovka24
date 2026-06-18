import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CourierDocUpload from '@/components/logistics/CourierDocUpload';
import { getAccountToken } from '@/lib/accountApi';
import { logisticsApi, type CourierApplication } from '@/lib/logisticsApi';
import {
  Bike,
  Car,
  CheckCircle2,
  Clock,
  Footprints,
  Loader2,
  LogIn,
  MapPin,
  Shield,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

const VEHICLE_OPTIONS = [
  { id: 'bike', label: 'Велосипед', icon: Bike },
  { id: 'car', label: 'Автомобиль', icon: Car },
  { id: 'foot', label: 'Пешком', icon: Footprints },
];

export default function CourierHub() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<CourierApplication | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    vehicle_type: 'bike',
    vehicle_plate: '',
    comment: '',
    photo_url: '',
    id_photo_url: '',
    vehicle_photo_url: '',
  });

  useEffect(() => {
    (async () => {
      if (!getAccountToken()) {
        setLoading(false);
        return;
      }
      try {
        const app = await logisticsApi.getCourierApplication();
        setApplication(app);
        if (app.status !== 'none') {
          setForm({
            full_name: app.full_name || '',
            phone: app.phone || '',
            vehicle_type: app.vehicle_type || 'bike',
            vehicle_plate: app.vehicle_plate || '',
            comment: app.comment || '',
            photo_url: app.photo_url || '',
            id_photo_url: app.id_photo_url || '',
            vehicle_photo_url: app.vehicle_photo_url || '',
          });
        }
      } catch {
        /* not logged in */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function submit() {
    if (!getAccountToken()) {
      navigate('/account?redirect=/delivery/courier');
      return;
    }
    if (!form.full_name.trim()) {
      toast.error('Укажите ФИО');
      return;
    }
    if (!form.phone.trim()) {
      toast.error('Укажите телефон');
      return;
    }
    if (!form.photo_url || !form.id_photo_url) {
      toast.error('Загрузите фото и удостоверение');
      return;
    }
    if (form.vehicle_type !== 'foot' && !form.vehicle_photo_url) {
      toast.error('Загрузите фото транспорта');
      return;
    }
    if (form.vehicle_type === 'car' && !form.vehicle_plate.trim()) {
      toast.error('Укажите госномер');
      return;
    }
    setSubmitting(true);
    try {
      const app = await logisticsApi.submitCourierApplication(form);
      setApplication(app);
      toast.success('Заявка отправлена! Ожидайте проверки администратором.');
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  }

  const isCourier = application?.is_courier || application?.status === 'approved';

  return (
    <Layout>
      <div className="min-h-screen bg-gray-900">
        <div className="bg-gradient-to-br from-orange-400 to-amber-500 px-4 py-10 md:py-14">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 mb-4">
              <Bike className="h-8 w-8 text-orange-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-gray-900">Курьерам Сортировки</h1>
            <p className="mt-2 text-gray-800 font-medium">Доставка еды и заказов · свой кабинет · гибкий график</p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-8 space-y-6 -mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Wallet, title: 'Оплата за доставку', desc: 'Видите сумму каждого заказа' },
              { icon: MapPin, title: 'Район Сортировка', desc: 'Короткие маршруты' },
              { icon: Shield, title: 'Официально', desc: 'Платформа района' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl bg-white/10 border border-white/10 p-4 backdrop-blur-sm">
                <Icon className="h-5 w-5 text-orange-300 mb-2" />
                <p className="text-white font-semibold text-sm">{title}</p>
                <p className="text-white/50 text-xs mt-1">{desc}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
            </div>
          ) : isCourier ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900">Вы — курьер Sortirovka24</h2>
              <p className="text-gray-500 mt-2 mb-6">Откройте рабочий кабинет, выйдите на линию и принимайте доставки</p>
              <Button
                className="h-12 px-8 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold"
                onClick={() => navigate('/cabinet/courier')}
              >
                Открыть кабинет курьера
              </Button>
            </div>
          ) : application?.status === 'pending' ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
              <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900">Заявка на рассмотрении</h2>
              <p className="text-gray-500 mt-2">
                Администратор проверит документы. После одобрения откроется кабинет курьера.
              </p>
              <p className="text-sm text-gray-400 mt-4">
                {form.full_name} · {VEHICLE_OPTIONS.find((v) => v.id === form.vehicle_type)?.label}
              </p>
            </div>
          ) : application?.status === 'rejected' ? (
            <div className="rounded-3xl bg-white p-6 shadow-xl space-y-3">
              <h2 className="text-xl font-bold text-gray-900">Заявка отклонена</h2>
              {application.admin_note && <p className="text-sm text-red-600">{application.admin_note}</p>}
              <p className="text-gray-500 text-sm">Исправьте данные и отправьте заявку снова</p>
            </div>
          ) : null}

          {!isCourier && application?.status !== 'pending' && (
            <div className="rounded-3xl bg-white p-6 md:p-8 shadow-xl space-y-4">
              <h2 className="text-xl font-bold text-gray-900">
                {getAccountToken() ? 'Заявка на подключение' : 'Войдите, чтобы подать заявку'}
              </h2>
              {!getAccountToken() ? (
                <div className="text-center py-6">
                  <p className="text-gray-500 mb-4">Нужен аккаунт Sortirovka24 (SMS-вход)</p>
                  <Button
                    className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold"
                    onClick={() => navigate('/account?redirect=/delivery/courier')}
                  >
                    <LogIn className="h-4 w-4 mr-2" /> Войти / регистрация
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      placeholder="ФИО"
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                      className="rounded-xl h-11"
                    />
                    <Input
                      placeholder="Телефон"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="rounded-xl h-11"
                    />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-2">Как доставляете?</p>
                    <div className="grid grid-cols-3 gap-2">
                      {VEHICLE_OPTIONS.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setForm({ ...form, vehicle_type: id })}
                          className={`rounded-xl border p-3 text-center text-sm font-semibold transition ${
                            form.vehicle_type === id
                              ? 'border-orange-500 bg-orange-50 text-orange-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <Icon className="h-5 w-5 mx-auto mb-1" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.vehicle_type === 'car' && (
                    <Input
                      placeholder="Госномер автомобиля"
                      value={form.vehicle_plate}
                      onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })}
                      className="rounded-xl h-11"
                    />
                  )}

                  <Input
                    placeholder="Комментарий (необязательно)"
                    value={form.comment}
                    onChange={(e) => setForm({ ...form, comment: e.target.value })}
                    className="rounded-xl h-11"
                  />

                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-2">Документы</p>
                    <CourierDocUpload
                      photoUrl={form.photo_url}
                      idUrl={form.id_photo_url}
                      vehicleUrl={form.vehicle_photo_url}
                      vehicleType={form.vehicle_type}
                      onChange={(field, value) => setForm({ ...form, [field]: value })}
                    />
                  </div>

                  <Button
                    className="w-full h-12 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold"
                    disabled={submitting}
                    onClick={submit}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Отправить заявку
                  </Button>
                </>
              )}
            </div>
          )}

          <p className="text-center text-white/40 text-sm">
            Заказать еду — <Link to="/food" className="text-orange-300 underline">DAM ALEM</Link>
            {' · '}
            Водителям — <Link to="/taxi/driver" className="text-orange-300 underline">такси</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
