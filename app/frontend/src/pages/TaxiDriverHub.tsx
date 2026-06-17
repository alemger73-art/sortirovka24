import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAccountToken } from '@/lib/accountApi';
import { taxiApi, type DriverApplication } from '@/lib/taxiApi';
import { useTaxiEnabled } from '@/hooks/useTaxiEnabled';
import DriverDocUpload from '@/components/taxi/DriverDocUpload';
import TaxiUnavailable from '@/components/taxi/TaxiUnavailable';
import { Car, CheckCircle2, Clock, Loader2, LogIn, Shield, Wallet } from 'lucide-react';
import { toast } from 'sonner';

export default function TaxiDriverHub() {
  const navigate = useNavigate();
  const taxiEnabled = useTaxiEnabled();
  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<DriverApplication | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    car_make: '',
    car_model: '',
    car_number: '',
    car_color: '',
    comment: '',
    photo_url: '',
    license_photo_url: '',
    tech_passport_photo_url: '',
    car_photo_url: '',
  });

  useEffect(() => {
    (async () => {
      if (!getAccountToken()) {
        setLoading(false);
        return;
      }
      try {
        const app = await taxiApi.getDriverApplication();
        setApplication(app);
        if (app.status !== 'none') {
          setForm({
            full_name: app.full_name || '',
            phone: app.phone || '',
            car_make: app.car_make || '',
            car_model: app.car_model || '',
            car_number: app.car_number || '',
            car_color: app.car_color || '',
            comment: app.comment || '',
            photo_url: app.photo_url || '',
            license_photo_url: app.license_photo_url || '',
            tech_passport_photo_url: app.tech_passport_photo_url || '',
            car_photo_url: app.car_photo_url || '',
          });
        }
      } catch {
        /* not logged in or no app */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function submit() {
    if (!getAccountToken()) {
      navigate('/account?redirect=/taxi/driver');
      return;
    }
    if (!form.full_name.trim() || !form.car_number.trim()) {
      toast.error('Заполните имя и госномер');
      return;
    }
    if (!form.photo_url || !form.license_photo_url || !form.tech_passport_photo_url || !form.car_photo_url) {
      toast.error('Загрузите все документы: фото, права, техпаспорт и фото автомобиля');
      return;
    }
    setSubmitting(true);
    try {
      const app = await taxiApi.submitDriverApplication(form);
      setApplication(app);
      toast.success('Заявка отправлена! Ожидайте проверки администратором.');
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  }

  const isDriver = application?.is_driver || application?.status === 'approved';

  if (taxiEnabled === false && !isDriver) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-900 py-8">
          <TaxiUnavailable />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-900">
        <div className="bg-gradient-to-br from-yellow-400 to-amber-500 px-4 py-10 md:py-14">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 mb-4">
              <Car className="h-8 w-8 text-yellow-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-gray-900">Водителям Сортировки</h1>
            <p className="mt-2 text-gray-800 font-medium">Работайте в районе · свой кабинет · заказы через Sortirovka24</p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-8 space-y-6 -mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Wallet, title: 'Честный заработок', desc: 'Видите цену каждой поездки' },
              { icon: Shield, title: 'Проверенный сервис', desc: 'Официальная платформа района' },
              { icon: Clock, title: 'Гибкий график', desc: 'Вы сами выходите на линию' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl bg-white/10 border border-white/10 p-4 backdrop-blur-sm">
                <Icon className="h-5 w-5 text-yellow-400 mb-2" />
                <p className="text-white font-semibold text-sm">{title}</p>
                <p className="text-white/50 text-xs mt-1">{desc}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
            </div>
          ) : isDriver ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900">Вы — водитель Сортировка Такси</h2>
              <p className="text-gray-500 mt-2 mb-6">Откройте рабочий кабинет, выйдите на линию и принимайте заказы</p>
              <Button className="h-12 px-8 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold" onClick={() => navigate('/cabinet/driver')}>
                Открыть кабинет водителя
              </Button>
            </div>
          ) : application?.status === 'pending' ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
              <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900">Заявка на рассмотрении</h2>
              <p className="text-gray-500 mt-2">Администратор проверит документы. После модерации откроется кабинет водителя</p>
              <p className="text-sm text-gray-400 mt-4">{form.car_make} {form.car_model} · {form.car_number}</p>
            </div>
          ) : application?.status === 'rejected' ? (
            <div className="rounded-3xl bg-white p-8 shadow-xl space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Заявка отклонена</h2>
              {application.admin_note && <p className="text-sm text-red-600">{application.admin_note}</p>}
              <p className="text-gray-500 text-sm">Исправьте данные и отправьте заявку снова</p>
              {/* show form below */}
            </div>
          ) : null}

          {!isDriver && application?.status !== 'pending' && (
            <div className="rounded-3xl bg-white p-6 md:p-8 shadow-xl space-y-4">
              <h2 className="text-xl font-bold text-gray-900">
                {getAccountToken() ? 'Заявка на подключение' : 'Войдите, чтобы подать заявку'}
              </h2>
              {!getAccountToken() ? (
                <div className="text-center py-6">
                  <p className="text-gray-500 mb-4">Нужен аккаунт Sortirovka24 (SMS-вход)</p>
                  <Button className="rounded-xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold" onClick={() => navigate('/account?redirect=/taxi/driver')}>
                    <LogIn className="h-4 w-4 mr-2" /> Войти / регистрация
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input placeholder="ФИО" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="rounded-xl h-11" />
                    <Input placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-xl h-11" />
                    <Input placeholder="Марка (Toyota)" value={form.car_make} onChange={(e) => setForm({ ...form, car_make: e.target.value })} className="rounded-xl h-11" />
                    <Input placeholder="Модель (Camry)" value={form.car_model} onChange={(e) => setForm({ ...form, car_model: e.target.value })} className="rounded-xl h-11" />
                    <Input placeholder="Госномер" value={form.car_number} onChange={(e) => setForm({ ...form, car_number: e.target.value })} className="rounded-xl h-11" />
                    <Input placeholder="Цвет" value={form.car_color} onChange={(e) => setForm({ ...form, car_color: e.target.value })} className="rounded-xl h-11" />
                  </div>
                  <Input placeholder="Комментарий (необязательно)" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} className="rounded-xl h-11" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-2">Документы для верификации</p>
                    <DriverDocUpload
                      photoUrl={form.photo_url}
                      licenseUrl={form.license_photo_url}
                      techPassportUrl={form.tech_passport_photo_url}
                      carPhotoUrl={form.car_photo_url}
                      onChange={(field, value) => setForm({ ...form, [field]: value })}
                    />
                  </div>
                  <Button className="w-full h-12 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold" disabled={submitting} onClick={submit}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Отправить заявку
                  </Button>
                </>
              )}
            </div>
          )}

          <p className="text-center text-white/40 text-sm">
            Заказать такси — <Link to="/taxi" className="text-yellow-400 underline">для пассажиров</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
