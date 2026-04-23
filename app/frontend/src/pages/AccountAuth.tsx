import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import Layout from "@/components/Layout";
import { accountApi, setAccountToken } from "@/lib/accountApi";

function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const normalized = digits.startsWith("7") ? digits.slice(1) : digits.startsWith("8") ? digits.slice(1) : digits;
  const d = normalized.slice(0, 10);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 8);
  const p4 = d.slice(8, 10);
  let out = "+7";
  if (p1) out += ` (${p1}`;
  if (p1.length === 3) out += ")";
  if (p2) out += ` ${p2}`;
  if (p3) out += `-${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

function getCabinetRouteByRole(role?: string): string {
  switch (role) {
    case "admin":
    case "superadmin":
    case "moderator":
      return "/cabinet/admin";
    case "master":
      return "/cabinet/master";
    case "driver":
      return "/cabinet/driver";
    case "seller":
      return "/cabinet/partner";
    default:
      return "/cabinet";
  }
}

export default function AccountAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(location.pathname !== "/register");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [smsCode, setSmsCode] = useState("");
  const [smsRequested, setSmsRequested] = useState(false);
  const [smsInfo, setSmsInfo] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    email: "",
    language: "ru",
    agreement_accepted: false,
    privacy_accepted: false,
  });
  const title = useMemo(() => (isLogin ? "Вход" : "Регистрация"), [isLogin]);

  async function requestSmsCode() {
    setError("");
    setSmsInfo("");
    try {
      if (!form.phone.trim()) throw new Error("Введите номер телефона");
      const res = await accountApi.requestSmsCode({ phone: form.phone });
      setSmsRequested(true);
      setSmsInfo(`Код отправлен. Действителен ${Math.floor(res.ttl_seconds / 60)} мин.`);
      if (res.debug_code) {
        setSmsInfo(prev => `${prev} Тестовый код: ${res.debug_code}`);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  async function submit() {
    setLoading(true);
    setError("");
    try {
      if (!form.phone.trim()) throw new Error("Введите номер телефона");
      if (!form.password.trim()) throw new Error("Введите пароль");
      if (form.password.trim().length < 8) throw new Error("Пароль должен быть не короче 8 символов");
      if (isLogin) {
        const res = await accountApi.login({ phone: form.phone, password: form.password });
        setAccountToken(res.token);
        navigate(getCabinetRouteByRole(res.role));
      } else {
        if (!smsRequested) throw new Error("Сначала запросите SMS-код");
        if (!smsCode.trim()) throw new Error("Введите SMS-код");
        const res = await accountApi.confirmRegistration({
          name: form.name,
          phone: form.phone,
          password: form.password,
          email: form.email || undefined,
          language: form.language,
          agreement_accepted: form.agreement_accepted,
          privacy_accepted: form.privacy_accepted,
          sms_code: smsCode.trim(),
        });
        setAccountToken(res.token);
        navigate(getCabinetRouteByRole(res.role));
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Вход по номеру телефона и паролю</p>

          <div className="mt-5 space-y-3">
            {!isLogin && (
              <>
                <input className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white" placeholder="Имя" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <input className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white" placeholder="Email (необязательно)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                <select className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white" value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}>
                  <option value="ru">Русский</option>
                  <option value="kz">Қазақша</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={form.agreement_accepted} onChange={e => setForm({ ...form, agreement_accepted: e.target.checked })} />
                  Принимаю пользовательское соглашение
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={form.privacy_accepted} onChange={e => setForm({ ...form, privacy_accepted: e.target.checked })} />
                  Принимаю политику конфиденциальности
                </label>
                <button
                  type="button"
                  onClick={requestSmsCode}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  {smsRequested ? "Отправить код повторно" : "Отправить SMS-код"}
                </button>
                {smsRequested ? (
                  <input
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                    placeholder="Код из SMS"
                    inputMode="numeric"
                    value={smsCode}
                    onChange={e => setSmsCode(e.target.value)}
                  />
                ) : null}
                {smsInfo ? <p className="text-xs text-gray-500 dark:text-gray-400">{smsInfo}</p> : null}
              </>
            )}
            <input
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
              placeholder="+7 (700) 123-45-67"
              inputMode="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-11 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                placeholder="Пароль"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Пароль: минимум 8 символов</p>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <button onClick={submit} disabled={loading} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {loading ? "Загрузка..." : isLogin ? "Войти" : "Создать аккаунт"}
          </button>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button onClick={() => setIsLogin(v => !v)} className="text-blue-600 hover:text-blue-700">
              {isLogin ? "Нужен аккаунт? Регистрация" : "Уже есть аккаунт? Войти"}
            </button>
            <Link to="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              На главную
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
