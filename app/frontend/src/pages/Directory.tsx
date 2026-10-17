import { directoryPublicCopy } from '@/lib/directoryPublicCopy';
import { directoryHelp, publicDirectorySource } from '@/lib/directoryHelp';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Phone, MapPin, Clock, ArrowUpRight, Copy, X, BookOpen, Building2, LifeBuoy, Users, ArrowRight, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { client, withRetry, sortDirectoryEntries, getDirectoryCategoryLabel } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModules } from '@/hooks/useModules';
import { emergencyContacts, emergencySource, phoneLink, httpsLink, whatsappLink, readyForDirectory, matchesEntry, type DirectoryEntry } from '@/lib/directoryContent';
import '@/styles/directory.css';
import PartnerSpotlight from '@/components/PartnerSpotlight';
import DirectoryContext from '@/components/DirectoryContext';
import GovernmentServices from '@/components/GovernmentServices';

export default function Directory() {
  const { lang, t } = useLanguage(); const kz = lang === 'kz';
  const say = (ru: string, kk: string) => kz ? kk : ru;
  const { isEnabled } = useModules();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || ''; const category = params.get('category') || '';
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const section = params.get('section');
  const view = section === 'guides' || section === 'leadership' || section === 'services' ? section : 'contacts';
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
      <span className="directory-eyebrow"><BookOpen size={16} />{say('Сортировка · справочник района', 'Сортировка · аудан анықтамалығы')}</span>
      <h1>{say('Нужная помощь.', 'Қажетті көмек.')}<br /><span>{say('Рядом с вами.', 'Сізге жақын.')}</span></h1>
      <p>{say('Службы Сортировки, руководство района и ответы на повседневные вопросы — в одном месте.', 'Сортировка қызметтері, аудан басшылығы және күнделікті сұрақтарға жауаптар — бір жерде.')}</p>
      {isEnabled('inspectors') && <Link to="/inspectors" className="directory-police-entry"><span className="directory-police-entry-icon"><ShieldCheck size={24}/></span><span><strong>{say('Полиция и участковые', 'Полиция және учаскелік инспекторлар')}</strong><small>{say('Контакты, участковые пункты и руководство', 'Байланыстар, учаскелік пункттер және басшылық')}</small></span><ArrowUpRight size={20}/></Link>}
      <Link to="/directory?section=services#government-services" className="directory-gov-entry"><LifeBuoy size={18}/>{say('Госуслуги онлайн', 'Мемлекеттік қызметтер онлайн')}<ArrowUpRight size={17}/></Link>
      <section id="directory-search" className="directory-global-search" aria-label={say('Поиск служб и руководства', 'Қызметтер мен басшылықты іздеу')}>
        <label className="directory-search"><Search size={20} /><input aria-label={say('Поиск по справочнику', 'Анықтамалықтан іздеу')} placeholder={say('Служба, вопрос, фамилия, адрес или телефон', 'Қызмет, мәселе, тегі, мекенжай немесе телефон')} value={query} onChange={e => filter('q', e.target.value)} />{query && <button aria-label={say('Очистить поиск', 'Іздеуді тазалау')} onClick={() => filter('q', '')}><X size={18} /></button>}</label>
      </section>
      <div className="directory-popular"><span>{say('Часто ищут:', 'Жиі ізделеді:')}</span>{['Мусор', 'Вода', 'Поликлиника'].map((word, i) => <button key={word} onClick={() => filter('q', word.toLowerCase())}>{kz ? ['Қоқыс', 'Су', 'Емхана'][i] : word}<ArrowUpRight size={13} /></button>)}</div>
    </div></header>
    <div className="directory-width directory-body">
      <section className="directory-emergency" aria-labelledby="emergency-heading">
        <div className="directory-section-heading"><div><h2 id="emergency-heading">{say('Если нужна срочная помощь', 'Шұғыл көмек қажет болса')}</h2><p>{say('При угрозе жизни или безопасности звоните сразу.', 'Өмірге немесе қауіпсіздікке қауіп төнсе, дереу қоңырау шалыңыз.')}</p></div></div>
        <div className="directory-emergency-grid">{emergencyContacts.map(e => <a key={e.number} href={`tel:${e.number}`} aria-label={`${e.number} ${kz ? e.kz : e.ru}`}><strong>{e.number}</strong><span className="directory-emergency-long">{kz ? e.kz : e.ru}</span><span className="directory-emergency-short">{({112: say("Спасение", "Құтқару"), 101: say("Пожар", "Өрт"), 102: say("Полиция", "Полиция"), 103: say("Скорая", "Жедел"), 104: say("Газ", "Газ")} as Record<string, string>)[e.number]}</span></a>)}</div>
        <div className="directory-source"><span>{say('Сообщите адрес и что произошло. Отвечайте на вопросы диспетчера.', 'Мекенжайды және не болғанын айтыңыз. Диспетчердің сұрақтарына жауап беріңіз.')}</span><a href={emergencySource} target="_blank" rel="noopener noreferrer">{say('Источник: gov.kz', 'Дереккөз: gov.kz')} ↗</a></div>
      </section>


      <nav className="directory-section-nav" aria-label={say('Разделы справочника', 'Анықтамалық бөлімдері')}>
        {([['contacts', Building2, say('Службы и контакты', 'Қызметтер мен байланыстар'), entries.length], ['guides', LifeBuoy, say('Куда обращаться', 'Қайда жүгіну керек'), 6], ['leadership', Users, say('Руководство района', 'Аудан басшылығы'), 5], ['services', LifeBuoy, say('Госуслуги онлайн', 'Мемлекеттік қызметтер онлайн'), 5]] as const).map(([id, Icon, label, count]) => <button key={id} aria-pressed={view === id && !query} onClick={() => { setParams(id === 'contacts' ? {} : {section: id}); }}><Icon size={19} /><span>{label}</span><small>{count}</small></button>)}
      </nav>
      {query && <p className="directory-search-note">{say('Поиск по всем разделам справочника', 'Анықтамалықтың барлық бөлімдерінен іздеу')}</p>}

      {(view !== 'services' || !!query) && <DirectoryContext kz={kz} query={query} view={query ? "all" : view === "services" ? "contacts" : view} />}
      {(view === 'services' || !!query) && <GovernmentServices kz={kz} query={query} autoScroll={view === 'services' && !query} />}
      {isEnabled('business') && query.trim().length >= 3 && /(кровл|крыш|водосток|фасад|сайдинг|шатыр|қасбет|су ағар)/i.test(query) && <PartnerSpotlight compact />}
      {(view === "contacts" || !!query) && <section id="directory-catalog" className="directory-catalog" aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">{say('Организации и службы', 'Ұйымдар мен қызметтер')}</h2>

        {!!categories.length && <div className="directory-filters" aria-label={say('Категории', 'Санаттар')}><button aria-pressed={!category} onClick={() => filter('category', '')}>{say('Все', 'Барлығы')} · {entries.length}</button>{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => filter('category', c)}>{categoryLabel(c, kz, t)} · {entries.filter(e => (e.category || 'Прочее') === c).length}</button>)}</div>}
        <div aria-live="polite">{loading ? <p className="directory-state">{t('common.loading')}</p> : error ? <div className="directory-state"><h3>{say('Не удалось загрузить контакты', 'Байланыстарды жүктеу мүмкін болмады')}</h3><p>{say('Экстренные номера выше доступны без загрузки справочника.', 'Жоғарыдағы шұғыл нөмірлер анықтамалықсыз да қолжетімді.')}</p><button onClick={() => void load()}>{say('Попробовать снова', 'Қайталап көру')}</button></div> : !filtered.length ? <div className="directory-state"><h3>{entries.length ? say('В каталоге организаций совпадений нет', 'Ұйымдар каталогында сәйкестік жоқ') : say('Контакты сейчас недоступны', 'Байланыстар қазір қолжетімсіз')}</h3><p>{entries.length ? say('Совпадения в руководстве и памятках показаны выше. Для служб попробуйте другой запрос или уберите категорию.', 'Басшылық пен нұсқаулықтардағы сәйкестіктер жоғарыда көрсетілген. Қызметтер үшін басқа сұрауды қолданыңыз немесе санатты алып тастаңыз.') : say('Для срочной помощи используйте экстренные номера выше.', 'Шұғыл көмек үшін жоғарыдағы нөмірлерді пайдаланыңыз.')}</p>{(query || category) && <button onClick={() => setParams({})}>{say('Сбросить фильтры', 'Сүзгілерді тазалау')}</button>}</div> : <>
          <p className="directory-result-count">{say('Найдено контактов', 'Табылған байланыстар')}: {filtered.length}</p>
          {groups.map(c => <section key={c} className="directory-group"><h3>{categoryLabel(c, kz, t)}</h3><div className="directory-card-grid">{filtered.filter(e => (e.category || 'Прочее') === c).map(entry => <DirectoryCard key={entry.id} entry={entry} kz={kz} />)}</div></section>)}
        </>}</div>
      </section>}
      <nav className="directory-shortcuts" aria-label={say('Смежные разделы', 'Қатысты бөлімдер')}>
        {isEnabled('transport') && <Link to="/transport"><span><strong>{say('Транспорт района', 'Аудан көлігі')}</strong><small>{say('Маршруты и остановки', 'Бағыттар мен аялдамалар')}</small></span><ArrowUpRight /></Link>}
      </nav>
      <aside className="directory-footer-note"><p>{say('Перед визитом уточните часы приёма и обслуживание вашего адреса.', 'Барар алдында қабылдау уақытын және мекенжайыңызға қызмет көрсетуді нақтылаңыз.')}</p><Link to="/report-problem">{say('Сообщить об ошибке в контактах', 'Байланыстардағы қате туралы хабарлау')} →</Link></aside>
    </div>
  </div></Layout>;
}

