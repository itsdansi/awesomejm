import { sessionCsrf } from '../auth/session';
export async function request<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('X-AwesomeJM-Request', '1');
  const csrf = sessionCsrf();
  if (csrf) headers.set('X-CSRF-Token', csrf);
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'same-origin',
    headers,
  });
  if (response.status === 401 && path !== '/auth/login')
    globalThis.dispatchEvent(new Event('session-expired'));
  const data: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? data.message
        : 'The request failed.';
    throw new Error(
      Array.isArray(message) ? message.join('\n') : String(message),
    );
  }
  return schema.parse(data);
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}
