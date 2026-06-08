import { timingSafeEqual } from 'crypto';
import { getCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';

if (!process.env.SESSION_SECRET) {
  throw new Error('Missing required env var: SESSION_SECRET');
}

const COOKIE_NAME = 'mtn_session';
const MAX_AGE_SECS = 28800; // 8 hours

let _hmacKey: CryptoKey | null = null;

async function getHmacKey(): Promise<CryptoKey> {
  if (_hmacKey) return _hmacKey;
  _hmacKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(process.env.SESSION_SECRET!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return _hmacKey;
}

async function signPayload(payload: string): Promise<string> {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Buffer.from(sig).toString('hex');
}

export async function createSessionCookie(username: string): Promise<string> {
  const expiry = Date.now() + MAX_AGE_SECS * 1000;
  const payload = Buffer.from(`${username}:${expiry}`).toString('base64url');
  const hmac = await signPayload(payload);
  return `${COOKIE_NAME}=${payload}.${hmac}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${MAX_AGE_SECS}`;
}

export async function verifySession(cookieValue: string): Promise<boolean> {
  const dotIdx = cookieValue.lastIndexOf('.');
  if (dotIdx === -1) return false;

  const payload = cookieValue.slice(0, dotIdx);
  const providedHmac = cookieValue.slice(dotIdx + 1);
  const expectedHmac = await signPayload(payload);

  const bufA = Buffer.from(providedHmac);
  const bufB = Buffer.from(expectedHmac);

  if (bufA.length !== bufB.length) {
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  if (!timingSafeEqual(bufA, bufB)) return false;

  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const colonIdx = decoded.lastIndexOf(':');
    if (colonIdx === -1) return false;
    const expiry = parseInt(decoded.slice(colonIdx + 1), 10);
    return Number.isFinite(expiry) && Date.now() < expiry;
  } catch {
    return false;
  }
}

export function adminGuard() {
  return async (c: Context, next: Next) => {
    const cookieValue = getCookie(c, COOKIE_NAME);
    if (!cookieValue || !(await verifySession(cookieValue))) {
      return c.redirect('/admin/login', 302);
    }
    await next();
  };
}
