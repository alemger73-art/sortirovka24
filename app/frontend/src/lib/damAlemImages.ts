import { resolveImageSrc } from '@/lib/storage';

/** Verified working Unsplash photo IDs (tested 2026-06) */
const PHOTOS = {
  food: 'photo-1546069901-ba9599a7e63c',
  pizza: 'photo-1513104890138-7c749659a591',
  pizzaAlt: 'photo-1565299624946-b28f40a0ae38',
  pizzaWide: 'photo-1565299507177-b0ac66763828',
  burger: 'photo-1550547660-d9450f859349',
  burgerAlt: 'photo-1567620905732-2d1ec7ab7445',
  burgerCrisp: 'photo-1586190848861-99aa4a171e90',
  doner: 'photo-1626700051175-6818013e1d4f',
  wrap: 'photo-1585238342024-78d387f4a707',
  fries: 'photo-1600891964092-4316c288032e',
  snack: 'photo-1563379091339-03b21ab4a4f8',
  chicken: 'photo-1586190848861-99aa4a171e90',
  bbq: 'photo-1555939594-58d7cb561ad1',
  steak: 'photo-1606755962773-d324e0a13086',
  soup: 'photo-1547592166-23ac45744acd',
  ramen: 'photo-1612872087720-bb876e2e67d1',
  pasta: 'photo-1551183053-bf91a1d81141',
  salad: 'photo-1512621776951-a57141f2eefd',
  spread: 'photo-1504674900247-0877df9cc836',
  shake: 'photo-1551024506-0bccd828d307',
  bubble: 'photo-1544145945-f90425340c7e',
  lemonade: 'photo-1590301157890-4810ed352733',
  drink: 'photo-1546173159-315724a31696',
  tea: 'photo-1556679343-c7306c1976bc',
  coffee: 'photo-1544787219-7f47ccb76574',
  sauce: 'photo-1563379091339-03b21ab4a4f8',
  bread: 'photo-1499636136210-6f4ee915583e',
  fish: 'photo-1559339352-11d035aa65de',
} as const;

/** Project CDN — always available, used as last-resort fallback */
export const DAM_ALEM_CDN = {
  hero: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1920&h=820&q=90',
  food: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/8455d66f-e18f-4075-9b91-972d3002381b.png',
  pizza: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/2034a1d7-1c57-40c0-8145-23816557ba5c.png',
  combo: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png',
} as const;

/** Wide appetizing hero — grilled spread, warm tones (Unsplash) */
export const DAM_ALEM_HERO_URL = DAM_ALEM_CDN.hero;

/** Alternate juicy hero for stories/marketing */
export const DAM_ALEM_HERO_ALT =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1920&h=820&q=90';

/** Old blurry logo banners — replace with food photography */
const LEGACY_HERO_URLS = new Set([
  'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-15/fe194ca1-0095-44bf-a906-e50cb844ad56.png',
]);

function isLegacyHeroUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (LEGACY_HERO_URLS.has(trimmed)) return true;
  return /fe194ca1-0095-44bf-a906-e50cb844ad56/i.test(trimmed);
}

/** Pick the best hero background: admin upload → brand photo → default food shot */
export function resolveDamAlemHeroImage(heroImage?: string, brandPhoto?: string): string {
  const candidates = [heroImage, brandPhoto].map(v => (v || '').trim()).filter(Boolean);
  for (const raw of candidates) {
    if (isLegacyHeroUrl(raw)) continue;
    const resolved = resolveImageSrc(raw) || raw;
    if (resolved && !isLegacyHeroUrl(resolved)) return resolved;
  }
  return DAM_ALEM_HERO_URL;
}

export const DAM_ALEM_IMAGE_FALLBACKS: string[] = [
  DAM_ALEM_CDN.food,
  DAM_ALEM_CDN.pizza,
  DAM_ALEM_CDN.combo,
  DAM_ALEM_CDN.hero,
];

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
  image: img(PHOTOS.food),
  gradient: 'linear-gradient(160deg, rgba(255,59,48,0.92) 0%, rgba(120,20,10,0.75) 100%)',
  emoji: '🍽',
  accent: '#FF3B30',
};

