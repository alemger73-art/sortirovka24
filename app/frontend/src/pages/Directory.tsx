import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Phone, MapPin, Clock, ArrowUpRight, Copy, X, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { client, withRetry, sortDirectoryEntries, getDirectoryCategoryLabel } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModules } from '@/hooks/useModules';
import { emergencyContacts, emergencySource, phoneLink, httpsLink, whatsappLink, readyForDirectory, matchesEntry, type DirectoryEntry } from '@/lib/directoryContent';
import '@/styles/directory.css';

export default function Directory() {
  const { lang, t } = useLanguage(); const kz = lang === 'kz';
  const say = (ru: string, kk: string) => kz ? kk : ru;
  const { isEnabled } = useModules();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || ''; const category = params.get('category') || '';
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const generation = useRef(0);
  async function load() {
    const version = ++generation.current; setLoading(true); setError(false);
    try {
      const all: DirectoryEntry[] = [];
      for (let skip = 0; ; skip += 200) {
        const result = await withRetry(() => client.entities.directory_entries.query({ sort: 'id', skip, limit: 200 }));
        const page = result.data?.items || []; all.push(...page);
        if (page.length < 200 || all.length >= (result.data?.total ?? Infinity)) break;
      }
      if (version === generation.current) setEntries(sortDirectoryEntries(all.filter(readyForDirectory)));
    } catch { if (version === generation.current) setError(true); }
    finally { if (version === generation.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { generation.current++; }; }, []);
  function filter(key: string, value: string) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); }
  const categories = useMemo(() => [...new Set(entries.map(e => e.category || 'Прочее'))], [entries]);
  const filtered = entries.filter(e => (!category || (e.category || 'Прочее') === category) && matchesEntry(e, query, getDirectoryCategoryLabel(e.category, t)));
  const groups = [...new Set(filtered.map(e => e.category || 'Прочее'))];
  return <Layout><div className="useful-directory">
    <header className="directory-hero"><div className="directory-width">
      <span className="directory-eyebrow"><BookOpen size={16} />{say('Сортировка · нужные контакты', 'Сортировка · қажетті байланыстар')}</span>
      <h1>{say('Полезный справочник', 'Пайдалы анықтамалық')}</h1>
      <p>{say('Куда позвонить, куда обратиться и как найти нужную службу.', 'Қайда қоңырау шалу, қайда жүгіну және қажетті қызметті табу.')}</p>
      <a href="#directory-search" className="directory-hero-link">{say('Найти организацию', 'Ұйымды табу')} ↓</a>
    </div></header>
    <div className="directory-width directory-body">
      <section className="directory-emergency" aria-labelledby="emergency-heading">
        <div className="directory-section-heading"><div><h2 id="emergency-heading">{say('Если нужна срочная помощь', 'Шұғыл көмек қажет болса')}</h2><p>{say('При угрозе жизни или безопасности звоните сразу.', 'Өмірге немесе қауіпсіздікке қауіп төнсе, дереу қоңырау шалыңыз.')}</p></div></div>
        <div className="directory-emergency-grid">{emergencyContacts.map(e => <a key={e.number} href={`tel:${e.number}`}><strong>{e.number}</strong><span>{kz ? e.kz : e.ru}</span></a>)}</div>
        <div className="directory-source"><span>{say('Сообщите адрес и что произошло. Отвечайте на вопросы диспетчера.', 'Мекенжайды және не болғанын айтыңыз. Диспетчердің сұрақтарына жауап беріңіз.')}</span><a href={emergencySource} target="_blank" rel="noopener noreferrer">{say('Источник: gov.kz', 'Дереккөз: gov.kz')} ↗</a></div>
      </section>
      <nav className="directory-shortcuts" aria-label={say('Смежные разделы', 'Қатысты бөлімдер')}>
        {isEnabled('inspectors') && <Link to="/inspectors"><span><strong>{say('Мой участковый', 'Менің учаскелік инспекторым')}</strong><small>{say('Найти по улице и дому', 'Көше және үй бойынша табу')}</small></span><ArrowUpRight /></Link>}
        {isEnabled('transport') && <Link to="/transport"><span><strong>{say('Транспорт района', 'Аудан көлігі')}</strong><small>{say('Маршруты и остановки', 'Бағыттар мен аялдамалар')}</small></span><ArrowUpRight /></Link>}
      </nav>
      <section id="directory-search" className="directory-catalog" aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">{say('Организации и службы', 'Ұйымдар мен қызметтер')}</h2>
        <label className="directory-search"><Search size={20} /><input aria-label={say('Поиск по справочнику', 'Анықтамалықтан іздеу')} placeholder={say('Название, адрес или телефон', 'Атауы, мекенжайы немесе телефоны')} value={query} onChange={e => filter('q', e.target.value)} />{query && <button aria-label={say('Очистить поиск', 'Іздеуді тазалау')} onClick={() => filter('q', '')}><X size={18} /></button>}</label>
        {!!categories.length && <div className="directory-filters" aria-label={say('Категории', 'Санаттар')}><button aria-pressed={!category} onClick={() => filter('category', '')}>{say('Все', 'Барлығы')} · {entries.length}</button>{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => filter('category', c)}>{getDirectoryCategoryLabel(c, t)} · {entries.filter(e => (e.category || 'Прочее') === c).length}</button>)}</div>}
        <div aria-live="polite">{loading ? <p className="directory-state">{t('common.loading')}</p> : error ? <div className="directory-state"><h3>{say('Не удалось загрузить контакты', 'Байланыстарды жүктеу мүмкін болмады')}</h3><p>{say('Экстренные номера выше доступны без загрузки справочника.', 'Жоғарыдағы шұғыл нөмірлер анықтамалықсыз да қолжетімді.')}</p><button onClick={() => void load()}>{say('Попробовать снова', 'Қайталап көру')}</button></div> : !filtered.length ? <div className="directory-state"><h3>{entries.length ? say('Ничего не найдено', 'Ештеңе табылмады') : say('Местные контакты готовятся', 'Жергілікті байланыстар дайындалуда')}</h3><p>{entries.length ? say('Попробуйте другое название или уберите категорию.', 'Басқа атауды қолданып көріңіз немесе санатты алып тастаңыз.') : say('Здесь появятся адреса и телефоны организаций района. Экстренные службы уже доступны выше.', 'Мұнда аудан ұйымдарының мекенжайлары мен телефондары пайда болады. Шұғыл қызметтер жоғарыда қолжетімді.')}</p>{(query || category) && <button onClick={() => setParams({})}>{say('Сбросить фильтры', 'Сүзгілерді тазалау')}</button>}</div> : <>
          <p className="directory-result-count">{say('Найдено контактов', 'Табылған байланыстар')}: {filtered.length}</p>
          {groups.map(c => <section key={c} className="directory-group"><h3>{getDirectoryCategoryLabel(c, t)}</h3><div className="directory-card-grid">{filtered.filter(e => (e.category || 'Прочее') === c).map(entry => <DirectoryCard key={entry.id} entry={entry} kz={kz} />)}</div></section>)}
        </>}</div>
      </section>
      <aside className="directory-footer-note"><p>{say('Перед визитом уточните часы приёма. Дата проверки и источник указаны в карточке, если редакция их добавила.', 'Барар алдында қабылдау уақытын нақтылаңыз. Редакция қосқан болса, тексеру күні мен дереккөз карточкада көрсетіледі.')}</p><Link to="/report-problem">{say('Сообщить об ошибке в контактах', 'Байланыстардағы қате туралы хабарлау')} →</Link></aside>
    </div>
  </div></Layout>;
}

