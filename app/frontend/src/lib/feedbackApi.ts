import { apiUrl } from './config';

export interface ReportIssuePayload {
  description: string;
  section?: string;
  contact_name?: string;
  contact_phone?: string;
  page_url?: string;
  user_agent?: string;
  screenshot_url?: string;
}

export interface ReportIssueResult {
  success: boolean;
  message: string;
}

export async function submitIssueReport(payload: ReportIssuePayload): Promise<ReportIssueResult> {
  const res = await fetch(apiUrl('/api/v1/feedback/report'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || body.message || `HTTP ${res.status}`);
  }
  return body as ReportIssueResult;
}
