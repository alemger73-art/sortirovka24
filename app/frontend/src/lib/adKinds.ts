/**
 * What a person can post in «Объявления» and how the form adapts to it.
 * The ann_type values match the backend (services/announcements.ANN_TYPE_SLUG).
 */
export type AdKind = 'sell' | 'buy' | 'rent' | 'services' | 'free' | 'job' | 'seek' | 'lost';
export type Bi = { ru: string; kz: string };

export interface AdKindInfo {
  kind: AdKind;
  emoji: string;
  title: Bi;
  hint: Bi;
  group: 'things' | 'work' | 'other';
  /** Label and quick chips for the price field; null = no price field. */
  price: { label: Bi; placeholder: Bi; chips: Bi[] } | null;
  titlePlaceholder: Bi;
  descPlaceholder: Bi;
  photoHint: Bi;
  /** Extra one-tap choices that are written into the description (e.g. work schedule). */
  extra?: { label: Bi; options: Bi[] };
}

const b = (ru: string, kz: string): Bi => ({ ru, kz });
const NEGOTIABLE = b('Договорная', 'Келісімді');

export const AD_KINDS: AdKindInfo[] = [
  {
    kind: 'sell', emoji: '💰', group: 'things', title: b('Продам', 'Сатамын'), hint: b('Вещи, техника, авто, стройматериалы', 'Заттар, техника, көлік, құрылыс материалдары'),
    price: { label: b('Цена, ₸', 'Бағасы, ₸'), placeholder: b('Например, 25 000', 'Мысалы, 25 000'), chips: [NEGOTIABLE] },
    titlePlaceholder: b('Например: Велосипед Stels, 26 колёса', 'Мысалы: Stels велосипеді, 26 дөңгелек'),
    descPlaceholder: b('Состояние, сколько лет пользовались, почему продаёте, можно ли торг', 'Жағдайы, қанша жыл қолданылды, неге сатасыз, саудаласуға бола ма'),
    photoHint: b('Объявления с фото смотрят в 5 раз чаще', 'Фотосы бар хабарландыруды 5 есе жиі қарайды'),
  },
  {
    kind: 'buy', emoji: '🛒', group: 'things', title: b('Куплю', 'Сатып аламын'), hint: b('Ищу вещь, технику, запчасть', 'Зат, техника, қосалқы бөлшек іздеймін'),
    price: { label: b('Бюджет, ₸', 'Бюджет, ₸'), placeholder: b('До какой суммы', 'Қай сомаға дейін'), chips: [NEGOTIABLE] },
    titlePlaceholder: b('Например: Куплю детскую коляску', 'Мысалы: Балалар арбасын сатып аламын'),
    descPlaceholder: b('Что именно ищете, в каком состоянии, когда нужно', 'Нақты не іздейсіз, қандай жағдайда, қашан керек'),
    photoHint: b('Фото не обязательно', 'Фото міндетті емес'),
  },
  {
    kind: 'job', emoji: '💼', group: 'work', title: b('Вакансия', 'Бос орын'), hint: b('Ищу сотрудника: продавец, водитель, повар…', 'Қызметкер іздеймін: сатушы, жүргізуші, аспаз…'),
    price: { label: b('Зарплата, ₸', 'Жалақы, ₸'), placeholder: b('Например, от 250 000', 'Мысалы, 250 000-нан'), chips: [b('По собеседованию', 'Сұхбат бойынша')] },
    titlePlaceholder: b('Например: Требуется продавец в магазин', 'Мысалы: Дүкенге сатушы керек'),
    descPlaceholder: b('Обязанности, требования, опыт, где находится работа', 'Міндеттері, талаптар, тәжірибе, жұмыс орны'),
    photoHint: b('Можно добавить фото места работы или логотип', 'Жұмыс орнының фотосын немесе логотипті қосуға болады'),
    extra: { label: b('График', 'Кесте'), options: [b('Полный день', 'Толық күн'), b('Сменный', 'Ауысымды'), b('Подработка', 'Қосымша жұмыс'), b('Вахта', 'Вахта'), b('Удалённо', 'Қашықтан')] },
  },
  {
    kind: 'seek', emoji: '🙋', group: 'work', title: b('Ищу работу', 'Жұмыс іздеймін'), hint: b('Расскажите о себе — работодатели сами позвонят', 'Өзіңіз туралы жазыңыз — жұмыс берушілер өздері хабарласады'),
    price: { label: b('Желаемая зарплата, ₸', 'Қалаған жалақы, ₸'), placeholder: b('Например, 200 000', 'Мысалы, 200 000'), chips: [NEGOTIABLE] },
    titlePlaceholder: b('Например: Ищу работу водителем, категория B, C', 'Мысалы: Жүргізуші жұмысын іздеймін, B, C санаты'),
    descPlaceholder: b('Опыт, навыки, возраст, когда готовы выйти', 'Тәжірибе, дағдылар, жасыңыз, қашан шыға аласыз'),
    photoHint: b('Фото не обязательно', 'Фото міндетті емес'),
    extra: { label: b('Подходит', 'Сәйкес келеді'), options: [b('Полный день', 'Толық күн'), b('Сменный', 'Ауысымды'), b('Подработка', 'Қосымша жұмыс'), b('Вахта', 'Вахта')] },
  },
  {
    kind: 'services', emoji: '🛠️', group: 'other', title: b('Услуги', 'Қызметтер'), hint: b('Ремонт, перевозки, уборка, репетитор', 'Жөндеу, тасымал, тазалау, репетитор'),
    price: { label: b('Цена, ₸', 'Бағасы, ₸'), placeholder: b('Например, от 5 000', 'Мысалы, 5 000-нан'), chips: [NEGOTIABLE] },
    titlePlaceholder: b('Например: Сантехник, выезд по Сортировке', 'Мысалы: Сантехник, Сортировка бойынша шығу'),
    descPlaceholder: b('Что делаете, опыт, когда можно позвонить', 'Не істейсіз, тәжірибе, қашан қоңырау шалуға болады'),
    photoHint: b('Фото ваших работ вызывают доверие', 'Жұмыстарыңыздың фотосы сенім тудырады'),
  },
  {
    kind: 'rent', emoji: '🔑', group: 'things', title: b('Сдам', 'Жалға беремін'), hint: b('Квартира, комната, гараж, инструмент', 'Пәтер, бөлме, гараж, құрал'),
    price: { label: b('Цена, ₸', 'Бағасы, ₸'), placeholder: b('Например, 120 000 в месяц', 'Мысалы, айына 120 000'), chips: [b('В месяц', 'Айына'), b('В сутки', 'Тәулігіне'), NEGOTIABLE] },
    titlePlaceholder: b('Например: Сдам 1-комнатную квартиру', 'Мысалы: 1 бөлмелі пәтер жалға беремін'),
    descPlaceholder: b('Что сдаёте, на какой срок, условия, что есть внутри', 'Не бересіз, қанша мерзімге, шарттары'),
    photoHint: b('Без фото квартиру почти не смотрят', 'Фотосыз пәтерді қарамайды'),
  },
  {
    kind: 'free', emoji: '🎁', group: 'things', title: b('Отдам даром', 'Тегін беремін'), hint: b('Отдам бесплатно тем, кому нужнее', 'Керек адамға тегін беремін'),
    price: null,
    titlePlaceholder: b('Например: Отдам детские вещи 2–3 года', 'Мысалы: 2–3 жасқа балалар киімін беремін'),
    descPlaceholder: b('Что отдаёте и как забрать', 'Не бересіз және қалай алуға болады'),
    photoHint: b('Фото помогут быстрее найти хозяина', 'Фото тез иесін табуға көмектеседі'),
  },
  {
    kind: 'lost', emoji: '🔎', group: 'other', title: b('Потерял / нашёл', 'Жоғалттым / таптым'), hint: b('Документы, ключи, животные, вещи', 'Құжаттар, кілттер, жануарлар, заттар'),
    price: null,
    titlePlaceholder: b('Например: Нашёл ключи у школы №…', 'Мысалы: №… мектеп маңынан кілт таптым'),
    descPlaceholder: b('Где и когда, приметы. Не пишите номера документов полностью', 'Қай жерде, қашан, белгілері. Құжат нөмірін толық жазбаңыз'),
    photoHint: b('Фото очень помогает', 'Фото көп көмектеседі'),
    extra: { label: b('Что случилось', 'Не болды'), options: [b('Потерял', 'Жоғалттым'), b('Нашёл', 'Таптым')] },
  },
];

