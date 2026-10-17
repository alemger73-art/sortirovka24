import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { accountApi, getAccountToken, type DeletionRequest } from '@/lib/accountApi';
import { humanizeApiError } from '@/lib/apiErrors';

export default function AccountDeletion() {
  const { lang } = useLanguage();
  const text = (ru: string, kz: string) => lang === 'kz' ? kz : ru;
  const [row, setRow] = useState<DeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const signedIn = Boolean(getAccountToken());
  useEffect(() => {
    if (!signedIn) { setLoading(false); return; }
    setLoading(true); setError('');
    let alive = true;
    Promise.all([accountApi.deletionStatus(), accountApi.me()]).then(([status, profile]) => {
      if (alive) { setRow(status.request); setHasPassword(Boolean(profile.has_password)); }
    }).catch(e => { if (alive) setError(humanizeApiError(e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [signedIn, reload]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true); setError('');
    try {
      const result = await accountApi.requestDeletion(password || undefined);
      setRow(result.request); setPassword(''); setConfirmed(false);
    } catch (e) { setError(humanizeApiError(e)); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="account-deletion-title" className="space-y-4 rounded-xl border border-red-200 p-4 dark:border-red-900">
    <h2 id="account-deletion-title" className="font-semibold">{text('Удаление аккаунта и данных', 'Аккаунт пен деректерді жою')}</h2>
    <p className="text-sm">{text('Вы можете запросить удаление аккаунта Sortirovka24 и связанных личных данных прямо здесь. Повторно писать в поддержку не нужно.', 'Sortirovka24 аккаунтын және онымен байланысты жеке деректерді жоюды осында сұрай аласыз. Қолдау қызметіне қайта жазу қажет емес.')}</p>
    <p className="text-sm">{text('Обработка — до 30 календарных дней. До завершения проверки аккаунт остаётся доступным. Незавершённые заказы не отменяются автоматически.', 'Өңдеу — 30 күнтізбелік күнге дейін. Тексеру аяқталғанша аккаунт қолжетімді. Аяқталмаған тапсырыстар автоматты түрде жойылмайды.')}</p>
    <p className="text-sm">{text('Удаляются профиль, способы входа, адреса, настройки, подписки на уведомления и пользовательские публикации. Законно необходимые записи заказов, расчётов и согласий могут храниться отдельно: основание и срок фиксируются при обработке.', 'Профиль, кіру тәсілдері, мекенжайлар, баптаулар, хабарлама жазылымдары және жарияланымдар жойылады. Заң бойынша қажетті тапсырыс, есеп айырысу және келісім жазбалары бөлек сақталуы мүмкін: негізі мен мерзімі өңдеу кезінде тіркеледі.')}</p>
    <p className="text-sm">{text('После завершения восстановить прежний аккаунт нельзя. Для вопросов о заявке:', 'Аяқталғаннан кейін бұрынғы аккаунтты қалпына келтіру мүмкін емес. Өтінім бойынша сұрақтар:')} <a className="underline" href="mailto:srt-group.24@mail.ru">srt-group.24@mail.ru</a>.</p>
    {loading ? <p role="status">{text('Загрузка…', 'Жүктелуде…')}</p> : !signedIn ? <>
      <Link className="inline-block rounded-lg bg-red-700 px-4 py-2 text-white" to="/account?redirect=%2Fdelete-account">{text('Войти и запросить удаление', 'Кіру және жоюды сұрау')}</Link>
      <p className="text-sm">{text('Если войти невозможно, отправьте запрос на указанный email с темой «Удаление аккаунта Sortirovka24». Укажите телефон или email аккаунта. Пароль, SMS-код и удостоверение личности не присылайте.', 'Кіру мүмкін болмаса, көрсетілген email-ге «Sortirovka24 аккаунтын жою» тақырыбымен сұрау жіберіңіз. Аккаунттың телефонын немесе email-ін көрсетіңіз. Құпиясөзді, SMS кодын және жеке куәлікті жібермеңіз.')}</p>
    </> : row ? <div role="status" className="rounded-lg bg-gray-100 p-3 dark:bg-gray-900">
      <p>{text('Заявка принята. Повторная отправка не нужна.', 'Өтінім қабылданды. Қайта жіберу қажет емес.')}</p>
      <p className="break-all text-sm">{text('Номер', 'Нөмірі')}: {row.id}</p>
      <p className="text-sm">{text('Плановый срок обработки', 'Жоспарланған өңдеу мерзімі')}: {new Date(row.due_at).toLocaleDateString(lang === 'kz' ? 'kk-KZ' : 'ru-RU')}</p>
    </div> : !error && <form onSubmit={submit} className="space-y-3">
      {hasPassword ? <label className="block text-sm">{text('Текущий пароль', 'Ағымдағы құпиясөз')}<input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} required className="mt-1 block w-full rounded-lg border p-2 dark:bg-gray-950" /></label> : <p className="text-sm">{text('Для подтверждения нужен вход через SMS или Google за последние 10 минут. Если сессия старше, выйдите и войдите заново.', 'Растау үшін соңғы 10 минутта SMS немесе Google арқылы кіру керек. Сессия ескі болса, шығып, қайта кіріңіз.')}</p>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} />{text('Подтверждаю запрос на удаление аккаунта и связанных данных.', 'Аккаунт пен байланысты деректерді жою сұрауын растаймын.')}</label>
      <button type="submit" disabled={busy || !confirmed || (hasPassword && !password)} className="rounded-lg bg-red-700 px-4 py-2 text-white disabled:opacity-50">{busy ? text('Отправка…', 'Жіберілуде…') : text('Запросить удаление аккаунта', 'Аккаунтты жоюды сұрау')}</button>
    </form>}
    {error && <div role="alert" className="space-y-2 text-sm text-red-600"><p>{error}</p><button type="button" className="underline" onClick={() => setReload(value => value + 1)}>{text('Повторить', 'Қайталау')}</button></div>}
  </section>;
}
