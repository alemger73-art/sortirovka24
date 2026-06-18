import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCircle2, LayoutDashboard, LogOut } from 'lucide-react';
import {
  getCurrentUser,
  isLoggedIn,
  onAuthChanged,
  logoutLocalUser,
  type LocalUser,
} from '@/lib/localAuth';

/**
 * Unified account panel shown inside every store's "Профиль" tab.
 * The whole app shares ONE account (registered at /account) and ONE personal
 * cabinet (/cabinet). This panel makes that obvious from any storefront instead
 * of each store looking like it has its own separate cabinet.
 */
export default function StoreProfileTab({
  accentBg = 'bg-emerald-600 hover:bg-emerald-700',
  accentText = 'text-emerald-600',
}: {
  accentBg?: string;
  accentText?: string;
}) {
  const [user, setUser] = useState<LocalUser | null>(() => getCurrentUser());
  const [logged, setLogged] = useState<boolean>(() => isLoggedIn());

  useEffect(
    () =>
      onAuthChanged(() => {
        setUser(getCurrentUser());
        setLogged(isLoggedIn());
      }),
    [],
  );

  return (
    <div className="px-4 py-8 md:py-12">
      <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-8 md:p-10 text-center space-y-4 dark:bg-[#111827] dark:border-[#1f2a3f]">
        {logged && user ? (
          <>
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="mx-auto h-20 w-20 rounded-full object-cover ring-2 ring-gray-100"
              />
            ) : (
              <UserCircle2 className="mx-auto h-20 w-20 text-gray-300" />
            )}
            <div>
              <h2 className="font-bold text-gray-900 text-lg md:text-xl dark:text-white">
                {user.name || 'Профиль'}
              </h2>
              {user.phone ? (
                <p className="text-gray-500 text-sm dark:text-slate-400">{user.phone}</p>
              ) : null}
            </div>
            <p className="text-xs text-gray-400">
              Один аккаунт для всех сервисов Сортировка24
            </p>
            <Link to="/cabinet" className="block">
              <button
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white ${accentBg}`}
              >
                <LayoutDashboard className="h-4 w-4" /> Личный кабинет
              </button>
            </Link>
            <button
              onClick={() => logoutLocalUser()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-[#2a3347] dark:text-slate-200 dark:hover:bg-[#1a2336]"
            >
              <LogOut className="h-4 w-4" /> Выйти
            </button>
          </>
        ) : (
          <>
            <UserCircle2 className="mx-auto h-20 w-20 text-gray-300" />
            <h2 className="font-bold text-gray-900 text-lg md:text-xl dark:text-white">Профиль</h2>
            <p className="text-gray-500 text-sm md:text-base dark:text-slate-400">
              Войдите в единый аккаунт Сортировка24 — один личный кабинет для всех сервисов
            </p>
            <Link to="/account" className="block">
              <button
                className={`inline-flex w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-white ${accentBg}`}
              >
                Войти
              </button>
            </Link>
            <Link to="/register" className={`block text-sm font-semibold ${accentText} hover:underline`}>
              Создать аккаунт
            </Link>
          </>
        )}
        <div>
          <Link to="/" className="text-sm text-gray-400 hover:underline">
            ← На главную Сортировка24
          </Link>
        </div>
      </div>
    </div>
  );
}
