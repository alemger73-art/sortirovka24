import { directoryRequest } from '@/lib/inspectorDirectoryApi';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Building2, ChevronDown, Clock, MapPin, MessageCircle, Phone, Search, ShieldCheck, UserRound } from 'lucide-react';
import Layout from '@/components/Layout';
import StorageImg from '@/components/StorageImg';
import { client, withRetry } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { coverageRows, emptyDirectory, findInspector, phoneDigits, phoneHref, safeHttps, type DirectoryData, type Inspector } from '@/lib/inspectorDirectory';
import '@/styles/inspectors.css';

export default function InspectorsPage() {
  const { lang } = useLanguage();
  const tr = (ru: string, kz: string) => lang === 'kz' ? kz : ru;
  const [params, setParams] = useSearchParams();
  const street = params.get('street') || params.get('q') || '';
  const house = params.get('house') || '';
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [directory, setDirectory] = useState<DirectoryData>(emptyDirectory);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({ people: false, directory: false });
  const generation = useRef(0);
  async function load() {
    const id = ++generation.current;
    setLoading(true);
    const [people, details] = await Promise.allSettled([
      withRetry(() => client.entities.inspectors.query({ sort: 'precinct_number', limit: 2000 })), directoryRequest(),
    ]);
    if (generation.current !== id) return;
    if (people.status === 'fulfilled') setInspectors(people.value.data?.items || []);
    if (details.status === 'fulfilled') setDirectory(details.value);
    setErrors({ people: people.status === 'rejected', directory: details.status === 'rejected' });
    setLoading(false);
  }
  useEffect(() => { void load(); return () => { generation.current++; }; }, []);
  function changeSearch(key: 'street' | 'house', value: string) {
    const next = new URLSearchParams(params);
    next.delete('q');
    if (key === 'house' && street) next.set('street', street);
    if (value) next.set(key,value); else next.delete(key);
    setParams(next,{replace:true});
  }
  const leaders = inspectors.filter(i => i.is_leadership).sort((a,b) => (a.leadership_order || 0)-(b.leadership_order || 0));
  const regular = inspectors.filter(i => !i.is_leadership).sort((a,b) => (a.precinct_number || '').localeCompare(b.precinct_number || '', 'ru', {numeric:true}));
  const matches = regular.map(ins => ({ins, match:findInspector(ins,street,house)})).filter(row => row.match);
  const mapUrl = safeHttps(directory.map_url);
  const source = safeHttps(directory.source_url);
  const clear = () => setParams({}, {replace:true});

  return <Layout><main className="police-page">
    <div className="police-shell">
      <Link className="police-back" to="/directory"><ArrowLeft size={16}/>{tr('Справочник района','Аудан анықтамалығы')}</Link>
      <header className="police-hero">
        <div className="police-eyebrow"><ShieldCheck size={17}/>{tr('ПОЛИЦИЯ · СОРТИРОВКА','ПОЛИЦИЯ · СҰРЫПТАУ')}</div>
        <h1>{tr('Ваш участковый.','Сіздің учаскелік инспекторыңыз.')}<br/><span>{tr('Понятно, кто и где.','Кім және қайда — түсінікті.')}</span></h1>
        <p>{tr('Найдите инспектора по своему адресу, узнайте часы приёма и свяжитесь напрямую.','Мекенжайыңыз бойынша инспекторды тауып, қабылдау уақытын біліңіз және тікелей хабарласыңыз.')}</p>
        <nav className="police-section-links" aria-label={tr('Разделы страницы','Бет бөлімдері')}>
          <a href="#find-inspector">{tr('Найти участкового','Учаскелік инспекторды табу')}</a><a href="#police-department">{tr('Отдел полиции','Полиция бөлімі')}</a><a href="#police-help">{tr('Полезно знать','Білген жөн')}</a>
        </nav>
      </header>

      <aside className="police-emergency"><div><strong>{tr('Нужна срочная помощь?','Шұғыл көмек керек пе?')}</strong><span>{tr('При опасности не ждите ответа в WhatsApp.','Қауіп төнсе, WhatsApp жауабын күтпеңіз.')}</span></div><a href="tel:102"><Phone size={18}/>102 · {tr('Полиция','Полиция')}</a></aside>

      <section id="find-inspector" className="police-search-panel">
        <div className="police-heading"><div><p className="police-kicker">01 / {tr('ВАШ АДРЕС','МЕКЕНЖАЙЫҢЫЗ')}</p><h2>{tr('Найти своего участкового','Өз учаскелік инспекторыңызды табу')}</h2></div><Search size={24}/></div>
        <div className="police-search-fields"><label>{tr('Улица','Көше')}<input type="search" autoComplete="address-line1" value={street} onChange={e => changeSearch('street',e.target.value)} placeholder={tr('Начните вводить название','Көше атауын енгізіңіз')}/></label><label>{tr('Дом','Үй')}<input value={house} onChange={e => changeSearch('house',e.target.value)} placeholder="12 / 12А" maxLength={20}/></label>{(street || house) && <button type="button" className="police-clear" onClick={clear}>{tr('Сбросить','Тазарту')}</button>}</div>
        <p className="police-muted">{tr('Одна улица может относиться к разным участкам. Укажите дом и проверьте список адресов в карточке.','Бір көше бірнеше учаскеге бөлінуі мүмкін. Үй нөмірін енгізіп, карточкадағы мекенжайларды тексеріңіз.')}</p>
      </section>
      {loading ? <p className="police-loading" role="status">{tr('Загружаем справочник…','Анықтамалық жүктелуде…')}</p> : errors.people ? <div className="police-empty" role="alert"><h3>{tr('Не удалось загрузить инспекторов','Инспекторлар тізімі жүктелмеді')}</h3><button onClick={() => void load()}>{tr('Повторить','Қайталау')}</button></div> : <>
        <div className="police-results-heading" aria-live="polite"><h2>{street ? tr('По вашему адресу','Мекенжайыңыз бойынша') : tr('Участковые инспекторы','Учаскелік инспекторлар')}</h2><span>{matches.length}</span></div>
        {matches.length ? <div className="police-card-grid">{matches.map(({ins,match}) => <InspectorCard key={ins.id} inspector={ins} tr={tr} status={street ? match === 'confirmed' ? 'confirmed' : 'possible' : undefined}/>)}</div> : <div className="police-empty"><UserRound size={28}/><h3>{tr(regular.length ? 'Адрес пока не найден' : 'Карточки инспекторов готовятся',regular.length ? 'Мекенжай әзірге табылмады' : 'Инспекторлар карточкалары дайындалуда')}</h3><p>{tr('Не будем назначать вам инспектора наугад. Уточните закрепление адреса в дежурной части.','Инспекторды болжап тағайындамаймыз. Мекенжайдың қай учаскеге жататынын кезекші бөлімнен нақтылаңыз.')}</p>{phoneDigits(directory.duty_phone) && <a className="police-call" href={phoneHref(directory.duty_phone)}>{tr('Позвонить в дежурную часть','Кезекші бөлімге қоңырау шалу')}</a>}{regular.length > 0 && <button onClick={clear}>{tr('Все инспекторы','Барлық инспекторлар')}</button>}</div>}
      </>}

      <section id="police-department" className="police-department">
        <div className="police-heading"><div><p className="police-kicker">02 / {tr('КУДА ОБРАТИТЬСЯ','ҚАЙДА ЖҮГІНУ КЕРЕК')}</p><h2>{tr('Отдел полиции','Полиция бөлімі')}</h2></div><Building2 size={26}/></div>
        {errors.directory ? <div role="alert" className="police-empty"><p>{tr('Сведения об отделе не загрузились.','Бөлім туралы ақпарат жүктелмеді.')}</p><button onClick={() => void load()}>{tr('Повторить','Қайталау')}</button></div> : <>
          {directory.department_name && <h3>{directory.department_name}</h3>}
          <div className="police-department-grid"><div className="police-facts"><div><MapPin size={20}/><div><span>{tr('Адрес отдела','Бөлім мекенжайы')}</span><strong>{directory.address || tr('Адрес добавим после уточнения','Мекенжай нақтыланғаннан кейін қосылады')}</strong>{mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer">{tr('Открыть на карте','Картадан ашу')}<ArrowUpRight size={15}/></a>}</div></div><div><Clock size={20}/><div><span>{tr('Приём граждан','Азаматтарды қабылдау')}</span><strong>{directory.reception_schedule || tr('Расписание уточняется','Кесте нақтылануда')}</strong></div></div></div>
          <div className="police-duty"><span className="police-kicker">{tr('ДЕЖУРНАЯ ЧАСТЬ','КЕЗЕКШІ БӨЛІМ')}</span><h3>{tr('Связаться с отделом','Бөлімге хабарласу')}</h3><ContactButtons phone={directory.duty_phone} whatsapp={directory.duty_whatsapp} tr={tr}/><p>{tr('По срочным происшествиям — 102.','Шұғыл оқиғалар бойынша — 102.')}</p></div></div>
          {directory.notice && <p className="police-note">{directory.notice}</p>}
          <div className="police-verification"><span>{directory.verified_on ? `${tr('Контакты проверены','Байланыстар тексерілді')}: ${directory.verified_on}` : tr('Дата проверки контактов пока не указана','Байланыстарды тексеру күні әлі көрсетілмеген')}</span>{source && <a href={source} target="_blank" rel="noopener noreferrer">{tr('Источник сведений','Ақпарат көзі')}<ArrowUpRight size={14}/></a>}</div>
        </>}
      </section>

      <section className="police-leadership"><div className="police-heading"><div><p className="police-kicker">{tr('РУКОВОДСТВО','БАСШЫЛЫҚ')}</p><h2>{tr('Начальник и руководство отдела','Бөлім бастығы мен басшылығы')}</h2></div></div>{!loading && !errors.people && (leaders.length ? <div className="police-card-grid">{leaders.map(ins => <InspectorCard key={ins.id} inspector={ins} tr={tr}/>)}</div> : <p className="police-empty">{tr('ФИО, фотография и часы приёма появятся после заполнения сведений.','Аты-жөні, фотосуреті және қабылдау уақыты ақпарат толтырылғаннан кейін көрсетіледі.')}</p>)}</section>

      <section id="police-help"><div className="police-heading"><div><p className="police-kicker">03 / {tr('ПОЛЕЗНО ЗНАТЬ','БІЛГЕН ЖӨН')}</p><h2>{tr('Коротко о важном','Маңыздысы қысқаша')}</h2></div></div>
        <div className="police-tips"><details><summary>{tr('Как подготовиться к обращению','Өтінішке қалай дайындалу керек')}<ChevronDown size={18}/></summary><p>{tr('Запишите, что произошло, где и когда. Подготовьте контакты для ответа и имеющиеся материалы. Фотографируйте только если это безопасно. Не публикуйте чужие документы и персональные данные в открытом доступе.','Не болғанын, қай жерде және қашан болғанын жазыңыз. Жауап алу үшін байланыс деректерін және қолда бар материалдарды дайындаңыз. Тек қауіпсіз жағдайда суретке түсіріңіз. Өзгелердің құжаттары мен жеке деректерін ашық жарияламаңыз.')}</p></details>
        <details><summary>{tr('Звонок, WhatsApp или личный приём?','Қоңырау, WhatsApp әлде жеке қабылдау?')}<ChevronDown size={18}/></summary><p>{tr('При срочной опасности звоните 102. Для несрочного вопроса используйте контакт инспектора или часы приёма. Сообщение в WhatsApp само по себе не подтверждает регистрацию официального обращения — уточните порядок подачи и регистрационный номер.','Шұғыл қауіп төнсе, 102 нөміріне қоңырау шалыңыз. Шұғыл емес мәселе бойынша инспекторға хабарласыңыз немесе қабылдауға барыңыз. WhatsApp хабарламасы ресми өтініштің тіркелгенін растамайды — беру тәртібі мен тіркеу нөмірін нақтылаңыз.')}</p></details>
        {!errors.directory && directory.tips.map((tip,index) => <details key={index}><summary>{tip.title}<ChevronDown size={18}/></summary><p>{tip.body}</p>{safeHttps(tip.source_url) && <a href={safeHttps(tip.source_url)} target="_blank" rel="noopener noreferrer">{tr('Открыть источник','Дереккөзді ашу')}<ArrowUpRight size={15}/></a>}</details>)}</div>
        <p className="police-footnote">{tr('Справочный раздел портала. Не заменяет официальное обращение в полицию.','Порталдың анықтамалық бөлімі. Полицияға ресми өтініш беруді алмастырмайды.')}</p>
      </section>
    </div>
  </main></Layout>;
}

type Translate = (ru: string, kz: string) => string;
function ContactButtons({phone,whatsapp,tr}: {phone?:string;whatsapp?:string;tr:Translate}) {
  const tel=phoneDigits(phone), wa=phoneDigits(whatsapp).length >= 10 ? phoneDigits(whatsapp) : '';
  return <div className="police-contacts">{tel ? <a className="police-call" href={phoneHref(phone)}><Phone size={18}/><span>{tr('Позвонить','Қоңырау шалу')}<small>{phone}</small></span></a> : <p className="police-muted">{tr('Телефон уточняется','Телефон нақтылануда')}</p>}{wa && <a className="police-whatsapp" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={19}/><span>WhatsApp<small>{whatsapp}</small></span></a>}</div>;
}
function InspectorCard({inspector:ins,tr,status}: {inspector:Inspector;tr:Translate;status?:'confirmed'|'possible'}) {
  const rows=coverageRows(ins);
  return <article className="police-person">
    <div className="police-person-top"><div className="police-photo">{ins.photo_url ? <StorageImg objectKey={ins.photo_url} alt={ins.full_name} className="police-portrait"/> : <><UserRound size={34}/><span>{tr('Фото ожидается','Фото күтілуде')}</span></>}</div><div><span className="police-person-label">{ins.is_leadership ? tr('РУКОВОДСТВО','БАСШЫЛЫҚ') : `${tr('УЧАСТОК','УЧАСКЕ')} ${ins.precinct_number || '—'}`}</span><h3>{ins.full_name}</h3><p>{ins.position || tr('Участковый инспектор полиции','Полиция учаскелік инспекторы')}</p></div></div>
    {status && <p className={`police-match ${status}`}>{status === 'confirmed' ? tr('Дом указан в закреплённых адресах','Үй бекітілген мекенжайларда көрсетілген') : tr('Уточните закрепление вашего дома','Үйіңіздің қай учаскеге жататынын нақтылаңыз')}</p>}
    <div className="police-person-facts">{ins.address && <p><MapPin size={16}/><span>{tr('Приём','Қабылдау')}: {ins.address}</span></p>}{ins.schedule && <p><Clock size={16}/><span>{ins.schedule}</span></p>}</div>
    {!ins.is_leadership && <details className="police-addresses"><summary>{tr('Закреплённые адреса','Бекітілген мекенжайлар')}<span>{rows.length}</span><ChevronDown size={17}/></summary>{rows.length ? <ul>{rows.map((row,index) => <li key={index}><strong>{row.street}</strong><span>{row.houses || tr('Номера домов уточняются','Үй нөмірлері нақтылануда')}</span></li>)}</ul> : <p>{tr('Список адресов будет добавлен.','Мекенжайлар тізімі қосылады.')}</p>}</details>}
    {ins.description && <p className="police-person-description">{ins.description}</p>}
    <ContactButtons phone={ins.phone} whatsapp={ins.whatsapp} tr={tr}/>
  </article>;
}
