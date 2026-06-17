/** Routes where the global mobile bottom tab bar is hidden. */
const HIDDEN_BOTTOM_NAV_PREFIXES = [
  '/admin',
  '/account',
  '/login',
  '/register',
  '/auth/callback',
  '/login/google/callback',
  '/gastronom',
  '/apteka',
  '/food/courier',
  '/food/park',
  '/legal',
];

/** Secondary sections — the «Ещё» tab stays highlighted on these paths. */
export const MORE_TAB_PREFIXES = [
  '/more',
  '/transport',
  '/directory',
  '/taxi',
  '/news',
  '/complaints',
  '/jobs',
  '/questions',
  '/cabinet',
  '/support',
  '/real-estate',
  '/inspectors',
  '/history',
  '/business',
  '/food/restaurants',
];

export function shouldShowBottomNav(pathname: string): boolean {
  return !HIDDEN_BOTTOM_NAV_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isMoreTabActive(pathname: string): boolean {
  return MORE_TAB_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
