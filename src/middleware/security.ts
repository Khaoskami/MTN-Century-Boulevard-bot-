import type { Context, Next } from 'hono';

export function securityHeaders() {
  return async (c: Context, next: Next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('X-XSS-Protection', '0');
    c.res.headers.set('Referrer-Policy', 'no-referrer');
    c.res.headers.set(
      'Permissions-Policy',
      'geolocation=(), camera=(), microphone=(), payment=()'
    );
    c.res.headers.delete('X-Powered-By');
  };
}

export function publicCSP() {
  return async (c: Context, next: Next) => {
    await next();
    c.res.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; ')
    );
  };
}

export function adminCSP() {
  return async (c: Context, next: Next) => {
    await next();
    c.res.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        "style-src 'unsafe-inline'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
      ].join('; ')
    );
  };
}
