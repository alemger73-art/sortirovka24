import type { MenuProduct } from '@/lib/damMenu';

/** One line of «what is inside» for a combo card. */
export type ComboPart = { name: string; quantity: number; icon: string };

const ICONS: [RegExp, string][] = [
  [/бургер|burger/i, '🍔'],
  [/фри|картоф/i, '🍟'],
  [/пицц/i, '🍕'],
  [/нагг|крыл|стрипс/i, '🍗'],
  [/соус|кетчуп/i, '🥫'],
  [/cola|кола|пепси|спрайт|фанта|напит|сок|вода/i, '🥤'],
  [/чай/i, '🍵'],
  [/кофе/i, '☕'],
  [/коктейл/i, '🥛'],
  [/салат/i, '🥗'],
  [/манты|пельм|лагман/i, '🥟'],
];

export function partIcon(name: string): string {
  return ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? '🍽';
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Splits a combo description like «Говяжий UFO-бургер, хрустящий картофель фри, соус и Coca-Cola 0,5 л — сытный набор»
 * into parts. Only the text before the dash lists the contents; the rest is a tagline.
 */
export function partsFromDescription(description: string): ComboPart[] {
  const list = description.split(/\s[—–-]\s/)[0] ?? '';
  return list
    .split(/,(?!\d)|\sи\s|\s\+\s/)
    .map((piece) => piece.trim().replace(/\.$/, ''))
    .filter((piece) => piece.length > 1)
    .map((piece) => {
      const counted = piece.match(/^(\d+)\s*(?:шт\.?|x|×)\s*(.+)$/i) ?? piece.match(/^(.+?)\s*(?:×|x)\s*(\d+)$/i);
      const [name, quantity] = counted
        ? (/^\d/.test(counted[1]) ? [counted[2], Number(counted[1])] : [counted[1], Number(counted[2])])
        : [piece, 1];
      return { name: capitalize(name.trim()), quantity, icon: partIcon(name) };
    });
}

/** What a combo contains: the configured recipe when there is one, otherwise the list from its description. */
export function comboContents(product: MenuProduct): ComboPart[] {
  const configured = product.combo?.components ?? [];
  if (configured.length) return configured.map((p) => ({ name: p.name, quantity: p.quantity, icon: partIcon(p.name) }));
  if (!product.is_combo || !product.description) return [];
  const parts = partsFromDescription(product.description);
  return parts.length >= 2 ? parts : [];
}

/** The tagline after the dash, shown under the title instead of the whole description. */
export function comboTagline(description = ''): string {
  const [, ...rest] = description.split(/\s[—–-]\s/);
  return capitalize(rest.join(' — ').trim());
}