export const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  'kompleksnye-obedy': {
    image: img(PHOTOS.spread),
    gradient: 'linear-gradient(160deg, rgba(234,88,12,0.9) 0%, rgba(180,50,0,0.8) 100%)',
    emoji: '🍱',
    accent: '#EA580C',
  },
  'pizza-30': {
    image: img(PHOTOS.pizza),
    gradient: 'linear-gradient(160deg, rgba(220,38,38,0.88) 0%, rgba(127,29,29,0.82) 100%)',
    emoji: '🍕',
    accent: '#DC2626',
  },
  'pizza-35': {
    image: img(PHOTOS.pizzaAlt),
    gradient: 'linear-gradient(160deg, rgba(239,68,68,0.9) 0%, rgba(153,27,27,0.85) 100%)',
    emoji: '🍕',
    accent: '#EF4444',
  },
  burgery: {
    image: img(PHOTOS.burger),
    gradient: 'linear-gradient(160deg, rgba(245,158,11,0.92) 0%, rgba(180,83,9,0.85) 100%)',
    emoji: '🍔',
    accent: '#F59E0B',
  },
  donery: {
    image: img(PHOTOS.doner),
    gradient: 'linear-gradient(160deg, rgba(16,185,129,0.9) 0%, rgba(4,120,87,0.85) 100%)',
    emoji: '🌯',
    accent: '#10B981',
  },
  zakuski: {
    image: img(PHOTOS.fries),
    gradient: 'linear-gradient(160deg, rgba(251,191,36,0.92) 0%, rgba(217,119,6,0.85) 100%)',
    emoji: '🍟',
    accent: '#FBBF24',
  },
  fastfud: {
    image: img(PHOTOS.chicken),
    gradient: 'linear-gradient(160deg, rgba(249,115,22,0.92) 0%, rgba(194,65,12,0.85) 100%)',
    emoji: '🍗',
    accent: '#F97316',
  },
  shashlyki: {
    image: img(PHOTOS.bbq),
    gradient: 'linear-gradient(160deg, rgba(185,28,28,0.9) 0%, rgba(69,10,10,0.88) 100%)',
    emoji: '🔥',
    accent: '#B91C1C',
  },
  'shashlychnye-sety': {
    image: img(PHOTOS.steak),
    gradient: 'linear-gradient(160deg, rgba(127,29,29,0.9) 0%, rgba(69,10,10,0.88) 100%)',
    emoji: '🥩',
    accent: '#991B1B',
  },
  'pervye-blyuda': {
    image: img(PHOTOS.soup),
    gradient: 'linear-gradient(160deg, rgba(59,130,246,0.88) 0%, rgba(29,78,216,0.85) 100%)',
    emoji: '🍲',
    accent: '#3B82F6',
  },
  'vtorye-blyuda': {
    image: img(PHOTOS.pasta),
    gradient: 'linear-gradient(160deg, rgba(180,83,9,0.9) 0%, rgba(120,53,15,0.85) 100%)',
    emoji: '🍛',
    accent: '#B45309',
  },
  salaty: {
    image: img(PHOTOS.salad),
    gradient: 'linear-gradient(160deg, rgba(34,197,94,0.9) 0%, rgba(21,128,61,0.85) 100%)',
    emoji: '🥗',
    accent: '#22C55E',
  },
  'kombo-fastfud': {
    image: img(PHOTOS.spread),
    gradient: 'linear-gradient(160deg, rgba(168,85,247,0.9) 0%, rgba(107,33,168,0.85) 100%)',
    emoji: '🎁',
    accent: '#A855F7',
  },
  'sety-na-kompaniyu': {
    image: img(PHOTOS.spread),
    gradient: 'linear-gradient(160deg, rgba(236,72,153,0.9) 0%, rgba(157,23,77,0.85) 100%)',
    emoji: '👨‍👩‍👧‍👦',
    accent: '#EC4899',
  },
  'molochnye-kokteyli': {
    image: img(PHOTOS.shake),
    gradient: 'linear-gradient(160deg, rgba(244,114,182,0.9) 0%, rgba(190,24,93,0.85) 100%)',
    emoji: '🥤',
    accent: '#F472B6',
  },
  'bubble-napitki': {
    image: img(PHOTOS.bubble),
    gradient: 'linear-gradient(160deg, rgba(192,132,252,0.9) 0%, rgba(126,34,206,0.85) 100%)',
    emoji: '🧋',
    accent: '#C084FC',
  },
  limonady: {
    image: img(PHOTOS.lemonade),
    gradient: 'linear-gradient(160deg, rgba(250,204,21,0.92) 0%, rgba(202,138,4,0.85) 100%)',
    emoji: '🍋',
    accent: '#FACC15',
  },
  napitki: {
    image: img(PHOTOS.drink),
    gradient: 'linear-gradient(160deg, rgba(14,165,233,0.9) 0%, rgba(3,105,161,0.85) 100%)',
    emoji: '🥤',
    accent: '#0EA5E9',
  },
  sousy: {
    image: img(PHOTOS.sauce),
    gradient: 'linear-gradient(160deg, rgba(161,98,7,0.9) 0%, rgba(113,63,18,0.85) 100%)',
    emoji: '🫙',
    accent: '#A16207',
  },
  dopolnitelno: {
    image: img(PHOTOS.bread),
    gradient: 'linear-gradient(160deg, rgba(113,113,122,0.88) 0%, rgba(63,63,70,0.85) 100%)',
    emoji: '➕',
    accent: '#71717A',
  },
};

