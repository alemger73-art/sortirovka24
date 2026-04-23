import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { accountApi, setAccountToken } from "@/lib/accountApi";

export default function AccountAuth() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    identifier: "",
    email: "",
    phone: "",
    password: "",
    full_name: "",
    role: "user",
    accepted_agreement: true,
    accepted_privacy: true,
  });

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const res = isLogin
        ? await accountApi.login({ identifier: form.identifier, password: form.password })
        : await accountApi.register({
            email: form.email || undefined,
            phone: form.phone || undefined,
            password: form.password,
            full_name: form.full_name || undefined,
            role: form.role,
            accepted_agreement: form.accepted_agreement,
            accepted_privacy: form.accepted_privacy,
          });
      setAccountToken(res.token);
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
          <h1 className="text-2xl font-bold text-gray-900">{isLogin ? "Вход в аккаунт" : "Регистрация"}</h1>
          <p className="mt-1 text-sm text-gray-500">SORTIROVKA 24 account system</p>

          <div className="mt-5 space-y-3">
            {isLogin ? (
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="Email или телефон" value={form.identifier} onChange={e => setForm({ ...form, identifier: e.target.value })} />
            ) : (
              <>
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="Имя" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="Телефон" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                <select className="w-full rounded-xl border border-gray-200 px-3 py-2.5" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="user">user</option>
                  <option value="master">master</option>
                  <option value="driver">driver</option>
                  <option value="partner">partner</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={form.accepted_agreement} onChange={e => setForm({ ...form, accepted_agreement: e.target.checked })} />
                  Согласен с пользовательским соглашением
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={form.accepted_privacy} onChange={e => setForm({ ...form, accepted_privacy: e.target.checked })} />
                  Согласен с политикой конфиденциальности
                </label>
              </>
            )}
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
            <Link to="/cabinet" className="text-gray-500 hover:text-gray-700">
              Кабинет
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
