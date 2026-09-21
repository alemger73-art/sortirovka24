const COURIER_TOKEN_KEY = 's24_dam_courier_token';

export function getCourierToken(): string {
  try {
    return localStorage.getItem(COURIER_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setCourierToken(token: string): void {
  localStorage.setItem(COURIER_TOKEN_KEY, token);
  window.dispatchEvent(new Event('s24:courier-auth-changed'));
}

export function clearCourierToken(): void {
  try {
    localStorage.removeItem(COURIER_TOKEN_KEY);
  } finally {
    window.dispatchEvent(new Event('s24:courier-auth-changed'));
  }
}
