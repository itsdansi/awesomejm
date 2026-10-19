import { request as apiRequest } from '../shared/api';
export { errorMessage } from '../shared/api';
export function request<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  init?: RequestInit,
): Promise<T> {
  return apiRequest(`/inventory${path}`, schema, init);
}
