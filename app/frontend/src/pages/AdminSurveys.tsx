/** Admin: опросы за бонусы — write a survey, launch it, read anonymous results, download them for Excel. */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, BarChart3, Download, Loader2, Pencil, Play, Plus, Square, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { surveyApi, type AdminSurvey, type Question, type QuestionType, type SurveyInput, type SurveyResults } from '@/lib/surveys';

const TYPES: Record<QuestionType, string> = {
  single: 'Один вариант', multi: 'Несколько вариантов', scale: 'Оценка от 1 до 5', text: 'Свободный ответ', check: 'Проверочный (от накрутки)',
};
const STATUS = {
  draft: ['Черновик', 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'],
  active: ['Идёт', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'],
  closed: ['Завершён', 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'],
} as const;
const field = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900';
const card = 'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900';
const blank = (type: QuestionType = 'single'): Question => ({ id: '', type, text: '', required: true, options: ['', ''], other: false });

export default function AdminSurveys() {
  const [items, setItems] = useState<AdminSurvey[] | null>(null);
  const [edit, setEdit] = useState<{ id?: number; locked: boolean; value: SurveyInput } | null>(null);
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => { surveyApi.admin.list().then((r) => setItems(r.items)).catch((e) => toast.error(e?.message || 'Не удалось загрузить')); }, []);

  async function run(key: string, fn: () => Promise<{ items: AdminSurvey[] }>, ok: string) {
    setBusy(key);
    try { setItems((await fn()).items); toast.success(ok); return true; }
    catch (e: any) { toast.error(e?.message || 'Не получилось'); return false; }
    finally { setBusy(''); }
  }
  async function showResults(id: number) {
    setBusy(`r${id}`);
    try { setResults(await surveyApi.admin.results(id)); setEdit(null); window.scrollTo({ top: 0 }); }
    catch (e: any) { toast.error(e?.message || 'Не получилось'); } finally { setBusy(''); }
  }
  const startEdit = (s?: AdminSurvey, copy = false) => {
    setResults(null);
    setEdit(s
      ? { id: copy ? undefined : s.id, locked: !copy && s.counts.total > 0,
          value: { title: copy ? `${s.title} (копия)` : s.title, intro: s.intro, reward: s.reward, max_rewards: s.max_rewards, questions: s.questions } }
      : { locked: false, value: { title: '', intro: '', reward: 500, max_rewards: null, questions: [blank()] } });
    window.scrollTo({ top: 0 });
  };
  async function save() {
    if (!edit) return;
    const ok = await run('save', () => (edit.id ? surveyApi.admin.update(edit.id, edit.value) : surveyApi.admin.create(edit.value)), 'Сохранено');
    if (ok) setEdit(null);
  }

  if (!items) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  if (results) return <Results data={results} onClose={() => setResults(null)} />;
  if (edit) return <Editor state={edit} onChange={(value) => setEdit({ ...edit, value })} onSave={() => void save()} onCancel={() => setEdit(null)} saving={busy === 'save'} />;

  return (
    <div className="space-y-4" data-testid="admin-surveys">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-semibold">Как это работает</p>
        <p className="mt-1">Житель с подтверждённым телефоном проходит опрос один раз и сразу получает бонусы в DÄM ALEM — они сгорают через 30 дней. Слишком быстрые ответы и ответы с ошибкой в проверочном вопросе бонус не получают и в результаты не входят. Вы видите только общие цифры — без имён и телефонов.</p>
        <p className="mt-2">Запущенный опрос появляется на странице <a className="font-semibold underline" href="/surveys" target="_blank" rel="noreferrer">sortirovka24.kz/surveys</a> — дайте на неё ссылку в «Сортировка Официал».</p>
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={() => startEdit()}><Plus className="mr-1 h-4 w-4" />Новый опрос</Button></div>
      <ul className="space-y-2">
        {items.map((s) => {
          const [label, tone] = STATUS[s.status];
          return (
            <li key={s.id} className={card} data-testid="survey-row">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{s.title}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {s.questions.length} вопр. · бонус {s.reward}{s.max_rewards ? ` · мест с бонусом ${s.max_rewards}` : ''} ·
                    ответов <b>{s.counts.valid}</b>{s.counts.total > s.counts.valid ? ` (+${s.counts.total - s.counts.valid} не засчитано)` : ''} · выдано бонусов {s.bonus_spent.toLocaleString('ru-RU')}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {s.status !== 'active' && <Button size="sm" disabled={busy === `a${s.id}`} onClick={() => void run(`a${s.id}`, () => surveyApi.admin.status(s.id, 'active'), 'Опрос запущен')}><Play className="mr-1 h-4 w-4" />{s.status === 'closed' ? 'Запустить снова' : 'Запустить'}</Button>}
                {s.status === 'active' && <Button size="sm" variant="outline" disabled={busy === `c${s.id}`} onClick={() => void run(`c${s.id}`, () => surveyApi.admin.status(s.id, 'closed'), 'Опрос завершён')}><Square className="mr-1 h-4 w-4" />Завершить</Button>}
                {s.counts.total > 0 && <Button size="sm" variant="outline" disabled={busy === `r${s.id}`} onClick={() => void showResults(s.id)}><BarChart3 className="mr-1 h-4 w-4" />Результаты</Button>}
                <Button size="sm" variant="ghost" onClick={() => startEdit(s)}><Pencil className="mr-1 h-4 w-4" />Изменить</Button>
                {s.counts.total > 0 && <Button size="sm" variant="ghost" onClick={() => startEdit(s, true)}>Копия</Button>}
                {s.counts.total === 0 && <Button size="sm" variant="ghost" aria-label={`Удалить ${s.title}`} disabled={busy === `d${s.id}`}
                  onClick={() => { if (window.confirm(`Удалить опрос «${s.title}»?`)) void run(`d${s.id}`, () => surveyApi.admin.remove(s.id), 'Удалено'); }}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Editor({ state, onChange, onSave, onCancel, saving }: {
  state: { id?: number; locked: boolean; value: SurveyInput }; onChange: (v: SurveyInput) => void; onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  const v = state.value;
  const setQ = (i: number, patch: Partial<Question>) => onChange({ ...v, questions: v.questions.map((q, n) => (n === i ? { ...q, ...patch } : q)) });
  const move = (i: number, d: number) => {
    const qs = [...v.questions];
    [qs[i], qs[i + d]] = [qs[i + d], qs[i]];
    onChange({ ...v, questions: qs });
  };
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(); }} data-testid="survey-editor">
      <div className={`${card} space-y-3`}>
        <p className="font-semibold">{state.id ? 'Изменить опрос' : 'Новый опрос'}</p>
        <label className="block text-sm">Название<Input value={v.title} maxLength={160} onChange={(e) => onChange({ ...v, title: e.target.value })} placeholder="Например: Чего не хватает в Сортировке?" /></label>
        <label className="block text-sm">Короткое описание для жителей
          <textarea className={field} rows={2} maxLength={1000} value={v.intro} onChange={(e) => onChange({ ...v, intro: e.target.value })} placeholder="Зачем опрос и сколько займёт" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Бонус за опрос<Input inputMode="numeric" value={v.reward} onChange={(e) => onChange({ ...v, reward: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
          <label className="block text-sm">Сколько человек получат бонус (пусто — без лимита)
            <Input inputMode="numeric" value={v.max_rewards ?? ''} onChange={(e) => onChange({ ...v, max_rewards: Number(e.target.value.replace(/\D/g, '')) || null })} placeholder="например 200" /></label>
        </div>
        {v.max_rewards ? <p className="text-sm text-gray-600 dark:text-gray-400">Бюджет: до {(v.max_rewards * v.reward).toLocaleString('ru-RU')} бонусов. Когда места закончатся, опрос завершится сам.</p> : null}
      </div>

      {state.locked && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">На опрос уже ответили, поэтому вопросы менять нельзя — можно изменить название, описание и бонус. Чтобы поменять вопросы, сделайте копию.</p>}

      {v.questions.map((q, i) => (
        <fieldset key={i} disabled={state.locked} className={`${card} space-y-3`} data-testid="survey-question">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-500">Вопрос {i + 1}</span>
            <select className={`${field} ml-auto w-auto`} aria-label="Тип вопроса" value={q.type}
              onChange={(e) => { const type = e.target.value as QuestionType; setQ(i, { type, options: type === 'scale' || type === 'text' ? undefined : (q.options?.length ? q.options : ['', '']), answer: type === 'check' ? 0 : undefined }); }}>
              {Object.entries(TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <Button type="button" size="sm" variant="ghost" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" size="sm" variant="ghost" aria-label="Ниже" disabled={i === v.questions.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <Button type="button" size="sm" variant="ghost" aria-label="Удалить вопрос" disabled={v.questions.length === 1} onClick={() => onChange({ ...v, questions: v.questions.filter((_, n) => n !== i) })}><X className="h-4 w-4" /></Button>
          </div>
          <Input value={q.text} maxLength={300} aria-label="Текст вопроса" onChange={(e) => setQ(i, { text: e.target.value })}
            placeholder={q.type === 'check' ? 'Например: Проверочный вопрос: отметьте вариант «Сортировка»' : 'Текст вопроса'} />
          {(q.type === 'single' || q.type === 'multi' || q.type === 'check') && (
            <div className="space-y-2">
              {(q.options || []).map((o, n) => (
                <div key={n} className="flex items-center gap-2">
                  {q.type === 'check' && <input type="radio" name={`ans${i}`} aria-label="Правильный вариант" checked={q.answer === n} onChange={() => setQ(i, { answer: n })} />}
                  <Input value={o} maxLength={120} aria-label={`Вариант ${n + 1}`} placeholder={`Вариант ${n + 1}`}
                    onChange={(e) => setQ(i, { options: q.options!.map((x, m) => (m === n ? e.target.value : x)) })} />
                  <Button type="button" size="sm" variant="ghost" aria-label="Убрать вариант" disabled={(q.options || []).length <= 2}
                    onClick={() => setQ(i, { options: q.options!.filter((_, m) => m !== n), answer: q.answer && q.answer >= n ? Math.max(0, q.answer - 1) : q.answer })}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              {(q.options || []).length < 12 && <Button type="button" size="sm" variant="outline" onClick={() => setQ(i, { options: [...(q.options || []), ''] })}><Plus className="mr-1 h-4 w-4" />Вариант</Button>}
              {q.type === 'check' && <p className="text-xs text-gray-500">Отметьте кружком правильный вариант. Кто ответит неверно — не получит бонус.</p>}
            </div>
          )}
          {q.type === 'scale' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={q.low || ''} maxLength={40} aria-label="Подпись к 1" placeholder="1 — Совсем нет" onChange={(e) => setQ(i, { low: e.target.value })} />
              <Input value={q.high || ''} maxLength={40} aria-label="Подпись к 5" placeholder="5 — Очень" onChange={(e) => setQ(i, { high: e.target.value })} />
            </div>
          )}
          {q.type !== 'check' && (
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} />Обязательный</label>
              {(q.type === 'single' || q.type === 'multi') && <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(q.other)} onChange={(e) => setQ(i, { other: e.target.checked })} />Поле «Свой вариант»</label>}
            </div>
          )}
        </fieldset>
      ))}
      {!state.locked && <Button type="button" variant="outline" onClick={() => onChange({ ...v, questions: [...v.questions, blank()] })}><Plus className="mr-1 h-4 w-4" />Добавить вопрос</Button>}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button>
      </div>
    </form>
  );
}

function Results({ data, onClose }: { data: SurveyResults; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  async function csv() {
    setDownloading(true);
    try { await surveyApi.admin.csv(data.survey.id); } catch (e: any) { toast.error(e?.message || 'Не получилось'); } finally { setDownloading(false); }
  }
  const rejected = data.rejected.too_fast + data.rejected.check_failed;
  return (
    <div className="space-y-4" data-testid="survey-results">
      <div className="flex flex-wrap items-start gap-2">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="text-lg font-semibold">{data.survey.title}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Засчитано ответов: <b>{data.counts.valid}</b> · бонус получили {data.counts.rewarded}
            {rejected > 0 && <> · не засчитано {rejected} (слишком быстро — {data.rejected.too_fast}, ошибка в проверочном — {data.rejected.check_failed})</>}
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={downloading} onClick={() => void csv()}><Download className="mr-1 h-4 w-4" />Скачать для Excel</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Назад к опросам</Button>
      </div>
      {data.questions.filter((q) => q.type !== 'check').map((q, i) => {
        const max = Math.max(1, ...(q.options || []).map((o) => o.count));
        return (
          <section key={q.id} className={card}>
            <p className="font-semibold">{i + 1}. {q.text}</p>
            <p className="mb-3 text-xs text-gray-500">Ответили: {q.answered}{q.type === 'scale' && q.average != null && <> · средняя оценка <b>{q.average}</b> из 5</>}</p>
            {q.options && (
              <ul className="space-y-1.5">
                {[...q.options].sort((a, b) => (q.type === 'scale' ? 0 : b.count - a.count)).map((o) => (
                  <li key={o.label} className="text-sm">
                    <div className="flex justify-between gap-3"><span>{q.type === 'scale' ? `${o.label}${o.label === '1' ? ` — ${q.low}` : o.label === '5' ? ` — ${q.high}` : ''}` : o.label}</span>
                      <span className="tabular-nums text-gray-600 dark:text-gray-400">{o.count}{q.answered ? ` · ${Math.round((o.count / q.answered) * 100)}%` : ''}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${(o.count / max) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
            {q.texts && q.texts.length > 0 && (
              <details className="mt-3" open={q.type === 'text'}>
                <summary className="cursor-pointer text-sm font-medium">{q.type === 'text' ? 'Ответы' : 'Свои варианты'} ({q.texts.length})</summary>
                <ul className="mt-2 max-h-72 space-y-1 overflow-auto text-sm text-gray-700 dark:text-gray-300">{q.texts.map((t, n) => <li key={n} className="rounded bg-gray-50 px-2 py-1 dark:bg-gray-800">{t}</li>)}</ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
