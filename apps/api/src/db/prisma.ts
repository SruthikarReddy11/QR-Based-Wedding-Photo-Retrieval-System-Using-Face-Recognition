import { PrismaClient } from '@prisma/client';
import { ENV } from '../config/env.js';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

const createFallbackProxy = (reason: string) => {
  const handler: ProxyHandler<any> = {
    get: (_target, prop) => {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return undefined;
      }
      return new Proxy((..._args: any[]) => {
        return Promise.reject(new Error(`Prisma unavailable (${reason}). Falling back to persistent store.`));
      }, handler);
    },
    apply: () => {
      return Promise.reject(new Error(`Prisma unavailable (${reason}). Falling back to persistent store.`));
    },
  };
  return new Proxy({}, handler);
};

const createPrismaClient = () => {
  try {
    const client =
      global.prismaGlobal ||
      new PrismaClient({
        log: ENV.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });

    if (ENV.NODE_ENV !== 'production') {
      global.prismaGlobal = client;
    }
    return client;
  } catch (err: any) {
    console.warn(`[Prisma] Initialization skipped (${err.message}). Using persistent JSON store.`);
    return createFallbackProxy(err.message || 'not initialized');
  }
};

export const prisma: any = createPrismaClient();

