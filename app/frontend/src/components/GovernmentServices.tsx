import { useEffect, useRef } from 'react';
import { ArrowUpRight, CalendarDays, HeartPulse, Baby, FileCheck2, MessageSquareText, Phone } from 'lucide-react';
import '@/styles/government-services.css';

const services = [
  { id: 'clinic', Icon: HeartPulse, title: ['Прикрепиться к поликлинике', 'Емханаға тіркелу'], text: ['Посмотреть условия и подать заявление о прикреплении к поликлинике.', 'Шарттарды қарап, емханаға тіркелуге өтініш беру.'], hint: ['Выберите медицинскую организацию на eGov.', 'eGov порталында медициналық ұйымды таңдаңыз.'], url: 'https://beta.egov.kz/services/3176' },
  { id: 'con', Icon: CalendarDays, title: ['Записаться в ЦОН', 'ХҚКО-ға кезек брондау'], text: ['Забронировать очередь перед посещением центра обслуживания населения.', 'Халыққа қызмет көрсету орталығына бармас бұрын кезекті брондау.'], hint: ['Выберите ЦОН, услугу и удобное время.', 'ХҚКО, қызмет пен ыңғайлы уақытты таңдаңыз.'], url: 'https://beta.egov.kz/services/3134?lang=ru' },
  { id: 'appeal', Icon: MessageSquareText, title: ['Обратиться в госорган', 'Мемлекеттік органға жүгіну'], text: ['Направить обращение в акимат или другой государственный орган через eOtinish.', 'eOtinish арқылы әкімдікке немесе басқа мемлекеттік органға өтініш жолдау.'], hint: ['Опишите ситуацию, укажите адрес и приложите фотографии при необходимости.', 'Жағдайды сипаттап, мекенжайды көрсетіңіз, қажет болса фотосуреттерді тіркеңіз.'], url: 'https://eotinish.kz/ru' },
  { id: 'children', Icon: Baby, title: ['Очередь в детский сад', 'Балабақша кезегі'], text: ['Узнать условия и способы постановки ребёнка в очередь в дошкольную организацию.', 'Баланы мектепке дейінгі ұйым кезегіне қою шарттары мен тәсілдерін білу.'], hint: ['На странице услуги указан порядок обращения.', 'Қызмет парағында өтініш беру тәртібі көрсетілген.'], url: 'https://beta.egov.kz/services/3042' },
  { id: 'license', Icon: FileCheck2, title: ['Проверить лицензию', 'Лицензияны тексеру'], text: ['Найти сведения о разрешениях и лицензиях организации или специалиста.', 'Ұйымның немесе маманның рұқсаттары мен лицензиялары туралы мәліметтерді табу.'], hint: ['Откройте официальный сервис проверки.', 'Ресми тексеру қызметін ашыңыз.'], url: 'https://beta.egov.kz/services/3173' },
] as const;

export default function GovernmentServices({ kz, query = '', autoScroll = false }: { kz: boolean; query?: string; autoScroll?: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => { if (autoScroll) { const frame = requestAnimationFrame(() => sectionRef.current?.scrollIntoView({block: 'start'})); return () => cancelAnimationFrame(frame); } }, [autoScroll]);
  const i = kz ? 1 : 0;
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const items = services.filter(s => words.every(w => [...s.title, ...s.text, ...s.hint, 'egov егов госуслуги мемлекеттік қызметтер'].join(' ').toLocaleLowerCase().includes(w)));
  if (!items.length) return null;
  return <section ref={sectionRef} id="government-services" className="government-services" aria-labelledby="government-services-heading">
    <div className="government-services-heading"><span>eGov · eOtinish</span><h2 id="government-services-heading">{kz ? 'Мемлекеттік қызметтер онлайн' : 'Госуслуги онлайн'}</h2><p>{kz ? 'Қажетті қызметті таңдаңыз. Кіру және өтініш беру ресми сайтта орындалады.' : 'Выберите нужную задачу. Вход и оформление заявления — на официальном сайте.'}</p></div>
    <div className="government-services-grid">{items.map(({id, Icon, title, text, hint, url}) => <article className="government-service-card" key={id}><div className="government-service-icon"><Icon size={23}/></div><h3>{title[i]}</h3><p>{text[i]}</p><small>{hint[i]}</small><a href={kz ? url.replace('eotinish.kz/ru', 'eotinish.kz/kk') : url} target="_blank" rel="noopener noreferrer">{kz ? (id === 'appeal' ? 'eOtinish ашу' : 'eGov ашу') : (id === 'appeal' ? 'Открыть eOtinish' : 'Открыть на eGov')}<ArrowUpRight size={17}/><span className="sr-only">{kz ? ' — жаңа қойындыда' : ' — в новой вкладке'}</span></a></article>)}</div>
    <aside className="government-services-help"><Phone size={20}/><div><strong>{kz ? 'Мемлекеттік қызмет бойынша көмек керек пе?' : 'Нужна помощь с госуслугой?'}</strong><p>{kz ? 'Бірыңғай байланыс орталығы' : 'Единый контакт-центр'}</p></div><a href="tel:1414">1414</a></aside>
  </section>;
}
