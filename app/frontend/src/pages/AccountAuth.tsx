import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, Eye, EyeOff } from "lucide-react";
import Layout from "@/components/Layout";
import LegalDocModal from "@/components/LegalDocModal";
import { PRIVACY_POLICY, USER_AGREEMENT } from "@/content/legal";
import { accountApi, setAccountToken } from "@/lib/accountApi";
import { cacheAccountProfile } from "@/lib/localAuth";

type RegStep = 1 | 2 | 3;

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

function StepIndicator({ step }: { step: RegStep }) {
  const labels = ["Данные", "SMS-код", "Пароль"];
  return (
    <div className="mb-5 flex items-center justify-between gap-1">
      {labels.map((label, i) => {
        const n = (i + 1) as RegStep;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex flex-1 flex-col items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                done
                  ? "bg-green-500 text-white"
                  : active
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : n}
            </div>
            <span className={`mt-1 text-[10px] sm:text-xs ${active ? "font-semibold text-blue-600" : "text-gray-500"}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AccountAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(location.pathname !== "/register");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [smsCode, setSmsCode] = useState("");
  const [password2, setPassword2] = useState("");
  const [smsInfo, setSmsInfo] = useState("");
  const [onScreenCode, setOnScreenCode] = useState("");
  const [regStep, setRegStep] = useState<RegStep>(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    language: "ru",
  });
  const title = useMemo(() => (isLogin ? "Вход" : "Регистрация"), [isLogin]);
  const agreementsOk = termsAccepted && privacyAccepted;

  function resetRegistration() {
    setRegStep(1);
    setSmsCode("");
    setPassword2("");
    setSmsInfo("");
    setOnScreenCode("");
    setTermsAccepted(false);
    setPrivacyAccepted(false);
    setForm((f) => ({ ...f, password: "" }));
  }

  function switchMode(toLogin: boolean) {
    setIsLogin(toLogin);
    setError("");
    resetRegistration();
  }

  async function requestSmsCode() {
    setError("");
    setSmsInfo("");
    try {
      if (!form.name.trim() || form.name.trim().length < 2) throw new Error("Введите имя (минимум 2 символа)");
      if (!form.phone.trim()) throw new Error("Введите номер телефона");
      if (!agreementsOk) throw new Error("Примите пользовательское соглашение и политику конфиденциальности");
      const res = await accountApi.requestSmsCode({ phone: form.phone });
      setRegStep(2);
      if (res.on_screen_code_hint) {
        setSmsInfo(res.on_screen_code_hint);
      } else {
        setSmsInfo(
          `Код отправлен на ${form.phone}. Действителен ${Math.floor(res.ttl_seconds / 60)} мин.`,
        );
      }
      if (res.debug_code) {
        setOnScreenCode(res.debug_code);
        if (!res.sms_pending_moderation) {
          setSmsInfo((prev) => `${prev} Код: ${res.debug_code}`);
        }
      } else if (res.sms_pending_moderation) {
        setSmsInfo(
          "SMS проходит модерацию Mobizon (1–15 мин). Если код не появился на экране — подождите и запросите код повторно.",
        );
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  function goToPasswordStep() {
    setError("");
    if (!smsCode.trim() || smsCode.trim().length < 4) {
      setError("Введите код из SMS (4 цифры)");
      return;
    }
    setRegStep(3);
  }

  async function submitLogin() {
    setLoading(true);
    setError("");
    try {
      if (!form.phone.trim()) throw new Error("Введите номер телефона");
      if (!form.password.trim()) throw new Error("Введите пароль");
      const res = await accountApi.login({ phone: form.phone, password: form.password });
      setAccountToken(res.token);
      const me = await accountApi.me();
      cacheAccountProfile({ id: me.id, name: me.name, phone: me.phone, email: me.email, avatar: me.avatar });
      navigate(getCabinetRouteByRole(res.role));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function submitRegistration() {
    setLoading(true);
    setError("");
    try {
      if (form.password.trim().length < 8) throw new Error("Пароль должен быть не короче 8 символов");
      if (form.password !== password2) throw new Error("Пароли не совпадают");
      const res = await accountApi.confirmRegistration({
        name: form.name.trim(),
        phone: form.phone,
        password: form.password,
        language: form.language,
        agreement_accepted: true,
        privacy_accepted: true,
        sms_code: smsCode.trim(),
      });
      setAccountToken(res.token);
      const me = await accountApi.me();
      cacheAccountProfile({ id: me.id, name: me.name, phone: me.phone, email: me.email, avatar: me.avatar });
      navigate(getCabinetRouteByRole(res.role));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit() {
    if (isLogin) return submitLogin();
    if (regStep === 1) return requestSmsCode();
    if (regStep === 2) return goToPasswordStep();
    return submitRegistration();
  }

  const primaryLabel = isLogin
    ? loading
      ? "Загрузка..."
      : "Войти"
    : loading
      ? "Загрузка..."
      : regStep === 1
        ? "Получить SMS-код"
        : regStep === 2
          ? "Подтвердить код"
          : "Создать аккаунт";

  return (
    <Layout>
      <LegalDocModal
        open={showTermsModal}
        title={USER_AGREEMENT.title}
        updated={USER_AGREEMENT.updated}
        sections={USER_AGREEMENT.sections}
        onClose={() => setShowTermsModal(false)}
        onAccept={() => setTermsAccepted(true)}
      />
      <LegalDocModal
        open={showPrivacyModal}
        title={PRIVACY_POLICY.title}
        updated={PRIVACY_POLICY.updated}
        sections={PRIVACY_POLICY.sections}
        onClose={() => setShowPrivacyModal(false)}
        onAccept={() => setPrivacyAccepted(true)}
      />

      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {isLogin ? "Вход по номеру телефона и паролю" : "Регистрация в 3 шага: телефон → SMS → пароль"}
          </p>

          {!isLogin ? <StepIndicator step={regStep} /> : null}

          <div className="mt-5 space-y-3">
            {/* ── LOGIN ── */}
            {isLogin ? (
              <>
                <input
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  placeholder="+7 (700) 123-45-67"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
                />
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-11 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                    placeholder="Пароль"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </>
            ) : null}

            {/* ── REG STEP 1: данные + соглашения ── */}
            {!isLogin && regStep === 1 ? (
              <>
                <input
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  placeholder="Ваше имя"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <input
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  placeholder="+7 (700) 123-45-67"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
                />
                <select
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                >
                  <option value="ru">Русский</option>
                  <option value="kz">Қазақша</option>
                </select>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Перед регистрацией прочитайте:</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:bg-gray-900 dark:text-blue-300"
                    >
                      {termsAccepted ? "✓ " : ""}Пользовательское соглашение
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPrivacyModal(true)}
                      className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:bg-gray-900 dark:text-blue-300"
                    >
                      {privacyAccepted ? "✓ " : ""}Политика конфиденциальности
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Откройте каждый документ, прокрутите до конца и нажмите «Согласен».{" "}
                    <Link to="/legal/terms" className="text-blue-600 hover:underline" target="_blank">
                      Открыть на странице
                    </Link>
                  </p>
                  {agreementsOk ? (
                    <p className="mt-2 text-xs font-medium text-green-600 dark:text-green-400">Оба документа приняты</p>
                  ) : (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Примите оба документа, чтобы продолжить</p>
                  )}
                </div>
              </>
            ) : null}

            {/* ── REG STEP 2: SMS-код ── */}
            {!isLogin && regStep === 2 ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Код отправлен на <strong>{form.phone}</strong>
                </p>
                {onScreenCode ? (
                  <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-700 dark:bg-amber-950/40">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Код для регистрации</p>
                    <p className="mt-2 text-3xl font-black tracking-[0.3em] text-amber-700 dark:text-amber-300">{onScreenCode}</p>
                    <button
                      type="button"
                      onClick={() => setSmsCode(onScreenCode)}
                      className="mt-3 text-sm font-semibold text-blue-600 hover:underline"
                    >
                      Подставить код в поле
                    </button>
                  </div>
                ) : null}
                <input
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-lg tracking-widest text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  placeholder="• • • •"
                  inputMode="numeric"
                  maxLength={6}
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                {smsInfo ? <p className="text-xs text-gray-500 dark:text-gray-400">{smsInfo}</p> : null}
                <button
                  type="button"
                  onClick={requestSmsCode}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Отправить код повторно
                </button>
                <button
                  type="button"
                  onClick={() => setRegStep(1)}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ← Изменить номер
                </button>
              </>
            ) : null}

            {/* ── REG STEP 3: пароль ── */}
            {!isLogin && regStep === 3 ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-300">Придумайте пароль для входа в личный кабинет</p>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-11 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                    placeholder="Пароль (мин. 8 символов)"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword2 ? "text" : "password"}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-11 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                    placeholder="Повторите пароль"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword2((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    {showPassword2 ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setRegStep(2)}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ← Назад к коду
                </button>
              </>
            ) : null}
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <button
            onClick={handleSubmit}
            disabled={loading || (!isLogin && regStep === 1 && !agreementsOk)}
            className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {primaryLabel}
          </button>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              onClick={() => switchMode(!isLogin)}
              className="text-blue-600 hover:text-blue-700"
            >
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