function DirectoryCard({ entry: e, kz }: { entry: DirectoryEntry; kz: boolean }) {
  const say = (ru: string, kk: string) => kz ? kk : ru;
  const phone = phoneLink(e.phone); const wa = whatsappLink(e.whatsapp);
  const source = httpsLink(e.source_url); const map = httpsLink(e.map_url); const website = httpsLink(e.website);
  return <article className="directory-card">
    <h4>{e.entry_name}</h4>
    {e.description && <p className="directory-description">{e.description}</p>}
    <dl>{e.address && <div><dt><MapPin size={17} /><span className="sr-only">{say('Адрес', 'Мекенжай')}</span></dt><dd>{e.address}</dd></div>}{e.opening_hours && <div><dt><Clock size={17} /><span className="sr-only">{say('Часы работы', 'Жұмыс уақыты')}</span></dt><dd>{e.opening_hours}</dd></div>}</dl>
    {(map || website) && <div className="directory-text-links">{map && <a href={map} target="_blank" rel="noopener noreferrer">{say('На карте', 'Картада')} ↗</a>}{website && <a href={website} target="_blank" rel="noopener noreferrer">{say('Сайт организации', 'Ұйымның сайты')} ↗</a>}</div>}
    <div className="directory-contact-actions">{phone ? <><a className="directory-call" href={phone}><Phone size={17} /><span>{e.phone}</span></a><button aria-label={`${say('Скопировать телефон', 'Телефонды көшіру')} ${e.entry_name}`} onClick={async () => { try { await navigator.clipboard.writeText(e.phone!); toast.success(say('Номер скопирован', 'Нөмір көшірілді')); } catch { toast.error(say('Не удалось скопировать номер', 'Нөмірді көшіру мүмкін болмады')); } }}><Copy size={18} /></button></> : <span>{say('Телефон уточняется', 'Телефон нақтылануда')}</span>}{wa && <a className="directory-whatsapp" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>}</div>
    <div className="directory-card-source">{source ? <a href={source} target="_blank" rel="noopener noreferrer">{say('Источник сведений', 'Мәлімет дереккөзі')} ↗</a> : <span>{say('Источник пока не указан', 'Дереккөз әзірге көрсетілмеген')}</span>}{e.verified_at && source && <span>{say('Проверено редакцией', 'Редакция тексерген')}: {e.verified_at}</span>}</div>
  </article>;
}
