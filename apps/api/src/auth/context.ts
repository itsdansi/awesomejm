import { AsyncLocalStorage } from 'node:async_hooks';
export const staffContext = new AsyncLocalStorage<{ actorId: string }>();
