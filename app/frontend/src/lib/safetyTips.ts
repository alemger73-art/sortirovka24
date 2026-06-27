/** Tip keys in i18n (`safety.tip.*`). Rotated by day of year. */
export const SAFETY_TIP_KEYS = [
  'safety.tip.scamSms',
  'safety.tip.scamPrepay',
  'safety.tip.scamWin',
  'safety.tip.scamMeeting',
  'safety.tip.drugs',
  'safety.tip.simCards',
  'safety.tip.jobFee',
  'safety.tip.rentDeposit',
  'safety.tip.phishing',
  'safety.tip.children',
  'safety.tip.report',
  'safety.tip.alcohol',
] as const;

export type SafetyTipKey = (typeof SAFETY_TIP_KEYS)[number];

export type SafetyAlertVariant =
  | 'announcement_form'
  | 'announcement_detail'
  | 'real_estate_form'
  | 'job_form'
  | 'complaint_form';

export const SAFETY_AWARENESS_CARD_KEYS = [
  'scam',
  'drugs',
  'online',
  'emergency',
  'report',
] as const;

const HIDDEN_PREFIXES = [
  '/food',
  '/gastronom',
  '/volna',
  '/apteka',
  '/taxi',
  '/login',
  '/register',
  '/auth',
  '/admin',
  '/account',
  '/inspectors',
];

export function isSafetyTipBarHidden(pathname: string): boolean {
  return HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function pickSafetyTipKey(date = new Date()): SafetyTipKey {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return SAFETY_TIP_KEYS[dayOfYear % SAFETY_TIP_KEYS.length];
}

export const SAFETY_DISMISS_KEY = 's24_safety_tip_dismissed_until';
export const SAFETY_SESSION_TIP_KEY = 's24_safety_tip_key';
export const SAFETY_DISMISS_DAYS = 7;
