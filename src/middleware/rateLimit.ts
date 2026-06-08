import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

function createLimiter(max: number, windowSecs: number) {
  const store = new Map<string, RateLimitEntry>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now - entry.windowStart > windowSecs * 1000) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  return async (c: Context, next: Next) => {
    const ip =
      c.req.header('x-forwarded-for') ??
      c.req.header('cf-connecting-ip') ??
      'unknown';

    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now - entry.windowStart > windowSecs * 1000) {
      store.set(ip, { count: 1, windowStart: now });
      await next();
      return;
    }

    if (entry.count >= max) {
      return c.body(null, 429);
    }

    entry.count++;
    await next();
  };
}

export function eventsLimiter() {
  return createLimiter(30, 600);
}

export function loginLimiter() {
  return createLimiter(5, 900);
}
