export async function request<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, init);
  const data: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? data.message
        : 'The request failed.';
    throw new Error(
      Array.isArray(message) ? message.join(' ') : String(message),
    );
  }
  return schema.parse(data);
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}
