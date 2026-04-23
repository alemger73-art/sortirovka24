import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

export default function AccountAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(location.pathname !== "/register");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
      } else {
        const res = await accountApi.register({
          name: form.name,
          phone: form.phone,
          password: form.password,
          email: form.email || undefined,
          language: form.language,
          agreement_accepted: form.agreement_accepted,
          privacy_accepted: form.privacy_accepted,
        });
        setAccountToken(res.token);
      }
      navigate("/cabinet");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="theme-transition rounded-2xl border border-app bg-app-card p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-app">{title}</h1>
          <p className="mt-1 text-sm text-app-muted">Вход по номеру телефона и паролю</p>

          <div className="mt-5 space-y-3">
            {!isLogin && (
              <>
                <input className="theme-transition w-full rounded-xl border border-app bg-app-input px-3 py-2.5 text-app" placeholder="Имя" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <input className="theme-transition w-full rounded-xl border border-app bg-app-input px-3 py-2.5 text-app" placeholder="Email (необязательно)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                <select className="theme-transition w-full rounded-xl border border-app bg-app-input px-3 py-2.5 text-app" value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}>
                  <option value="ru">Русский</option>
                  <option value="kz">Қазақша</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-app-muted">
                  <input type="checkbox" checked={form.agreement_accepted} onChange={e => setForm({ ...form, agreement_accepted: e.target.checked })} />
                  Принимаю пользовательское соглашение
                </label>
                <label className="flex items-center gap-2 text-sm text-app-muted">
                  <input type="checkbox" checked={form.privacy_accepted} onChange={e => setForm({ ...form, privacy_accepted: e.target.checked })} />
                  Принимаю политику конфиденциальности
                </label>
              </>
            )}
            <input
              className="theme-transition w-full rounded-xl border border-app bg-app-input px-3 py-2.5 text-app"
              placeholder="+7 (700) 123-45-67"
              inputMode="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
            />
            <input type="password" className="theme-transition w-full rounded-xl border border-app bg-app-input px-3 py-2.5 text-app" placeholder="Пароль" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <p className="text-xs text-app-muted">Пароль: минимум 8 символов</p>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <button onClick={submit} disabled={loading} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {loading ? "Загрузка..." : isLogin ? "Войти" : "Создать аккаунт"}
          </button>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button onClick={() => setIsLogin(v => !v)} className="text-blue-600 hover:text-blue-700">
              {isLogin ? "Нужен аккаунт? Регистрация" : "Уже есть аккаунт? Войти"}
            </button>
            <Link to="/" className="text-app-muted hover:text-app">
              На главную
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
