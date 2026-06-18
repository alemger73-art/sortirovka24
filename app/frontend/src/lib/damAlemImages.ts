import { resolveImageSrc } from '@/lib/storage';

/** Stable Unsplash food photos — cropped for cards */
function img(photoId: string, w = 640): string {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${w}&h=${w}&q=85`;
}

export interface CategoryVisual {
  image: string;
  gradient: string;
  emoji: string;
  accent: string;
}

const DEFAULT_VISUAL: CategoryVisual = {
  image: img('photo-1546069901-ba9599a7e63c'),
  gradient: 'linear-gradient(160deg, rgba(255,59,48,0.92) 0%, rgba(120,20,10,0.75) 100%)',
  emoji: '🍽',
  accent: '#FF3B30',
};

export const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  'kompleksnye-obedy': {
    image: img('photo-1546837220-16e577a10b64'),
    gradient: 'linear-gradient(160deg, rgba(234,88,12,0.9) 0%, rgba(180,50,0,0.8) 100%)',
    emoji: '🍱',
    accent: '#EA580C',
  },
  'pizza-30': {
    image: img('photo-1513104890138-7c749659a591'),
    gradient: 'linear-gradient(160deg, rgba(220,38,38,0.88) 0%, rgba(127,29,29,0.82) 100%)',
    emoji: '🍕',
    accent: '#DC2626',
  },
  'pizza-35': {
    image: img('photo-1574075548507-732e12370468'),
    gradient: 'linear-gradient(160deg, rgba(239,68,68,0.9) 0%, rgba(153,27,27,0.85) 100%)',
    emoji: '🍕',
    accent: '#EF4444',
  },
  burgery: {
    image: img('photo-1568903907330-fce2b097de2d'),
    gradient: 'linear-gradient(160deg, rgba(245,158,11,0.92) 0%, rgba(180,83,9,0.85) 100%)',
    emoji: '🍔',
    accent: '#F59E0B',
  },
  donery: {
    image: img('photo-1529008753430-535306148772'),
    gradient: 'linear-gradient(160deg, rgba(16,185,129,0.9) 0%, rgba(4,120,87,0.85) 100%)',
    emoji: '🌯',
    accent: '#10B981',
  },
  zakuski: {
    image: img('photo-1573080496219-bb080dd94537'),
    gradient: 'linear-gradient(160deg, rgba(251,191,36,0.92) 0%, rgba(217,119,6,0.85) 100%)',
    emoji: '🍟',
    accent: '#FBBF24',
  },
  fastfud: {
    image: img('photo-1608038994995-12da0642bef4'),
    gradient: 'linear-gradient(160deg, rgba(249,115,22,0.92) 0%, rgba(194,65,12,0.85) 100%)',
    emoji: '🍗',
    accent: '#F97316',
  },
  shashlyki: {
    image: img('photo-1603360946367-df68a8f1357b'),
    gradient: 'linear-gradient(160deg, rgba(185,28,28,0.9) 0%, rgba(69,10,10,0.88) 100%)',
    emoji: '🔥',
    accent: '#B91C1C',
  },
  'shashlychnye-sety': {
    image: img('photo-1555939594-58d7cb561ad1'),
    gradient: 'linear-gradient(160deg, rgba(127,29,29,0.9) 0%, rgba(69,10,10,0.88) 100%)',
    emoji: '🥩',
    accent: '#991B1B',
  },
  'pervye-blyuda': {
    image: img('photo-1547592166-23ac45744acd'),
    gradient: 'linear-gradient(160deg, rgba(59,130,246,0.88) 0%, rgba(29,78,216,0.85) 100%)',
    emoji: '🍲',
    accent: '#3B82F6',
  },
  'vtorye-blyuda': {
    image: img('photo-1455619452474-d2be6336420'),
    gradient: 'linear-gradient(160deg, rgba(180,83,9,0.9) 0%, rgba(120,53,15,0.85) 100%)',
    emoji: '🍛',
    accent: '#B45309',
  },
  salaty: {
    image: img('photo-1512621776951-a57141f2eefd'),
    gradient: 'linear-gradient(160deg, rgba(34,197,94,0.9) 0%, rgba(21,128,61,0.85) 100%)',
    emoji: '🥗',
    accent: '#22C55E',
  },
  'kombo-fastfud': {
    image: img('photo-1551782450-a2132b4ba8ad'),
    gradient: 'linear-gradient(160deg, rgba(168,85,247,0.9) 0%, rgba(107,33,168,0.85) 100%)',
    emoji: '🎁',
    accent: '#A855F7',
  },
  'sety-na-kompaniyu': {
    image: img('photo-1504674900247-0877df9cc836'),
    gradient: 'linear-gradient(160deg, rgba(236,72,153,0.9) 0%, rgba(157,23,77,0.85) 100%)',
    emoji: '👨‍👩‍👧‍👦',
    accent: '#EC4899',
  },
  'molochnye-kokteyli': {
    image: img('photo-1572495617767-c9a8dd371921'),
    gradient: 'linear-gradient(160deg, rgba(244,114,182,0.9) 0%, rgba(190,24,93,0.85) 100%)',
    emoji: '🥤',
    accent: '#F472B6',
  },
  'bubble-napitki': {
    image: img('photo-1525385133511-4c8c5a059dca'),
    gradient: 'linear-gradient(160deg, rgba(192,132,252,0.9) 0%, rgba(126,34,206,0.85) 100%)',
    emoji: '🧋',
    accent: '#C084FC',
  },
  limonady: {
    image: img('photo-1621263764928-df1444446000'),
    gradient: 'linear-gradient(160deg, rgba(250,204,21,0.92) 0%, rgba(202,138,4,0.85) 100%)',
    emoji: '🍋',
    accent: '#FACC15',
  },
  napitki: {
    image: img('photo-1622483560535-466c969683c0'),
    gradient: 'linear-gradient(160deg, rgba(14,165,233,0.9) 0%, rgba(3,105,161,0.85) 100%)',
    emoji: '🥤',
    accent: '#0EA5E9',
  },
  sousy: {
    image: img('photo-1472476440900-669b58214483'),
    gradient: 'linear-gradient(160deg, rgba(161,98,7,0.9) 0%, rgba(113,63,18,0.85) 100%)',
    emoji: '🫙',
    accent: '#A16207',
  },
  dopolnitelno: {
    image: img('photo-1493777908-2c81ea774d03'),
    gradient: 'linear-gradient(160deg, rgba(113,113,122,0.88) 0%, rgba(63,63,70,0.85) 100%)',
    emoji: '➕',
    accent: '#71717A',
  },
};

/** Dish name → photo (most specific match wins) */
const DISH_PHOTO_RULES: { test: RegExp; photo: string }[] = [
  { test: /маргарит/i, photo: 'photo-1574075548507-732e12370468' },
  { test: /пепперони/i, photo: 'photo-1628846044010-44644b4c2a03' },
  { test: /гавай/i, photo: 'photo-1565299624946-b28f40a0ae38' },
  { test: /грибн/i, photo: 'photo-1513104890138-7c749659a591' },
  { test: /4\s*сезон|четыре\s*сезон/i, photo: 'photo-1565299624946-b28f40a0ae38' },
  { test: /сырн.*пиц|пиц.*сырн/i, photo: 'photo-1513104890138-7c749659a591' },
  { test: /пицц/i, photo: 'photo-1574075548507-732e12370468' },
  { test: /чизбург|бургер/i, photo: 'photo-1568903907330-fce2b097de2d' },
  { test: /донер|шаверм/i, photo: 'photo-1529008753430-535306148772' },
  { test: /люля/i, photo: 'photo-1603360946367-df68a8f1357b' },
  { test: /шашлык/i, photo: 'photo-1603360946367-df68a8f1357b' },
  { test: /картоф/i, photo: 'photo-1573080496219-bb080dd94537' },
  { test: /наггет/i, photo: 'photo-1567626830408-3bcc4b776664' },
  { test: /крыл/i, photo: 'photo-1608038994995-12da0642bef4' },
  { test: /чикен\s*фрай/i, photo: 'photo-1608038994995-12da0642bef4' },
  { test: /суп|рамен|лапша|бульон/i, photo: 'photo-1547592166-23ac45744acd' },
  { test: /салат/i, photo: 'photo-1512621776951-a57141f2eefd' },
  { test: /плов|рис|гарнир/i, photo: 'photo-1455619452474-d2be6336420' },
  { test: /коктейл/i, photo: 'photo-1572495617767-c9a8dd371921' },
  { test: /bubble|бабл/i, photo: 'photo-1525385133511-4c8c5a059dca' },
  { test: /лимонад/i, photo: 'photo-1621263764928-df1444446000' },
  { test: /cola|кола|pepsi|sprite|fanta|чай|кофе|вода|сок/i, photo: 'photo-1622483560535-466c969683c0' },
  { test: /соус|кetchup|кетчуп|майонез/i, photo: 'photo-1472476440900-669b58214483' },
  { test: /комплекс|обед/i, photo: 'photo-1546837220-16e577a10b64' },
  { test: /комбо|сет/i, photo: 'photo-1551782450-a2132b4ba8ad' },
  { test: /сырн.*палоч|лук.*кольц/i, photo: 'photo-1573080496219-bb080dd94537' },
];

export function getCategoryVisual(slug: string): CategoryVisual {
  return CATEGORY_VISUALS[slug] ?? DEFAULT_VISUAL;
}

export function getCategoryImage(slug: string): string {
  return getCategoryVisual(slug).image;
}

export interface DishImageInput {
  id: number;
  name: string;
  categorySlug?: string;
  imageUrl?: string;
}

export function resolveDamAlemItemImage(item: DishImageInput): string {
  const uploaded = resolveImageSrc(item.imageUrl || '');
  if (uploaded) return uploaded;

  const name = item.name || '';
  for (const rule of DISH_PHOTO_RULES) {
    if (rule.test.test(name)) return img(rule.photo);
  }

  if (item.categorySlug) {
    return getCategoryImage(item.categorySlug);
  }

  const variants = [
    img('photo-1546069901-ba9599a7e63c'),
    img('photo-1504674900247-0877df9cc836'),
    img('photo-1565299624946-b28f40a0ae38'),
  ];
  return variants[item.id % variants.length];
}
