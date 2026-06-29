import { apiUrl } from '@/lib/config';
import type { AdminSummary } from '@/lib/adminSummaryApi';

const SESSION_KEY = '_sp924_token';

function readToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY) || localStorage.getItem('token');
  } catch {
    return null;
  }
}

function toWebSocketUrl(httpUrl: string, token: string): string {
  const base = httpUrl.startsWith('http')
    ? httpUrl.replace(/^http/, 'ws').replace(/^https/, 'wss')
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${httpUrl}`;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

export interface AdminSummaryWsHandlers {
  onSummary: (data: AdminSummary) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Live admin summary over WebSocket. Auto-reconnects with backoff.
 */
export function connectAdminSummaryWs(handlers: AdminSummaryWsHandlers): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let attempt = 0;

  const RECONNECT_BASE_MS = 1500;
  const RECONNECT_MAX_MS = 30_000;

  function scheduleReconnect() {
    if (closed) return;
    handlers.onDisconnect?.();
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  function connect() {
    if (closed) return;
    const token = readToken();
    if (!token) {
      scheduleReconnect();
      return;
    }

    try {
      const url = toWebSocketUrl(apiUrl('/api/v1/admin/ws/summary'), token);
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      attempt = 0;
      handlers.onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type?: string; data?: AdminSummary };
        if (msg.type === 'summary' && msg.data) {
          handlers.onSummary(msg.data);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => {
      ws?.close();
    };

    ws.onclose = () => {
      ws = null;
      if (!closed) scheduleReconnect();
    };
  }

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}
