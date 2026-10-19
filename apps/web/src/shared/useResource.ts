import { useEffect, useState } from 'react';
import { errorMessage, request } from './api';

export function useResource<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  revision = 0,
) {
  const key = `${path}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void request(path, schema, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data, error: '' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, data: null, error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [path, schema, key]);
  return {
    loading: result?.key !== key,
    data: result?.key === key ? result.data : null,
    error: result?.key === key ? result.error : '',
  };
}
export function useDebounced(value: string) {
  const [delayed, setDelayed] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDelayed(value), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return delayed;
}
