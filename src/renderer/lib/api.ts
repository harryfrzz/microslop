import type { SearchResult, Settings, Status } from '../types';

export const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8765';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${DEFAULT_BACKEND_URL}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
};

export const getStatus = () => request<Status>('/status');
export const getSettings = () => request<Settings>('/settings');
export const updateSettings = (settings: Settings) => request<Settings>('/settings', { method: 'POST', body: JSON.stringify(settings) });
export const searchMemories = (query: string, filters: unknown, mode = 'hybrid') =>
  request<{ results: SearchResult[] }>('/search', { method: 'POST', body: JSON.stringify({ query, mode, topK: 10, filters }) });
export const generateAnswer = (question: string, memoryIds: string[]) =>
  request<{ answer: string; status: string; error?: string }>('/answer', { method: 'POST', body: JSON.stringify({ question, memoryIds }) });
export const deleteRange = (range: { dateFrom?: string | null; dateTo?: string | null }) =>
  request<{ deleted: number }>('/privacy/delete-range', { method: 'POST', body: JSON.stringify(range) });
export const deleteAllData = () => request<{ deleted: number }>('/privacy/delete-all', { method: 'POST' });
export const deleteLast15Minutes = () => request<{ deleted: number }>('/privacy/delete-last-15-minutes', { method: 'POST' });
export const deleteLastHour = () => request<{ deleted: number }>('/privacy/delete-last-hour', { method: 'POST' });
export const deleteToday = () => request<{ deleted: number }>('/privacy/delete-today', { method: 'POST' });
export const pauseCapture = () => request<Settings>('/privacy/pause', { method: 'POST' });
export const resumeCapture = () => request<Settings>('/privacy/resume', { method: 'POST' });
export const indexCapture = (fileOrPath: File | string, metadata: Record<string, string>) => {
  const form = new FormData();
  if (typeof fileOrPath === 'string') form.append('screenshotPath', fileOrPath);
  else form.append('screenshot', fileOrPath);
  Object.entries(metadata).forEach(([key, value]) => form.append(key, value));
  return request('/capture/index', { method: 'POST', body: form });
};
