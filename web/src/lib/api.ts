import type { MemberOverview } from './types';

const BASE = '/export-excel';

export const DOWNLOAD_URL = `${BASE}/download`;
export const EVENTS_URL = `${BASE}/api/events`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  if (!response.ok) {
    let message = 'Có lỗi xảy ra, vui lòng thử lại.';

    try {
      const body = (await response.json()) as { message?: unknown };

      if (typeof body.message === 'string') {
        message = body.message;
      }
    } catch {
      // Not JSON (e.g. a proxy error page); keep the generic message.
    }

    throw new ApiError(response.status, message);
  }

  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

export const api = {
  session: () => request<{ username: string }>('/api/session'),
  login: (username: string, password: string) =>
    request<{ username: string }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<void>('/api/logout', { method: 'POST' }),
  overview: () => request<MemberOverview>('/api/overview'),
};
