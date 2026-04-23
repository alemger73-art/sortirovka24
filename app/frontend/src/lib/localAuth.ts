export interface LocalUser {
  id: string;
  name: string;
  phone: string;
  password: string;
  email?: string;
  avatar?: string;
  themePreference?: 'light' | 'dark';
}

export interface CabinetItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  createdAt: string;
}

export interface BonusEntry {
  id: string;
  title: string;
  amount: number;
  createdAt: string;
}

export interface CabinetData {
  foodOrders: CabinetItem[];
  announcements: CabinetItem[];
  masterRequests: CabinetItem[];
  complaints: CabinetItem[];
  bonusBalance: number;
  bonusHistory: BonusEntry[];
  notificationsEnabled: boolean;
}

const USERS_KEY = 's24_users';
const CURRENT_USER_KEY = 's24_current_user_id';
const CABINET_KEY = 's24_cabinet_data';
const AUTH_EVENT = 's24-auth-changed';
export const AUTH_PROMPT_EVENT = 's24-auth-prompt';

const emptyCabinet = (): CabinetData => ({
  foodOrders: [],
  announcements: [],
  masterRequests: [],
  complaints: [],
  bonusBalance: 2450,
  bonusHistory: [
    {
      id: `b_${Date.now()}`,
      title: 'Бонус за регистрацию',
      amount: 300,
      createdAt: new Date().toISOString(),
    },
  ],
  notificationsEnabled: true,
});

export function normalizePhone(phone: string): string {
  return (phone || '').replace(/[^\d+]/g, '').trim();
}

export function isValidPhone(phone: string): boolean {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return true;
  if (digits.length === 10) return true;
  return false;
}

