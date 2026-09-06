/**
 * DÄM ALEM 2.0 — client-side menu section layout.
 * Does not delete or mutate catalog data; only groups active items for the vitrine.
 */

export type MenuSectionId =
  | 'hits'
  | 'combo'
  | 'ufo'
  | 'pizza'
  | 'snacks'
  | 'sauces'
  | 'drinks'
  | string;

export interface MenuSectionDef {
  id: MenuSectionId;
  label: string;
  /** Match category slug / name keywords (lowercase) */
  match?: RegExp;
  virtual?: 'hits' | 'combo';
}

/** Preferred order for sticky pills + feed sections */
export const DAM_ALEM_SECTION_ORDER: MenuSectionDef[] = [
  { id: 'hits', label: 'Хиты', virtual: 'hits' },
  { id: 'combo', label: 'Комбо', virtual: 'combo' },
  { id: 'ufo', label: 'UFO', match: /ufo|бургер|burger|doner|донер/i },
  { id: 'pizza', label: 'Пицца', match: /пицц|pizza|pitstsa/i },
  { id: 'snacks', label: 'Снеки', match: /снек|snack|фри|garnir|гарнир|закус|крыл|наггет/i },
  { id: 'sauces', label: 'Соусы', match: /соус|sauce/i },
  { id: 'drinks', label: 'Напитки', match: /напит|drink|napitk/i },
];

export interface MenuCategoryLike {
  id: number;
  name: string;
  slug?: string;
  sort_order?: number;
}

export interface MenuItemLike {
  id: number;
  category_id: number;
  is_popular?: boolean;
  is_recommended?: boolean;
  is_combo?: boolean;
  category_slug?: string;
  sort_order?: number;
}

export interface BuiltMenuSection<C extends MenuCategoryLike, I extends MenuItemLike> {
  id: string;
  label: string;
  items: I[];
  category?: C;
}

function slugOf(cat: MenuCategoryLike): string {
  return (cat.slug || cat.name || '').toLowerCase().replace(/\s+/g, '-');
}

function findCategoryForDef<C extends MenuCategoryLike>(
  def: MenuSectionDef,
  categories: C[],
  usedIds: Set<number>,
): C | undefined {
  if (!def.match) return undefined;
  return categories.find(c => {
    if (usedIds.has(c.id)) return false;
    const slug = slugOf(c);
    const name = c.name || '';
    return def.match!.test(slug) || def.match!.test(name);
  });
}

/**
 * Build ordered menu sections for the continuous feed.
 * Hits / Combo are virtual; remaining categories appear after known groups.
 */
export function buildDamAlemMenuSections<C extends MenuCategoryLike, I extends MenuItemLike>(
  categories: C[],
  items: I[],
  opts?: {
    categorySlugOf?: (cat: C) => string;
    itemCategorySlug?: (item: I) => string;
  },
): BuiltMenuSection<C, I>[] {
  const sortedCats = [...categories].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0),
  );
  const usedCatIds = new Set<number>();
  const sections: BuiltMenuSection<C, I>[] = [];

  const hits = items
    .filter(i => i.is_popular || i.is_recommended)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  if (hits.length > 0) {
    sections.push({ id: 'hits', label: 'Хиты', items: hits.slice(0, 8) });
  }

  const combos = items
    .filter(i => i.is_combo)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  if (combos.length > 0) {
    sections.push({ id: 'combo', label: 'Комбо', items: combos.slice(0, 8) });
  }

  for (const def of DAM_ALEM_SECTION_ORDER) {
    if (def.virtual) continue;
    const cat = findCategoryForDef(def, sortedCats, usedCatIds);
    if (!cat) continue;
    usedCatIds.add(cat.id);
    const sectionItems = items
      .filter(i => i.category_id === cat.id && !i.is_combo)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (sectionItems.length === 0) continue;
    // Soft vitrine cap — legacy catalog stays in DB; client shows top items first
    const cap =
      def.id === 'ufo' ? 4 : def.id === 'pizza' ? 6 : def.id === 'drinks' ? 10 : def.id === 'sauces' || def.id === 'snacks' ? 12 : 16;
    sections.push({
      id: def.id,
      label: def.label,
      items: sectionItems.slice(0, cap),
      category: cat,
    });
  }

  for (const cat of sortedCats) {
    if (usedCatIds.has(cat.id)) continue;
    const sectionItems = items
      .filter(i => i.category_id === cat.id && !i.is_combo)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (sectionItems.length === 0) continue;
    usedCatIds.add(cat.id);
    const id = opts?.categorySlugOf?.(cat) || slugOf(cat) || `cat-${cat.id}`;
    const label = (cat.name || '').replace(/^[\p{Emoji}\s]+/u, '').trim() || cat.name;
    sections.push({ id, label, items: sectionItems.slice(0, 16), category: cat });
  }

  return sections;
}

export function sectionDomId(sectionId: string): string {
  return `dam-section-${sectionId}`;
}
