import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { loginLocalUser, registerLocalUser } from "@/lib/localAuth";

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
  });
  const title = useMemo(() => (isLogin ? "Вход" : "Регистрация"), [isLogin]);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      if (isLogin) {
        loginLocalUser(form.phone, form.password);
      } else {
        registerLocalUser({
          name: form.name,
          phone: form.phone,
          password: form.password,
          email: form.email || undefined,
        });
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
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">Вход по номеру телефона и паролю</p>

          <div className="mt-5 space-y-3">
            {!isLogin && (
              <>
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="Имя" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="Email (необязательно)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </>
            )}
            <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="Телефон" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <input type="password" className="w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="Пароль" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <button onClick={submit} disabled={loading} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {loading ? "Загрузка..." : isLogin ? "Войти" : "Создать аккаунт"}
          </button>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button onClick={() => setIsLogin(v => !v)} className="text-blue-600 hover:text-blue-700">
              {isLogin ? "Нужен аккаунт? Регистрация" : "Уже есть аккаунт? Войти"}
            </button>
            <Link to="/" className="text-gray-500 hover:text-gray-700">
              На главную
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
