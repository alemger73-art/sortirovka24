import { apiUrl } from './config';
import type { DirectoryData } from './inspectorDirectory';

export async function directoryRequest(data?: DirectoryData): Promise<DirectoryData> {
  const headers: Record<string,string> = {};
  if (data) {
    const token = localStorage.getItem('token') || localStorage.getItem('_sp924_token') || '';
    headers.Authorization = `Bearer ${token}`;
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(apiUrl('/api/v1/inspector-directory'), { method: data ? 'PUT' : 'GET', headers, ...(data ? { body: JSON.stringify(data) } : {}) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Не удалось сохранить сведения. Проверьте поля и подключение.');
  }
  return response.json();
}