/** Dish name → photo (most specific match wins) */
const DISH_PHOTO_RULES: { test: RegExp; photo: string }[] = [
  { test: /маргарит/i, photo: PHOTOS.pizza },
  { test: /пепперони/i, photo: PHOTOS.pizzaAlt },
  { test: /гавай/i, photo: PHOTOS.pizzaWide },
  { test: /грибн/i, photo: PHOTOS.pizza },
  { test: /4\s*сезон|четыре\s*сезон/i, photo: PHOTOS.pizzaAlt },
  { test: /сырн.*пиц|пиц.*сырн|охотнич/i, photo: PHOTOS.pizza },
  { test: /пицц/i, photo: PHOTOS.pizzaAlt },
  { test: /чизбург|бургер/i, photo: PHOTOS.burger },
  { test: /донер|шаверм|кebab|кебаб/i, photo: PHOTOS.doner },
  { test: /люля/i, photo: PHOTOS.bbq },
  { test: /шашлык|наполеон/i, photo: PHOTOS.bbq },
  { test: /картоф/i, photo: PHOTOS.fries },
  { test: /наггет/i, photo: PHOTOS.chicken },
  { test: /крыл|чикен\s*фрай/i, photo: PHOTOS.chicken },
  { test: /том\s*ям|лапша|рамен|бульон|пельмен|окрошк|кукси/i, photo: PHOTOS.soup },
  { test: /лагман|вок/i, photo: PHOTOS.ramen },
  { test: /паста|фетучини/i, photo: PHOTOS.pasta },
  { test: /мант/i, photo: PHOTOS.pasta },
  { test: /салат|оливье|цезар|винегрет|руккол/i, photo: PHOTOS.salad },
  { test: /плов|рис|гарнир|мясо\s*по/i, photo: PHOTOS.steak },
  { test: /рыб|кревет/i, photo: PHOTOS.fish },
  { test: /коктейл|oreo|ваниль|клубнич|шоколад/i, photo: PHOTOS.shake },
  { test: /bubble|бабл/i, photo: PHOTOS.bubble },
  { test: /мохито|лимонад|арбуз|киви|манго|матча|ягод|сан\s*райз/i, photo: PHOTOS.lemonade },
  { test: /cola|кола|pepsi|sprite|fanta|фанта|спрайт|чай|fuse|gorilla|piko|пико|компот|сок|вода|флеш/i, photo: PHOTOS.drink },
  { test: /соус|ketchup|кетчуп|майонез|тар-тар|барбекю/i, photo: PHOTOS.sauce },
  { test: /лепешк|баур|шелп/i, photo: PHOTOS.bread },
  { test: /комплекс|обед/i, photo: PHOTOS.spread },
  { test: /комбо|сет|box|ассорти/i, photo: PHOTOS.spread },
  { test: /сырн.*палоч|лук.*кольц/i, photo: PHOTOS.snack },
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

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const trimmed = u.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function resolveDamAlemItemImage(item: DishImageInput): string {
  const chain = buildDamAlemImageChain(item);
  return chain[0] ?? DAM_ALEM_CDN.food;
}

export function buildDamAlemImageChain(item: DishImageInput): string[] {
  const uploaded = resolveImageSrc(item.imageUrl || '');
  const primaryCandidates: string[] = [];

  if (uploaded) primaryCandidates.push(uploaded);

  const name = item.name || '';
  for (const rule of DISH_PHOTO_RULES) {
    if (rule.test.test(name)) {
      primaryCandidates.push(img(rule.photo));
      break;
    }
  }

  if (item.categorySlug) {
    primaryCandidates.push(getCategoryImage(item.categorySlug));
  }

  const variants = [
    img(PHOTOS.food),
    img(PHOTOS.spread),
    img(PHOTOS.pizzaAlt),
  ];
  primaryCandidates.push(variants[item.id % variants.length]);

  return uniqueUrls([...primaryCandidates, ...DAM_ALEM_IMAGE_FALLBACKS]);
}

export function buildImageFallbackChain(primary: string, extra: string[] = []): string[] {
  return uniqueUrls([primary, ...extra, ...DAM_ALEM_IMAGE_FALLBACKS]);
}