function readUsers(): LocalUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users: LocalUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function readCabinetMap(): Record<string, CabinetData> {
  try {
    const raw = localStorage.getItem(CABINET_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCabinetMap(data: Record<string, CabinetData>) {
  localStorage.setItem(CABINET_KEY, JSON.stringify(data));
}

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

export function onAuthChanged(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function registerLocalUser(input: {
  name: string;
  phone: string;
  password: string;
  email?: string;
}): LocalUser {
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  const password = input.password.trim();
  const email = input.email?.trim();

  if (!name) throw new Error('Введите имя');
  if (!phone) throw new Error('Введите телефон');
  if (!isValidPhone(phone)) throw new Error('Введите корректный номер телефона');
  if (!password || password.length < 4) throw new Error('Пароль должен быть не короче 4 символов');

  const users = readUsers();
  if (users.some((u) => normalizePhone(u.phone) === phone)) {
    throw new Error('Пользователь с таким номером уже зарегистрирован');
  }

  const user: LocalUser = {
    id: `u_${Date.now()}`,
    name,
    phone,
    password,
    ...(email ? { email } : {}),
  };

  users.push(user);
  writeUsers(users);

  const cabinetMap = readCabinetMap();
  if (!cabinetMap[user.id]) {
    cabinetMap[user.id] = emptyCabinet();
    writeCabinetMap(cabinetMap);
  }

  setCurrentUserId(user.id);
  return user;
}

export function loginLocalUser(phone: string, password: string): LocalUser {
  if (!isValidPhone(phone)) throw new Error('Введите корректный номер телефона');
  const normalizedPhone = normalizePhone(phone);
  const users = readUsers();
  const user = users.find((u) => normalizePhone(u.phone) === normalizedPhone);
  if (!user) throw new Error('Пользователь не найден');
  if (user.password !== password) throw new Error('Неверный пароль');
  setCurrentUserId(user.id);
  return user;
}

export function logoutLocalUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
  emitAuthChanged();
}

export function setCurrentUserId(userId: string) {
  localStorage.setItem(CURRENT_USER_KEY, userId);
  emitAuthChanged();
}

export function getCurrentUser(): LocalUser | null {
  const userId = localStorage.getItem(CURRENT_USER_KEY);
  if (!userId) return null;
  return readUsers().find((u) => u.id === userId) || null;
}

export function getCurrentUserTheme(): 'light' | 'dark' | null {
  const user = getCurrentUser();
  if (!user?.themePreference) return null;
  return user.themePreference;
}

export function setCurrentUserTheme(theme: 'light' | 'dark') {
  const user = getCurrentUser();
  if (!user) return;
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx < 0) return;
  users[idx] = { ...users[idx], themePreference: theme };
  writeUsers(users);
  emitAuthChanged();
}

export function updateCurrentUserProfile(input: {
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
}) {
  const user = getCurrentUser();
  if (!user) throw new Error('Пользователь не найден');

  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim() || '';

  if (!name) throw new Error('Введите имя');
  if (!isValidPhone(phone)) throw new Error('Введите корректный номер телефона');

  const users = readUsers();
  const hasPhoneConflict = users.some(
    (u) => u.id !== user.id && normalizePhone(u.phone) === phone
  );
  if (hasPhoneConflict) throw new Error('Этот номер уже используется');

  const idx = users.findIndex((u) => u.id === user.id);
  if (idx < 0) throw new Error('Пользователь не найден');
  users[idx] = {
    ...users[idx],
    name,
    phone,
    email: email || undefined,
    avatar: input.avatar,
  };
  writeUsers(users);
  emitAuthChanged();
}

export function changeCurrentUserPassword(currentPassword: string, newPassword: string) {
  const user = getCurrentUser();
  if (!user) throw new Error('Пользователь не найден');
  if (user.password !== currentPassword) throw new Error('Текущий пароль неверный');
  if (!newPassword || newPassword.trim().length < 4) {
    throw new Error('Новый пароль должен быть не короче 4 символов');
  }

  const users = readUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx < 0) throw new Error('Пользователь не найден');
  users[idx] = { ...users[idx], password: newPassword.trim() };
  writeUsers(users);
}

export function isLoggedIn(): boolean {
  return Boolean(getCurrentUser());
}

export function getCabinetData(userId: string): CabinetData {
  const map = readCabinetMap();
  if (!map[userId]) return emptyCabinet();
  return {
    ...emptyCabinet(),
    ...map[userId],
  };
}

export function updateCabinetData(userId: string, patch: Partial<CabinetData>) {
  const map = readCabinetMap();
  const current = getCabinetData(userId);
  map[userId] = { ...current, ...patch };
  writeCabinetMap(map);
  emitAuthChanged();
}

export function pushCabinetItem(
  section: 'foodOrders' | 'announcements' | 'masterRequests' | 'complaints',
  item: { title: string; subtitle?: string; status?: string }
) {
  const user = getCurrentUser();
  if (!user) return;
  const map = readCabinetMap();
  const base = map[user.id] || emptyCabinet();
  const next = {
    ...base,
    [section]: [{ id: `i_${Date.now()}`, ...item, createdAt: new Date().toISOString() }, ...(base[section] || [])].slice(0, 20),
  };
  map[user.id] = next;
  writeCabinetMap(map);
  emitAuthChanged();
}

export function upsertCabinetItem(
  userId: string,
  section: 'announcements' | 'masterRequests' | 'complaints',
  item: CabinetItem
) {
  const data = getCabinetData(userId);
  const list = data[section] || [];
  const index = list.findIndex((x) => x.id === item.id);
  const nextList =
    index >= 0
      ? list.map((x) => (x.id === item.id ? item : x))
      : [{ ...item, createdAt: item.createdAt || new Date().toISOString() }, ...list];
  updateCabinetData(userId, { [section]: nextList.slice(0, 20) });
}

export function deleteCabinetItem(
  userId: string,
  section: 'announcements' | 'masterRequests' | 'complaints',
  id: string
) {
  const data = getCabinetData(userId);
  const nextList = (data[section] || []).filter((x) => x.id !== id);
  updateCabinetData(userId, { [section]: nextList });
}

export function setNotificationsEnabled(userId: string, enabled: boolean) {
  updateCabinetData(userId, { notificationsEnabled: enabled });
}

export function openAuthPrompt(redirectTo = '/login') {
  window.dispatchEvent(
    new CustomEvent(AUTH_PROMPT_EVENT, {
      detail: { redirectTo },
    })
  );
}

export function requireAuthDialog(_navigate?: (path: string) => void): boolean {
  if (isLoggedIn()) return true;
  openAuthPrompt('/login');
  return false;
}