export const AD_KIND_MAP: Record<string, AdKindInfo> = Object.fromEntries(AD_KINDS.map((k) => [k.kind, k]));

/** Filter chips on the list page. «Работа» shows both vacancies and job seekers. */
export const AD_FILTERS: { key: string; emoji: string; title: Bi; kinds: string[] }[] = [
  { key: '', emoji: '✨', title: b('Все', 'Барлығы'), kinds: [] },
  { key: 'sell', emoji: '💰', title: b('Продам', 'Сатамын'), kinds: ['sell'] },
  { key: 'job', emoji: '💼', title: b('Работа', 'Жұмыс'), kinds: ['job', 'seek'] },
  { key: 'services', emoji: '🛠️', title: b('Услуги', 'Қызметтер'), kinds: ['services'] },
  { key: 'buy', emoji: '🛒', title: b('Куплю', 'Сатып аламын'), kinds: ['buy'] },
  { key: 'rent', emoji: '🔑', title: b('Сдам', 'Жалға'), kinds: ['rent'] },
  { key: 'free', emoji: '🎁', title: b('Даром', 'Тегін'), kinds: ['free'] },
  { key: 'lost', emoji: '🔎', title: b('Потерял/нашёл', 'Жоғалған/табылған'), kinds: ['lost'] },
];

export function kindOf(ad: { ann_type?: string | null }): AdKindInfo | undefined {
  return AD_KIND_MAP[String(ad.ann_type || '')];
}

/** Digits only, Kazakhstan: 8 700… → 7700…; 700… → 7700… */
export function normalizeKzPhone(value: string): string {
  let d = (value || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('7')) d = `7${d}`;
  return d;
}

export function formatKzPhone(value: string): string {
  const d = normalizeKzPhone(value);
  if (d.length !== 11) return value;
  return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
}

/** «25000» → «25 000 ₸»; text such as «Договорная» stays as is. */
export function formatAdPrice(value?: string | null): string {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^\d[\d\s]*$/.test(v)) return `${Number(v.replace(/\s/g, '')).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;
  return v;
}
