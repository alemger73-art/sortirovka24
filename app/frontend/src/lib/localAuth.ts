export interface LocalUser {
  id: string;
  name: string;
  phone: string;
  password: string;
  email?: string;
}

export interface CabinetData {
  foodOrders: Array<{ title: string; subtitle?: string; createdAt: string }>;
  announcements: Array<{ title: string; subtitle?: string; createdAt: string }>;
  masterRequests: Array<{ title: string; subtitle?: string; createdAt: string }>;
  complaints: Array<{ title: string; subtitle?: string; createdAt: string }>;
}

const USERS_KEY = 's24_users';
const CURRENT_USER_KEY = 's24_current_user_id';
const CABINET_KEY = 's24_cabinet_data';
const AUTH_EVENT = 's24-auth-changed';

const emptyCabinet = (): CabinetData => ({
  foodOrders: [],
  announcements: [],
  masterRequests: [],
  complaints: [],
});

export function normalizePhone(phone: string): string {
  return (phone || '').replace(/[^\d+]/g, '').trim();
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

export function isLoggedIn(): boolean {
  return Boolean(getCurrentUser());
}

export function getCabinetData(userId: string): CabinetData {
  const map = readCabinetMap();
  return map[userId] || emptyCabinet();
}

export function pushCabinetItem(
  section: keyof CabinetData,
  item: { title: string; subtitle?: string }
) {
  const user = getCurrentUser();
  if (!user) return;
  const map = readCabinetMap();
  const base = map[user.id] || emptyCabinet();
  const next = {
    ...base,
    [section]: [{ ...item, createdAt: new Date().toISOString() }, ...(base[section] || [])].slice(0, 20),
  };
  map[user.id] = next;
  writeCabinetMap(map);
}

export function requireAuthDialog(navigate: (path: string) => void): boolean {
  if (isLoggedIn()) return true;
  const goToLogin = window.confirm('Войдите или зарегистрируйтесь, чтобы выполнить это действие.');
  if (goToLogin) navigate('/login');
  return false;
}
