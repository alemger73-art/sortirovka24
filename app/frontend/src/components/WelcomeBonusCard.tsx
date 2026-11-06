import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Gift, X } from 'lucide-react';
import { getAccountToken } from '@/lib/accountApi';
import { track } from '@/lib/analytics';

/**
 * A guest's first reason to register: 300 bonuses, said plainly, one button.
 * Shown once, 20 seconds into a guest's visit; «Позже» or ✕ hides it for two weeks.
 * After registration the regular install banner takes over (Layout shows one or the other).
 */
const HIDDEN_UNTIL = 's24_welcome_hidden_until';
const DELAY_MS = 20000; // not on arrival: first let the visitor look around
const HIDE_DAYS = 14;

// Pages each mount their own Layout, so the 20 seconds count from the start of the visit, not of the page.
function visitStart(): number {
  try {
    const saved = Number(sessionStorage.getItem('s24_visit_started') || 0);
    if (saved) return saved;
    sessionStorage.setItem('s24_visit_started', String(Date.now()));
  } catch { /* private mode: count from this page */ }
  return Date.now();
}

export function welcomeBonusDue(): boolean {
  if (getAccountToken()) return false;
  try { return Number(localStorage.getItem(HIDDEN_UNTIL) || 0) < Date.now(); } catch { return true; }
}

export default function WelcomeBonusCard({ onClose }: { onClose: () => void }) {
  const [shown, setShown] = useState(false);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!welcomeBonusDue()) { onClose(); return; }
      setShown(true); track('welcome_bonus_shown');
    }, Math.max(1000, visitStart() + DELAY_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [onClose]);

  const hide = (kind: string) => {
    try { localStorage.setItem(HIDDEN_UNTIL, String(Date.now() + HIDE_DAYS * 86_400_000)); } catch { /* private mode */ }
    track(kind);
    onClose();
  };

  if (!shown) return null;
  return (
    <div data-testid="welcome-bonus" className="fixed inset-x-0 z-[46] p-3 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:bottom-3">
      <div className="mx-auto max-w-md rounded-3xl bg-gradient-to-br from-blue-700 to-indigo-900 p-5 text-white shadow-2xl ring-1 ring-white/10">
        <button type="button" aria-label="Закрыть" onClick={() => hide('welcome_bonus_later')} className="float-right -mr-1 -mt-1 rounded-full p-1 text-white/70 hover:text-white">
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-blue-950"><Gift className="h-6 w-6" /></span>
          <div>
            <p className="text-lg font-extrabold leading-tight">Вам 300 бонусов</p>
            <p className="text-sm text-blue-100">За регистрацию по номеру телефона — 30 секунд, без пароля.</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-blue-100">Тратятся на еду в DÄM ALEM: 1 бонус = 1 ₸ скидки.</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => { hide('welcome_bonus_click'); navigate(`/login?redirect=${encodeURIComponent(pathname + search)}`); }}
            className="flex-1 rounded-2xl bg-amber-400 px-4 py-3 text-base font-extrabold text-blue-950 hover:bg-amber-300"
          >
            Забрать 300 бонусов
          </button>
          <button type="button" onClick={() => hide('welcome_bonus_later')} className="rounded-2xl px-4 py-3 text-sm font-semibold text-blue-100 hover:bg-white/10">
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