function DirectoryCard({ entry: e, kz }: { entry: DirectoryEntry; kz: boolean }) {
  const say = (ru: string, kk: string) => kz ? kk : ru;
  const help = directoryHelp(e, kz);
  const description = help.intro || directoryPublicCopy(e).intro;
  const phone = phoneLink(e.phone); const wa = whatsappLink(e.whatsapp);
  const source = httpsLink(publicDirectorySource(e.source_url)); const map = httpsLink(e.map_url); const website = httpsLink(publicDirectorySource(e.website));
  return <article className="directory-card">
    <div className="directory-card-top"><span className="directory-card-category">{categoryLabel(e.category || '', kz)}</span></div>
    <h4>{e.entry_name}</h4>
    {description && <p className="directory-description">{description.trim().length > 155 ? description.trim().slice(0, 155) + '…' : description.trim()}</p>}
    <dl>{e.address && <div><dt><MapPin size={17} /><span className="sr-only">{say('Адрес', 'Мекенжай')}</span></dt><dd>{e.address}</dd></div>}{e.opening_hours && <div><dt><Clock size={17} /><span className="sr-only">{say('Часы работы', 'Жұмыс уақыты')}</span></dt><dd>{e.opening_hours}</dd></div>}</dl>
    {(map || website) && <div className="directory-text-links">{map && <a href={map} target="_blank" rel="noopener noreferrer">{map.includes('2gis.kz/') ? say('Карточка 2ГИС', '2GIS карточкасы') : say('На карте', 'Картада')} ↗</a>}{website && <a href={website} target="_blank" rel="noopener noreferrer">{say('Сайт организации', 'Ұйымның сайты')} ↗</a>}</div>}
    <div className="directory-contact-actions">{phone ? <><a className="directory-call" href={phone}><Phone size={17} /><span>{displayPhone(e.phone || '')}</span></a><button aria-label={`${say('Скопировать телефон', 'Телефонды көшіру')} ${e.entry_name}`} onClick={async () => { try { await navigator.clipboard.writeText(e.phone!); toast.success(say('Номер скопирован', 'Нөмір көшірілді')); } catch { toast.error(say('Не удалось скопировать номер', 'Нөмірді көшіру мүмкін болмады')); } }}><Copy size={18} /></button></> : website ? <a className="directory-call" href={website} target="_blank" rel="noopener noreferrer">{say('Открыть сервис', 'Қызметті ашу')}<ArrowUpRight size={17} /></a> : <span>{say('Телефон уточняется', 'Телефон нақтылануда')}</span>}{wa && <a className="directory-whatsapp" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>}</div>
    {!!help.steps.length && <details className="directory-card-source directory-card-help"><summary>{say('Как обратиться', 'Қалай жүгіну керек')}<ArrowRight size={14} /></summary><div><ol>{help.steps.map(step => <li key={step}>{step}</li>)}</ol>{!!help.actions.length && <nav aria-label={say('Дополнительные контакты и услуги', 'Қосымша байланыстар мен қызметтер')}>{help.actions.map(a => a.href.startsWith('/') ? <Link key={a.href} to={a.href}>{a.label}<ArrowUpRight size={14}/></Link> : <a key={a.href} href={a.href} target={a.href.startsWith('https:') ? '_blank' : undefined} rel="noopener noreferrer">{a.label}<ArrowUpRight size={14}/></a>)}</nav>}</div></details>}
    {source && source !== map && source !== website && <a className="directory-evidence-link" href={source} target="_blank" rel="noopener noreferrer">{say('Источник', 'Дереккөз')} · {new URL(source).hostname.replace(/^www\./, '')}<ArrowUpRight size={12}/></a>}
  </article>;
}

function displayPhone(value: string) {
  if (value.startsWith('+77212')) return value.replace(/^\+7(\d{4})(\d{2})(\d{2})(\d{2})$/, '+7 ($1) $2-$3-$4');
  return value.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 ($1) $2-$3-$4');
}
function categoryLabel(value: string, kz: boolean, t?: (key: string) => string) {
  const labels: Record<string,string> = {'Акимат района':'Аудан әкімдігі','Вывоз мусора':'Қоқыс шығару','Коммунальные службы':'Коммуналдық қызметтер','Обращения и помощь':'Өтініштер мен көмек','Полиция':'Полиция','Медицина':'Медицина','Государственные услуги':'Мемлекеттік қызметтер','Социальная помощь':'Әлеуметтік көмек','Аптеки':'Дәріханалар','Образование':'Білім беру','Детские сады':'Балабақшалар','Почта':'Пошта','Культура и досуг':'Мәдениет пен демалыс','Детский досуг и спорт':'Балаларға арналған демалыс пен спорт','Нотариусы':'Нотариустар','Прочее':'Басқа'};
  return kz && labels[value] ? labels[value] : t ? getDirectoryCategoryLabel(value,t) : value;
}

