import { Hono } from 'hono';
import type { Context } from 'hono';
import { eventsLimiter } from '../middleware/rateLimit';
import { db } from '../db';

export const eventsRoute = new Hono();

function getClientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return c.req.header('cf-connecting-ip') ?? 'unknown';
}

async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Buffer.from(buf).toString('hex');
}

function sanitizeString(val: unknown, maxLen: number): string | null {
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLen);
  return cleaned || null;
}

function validateMode(val: unknown): 'personal' | 'business' | null {
  return val === 'personal' || val === 'business' ? val : null;
}

function validateCategory(val: unknown): 'new-lines' | 'upgrades' | 'general' | 'fibre' | null {
  const allowed = ['new-lines', 'upgrades', 'general', 'fibre'];
  return allowed.includes(val as string) ? (val as 'new-lines' | 'upgrades' | 'general' | 'fibre') : null;
}

eventsRoute.post('/events', eventsLimiter(), async (c) => {
  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch {
    return c.body(null, 204);
  }

  if (rawBody.length > 2048) return c.body(null, 400);

  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return c.body(null, 204);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return c.body(null, 204);
    }

    const body = parsed as Record<string, unknown>;

    const mode              = validateMode(body.mode);
    const category          = validateCategory(body.category);
    const contract_type     = sanitizeString(body.contract_type, 80);
    const phone_brand       = sanitizeString(body.phone_brand, 80);
    const service_type      = sanitizeString(body.service_type, 80);
    const reached_summary   = typeof body.reached_summary === 'boolean' ? body.reached_summary : false;
    const opened_consultant = typeof body.opened_consultant === 'boolean' ? body.opened_consultant : false;
    const consultant_name   = sanitizeString(body.consultant_name, 80);

    const ip_hash = await hashIp(getClientIp(c));

    await db.query(
      `INSERT INTO events
         (mode, category, contract_type, phone_brand, service_type,
          reached_summary, opened_consultant, consultant_name, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [mode, category, contract_type, phone_brand, service_type,
       reached_summary, opened_consultant, consultant_name, ip_hash]
    );
  } catch {
    console.error('[events] insert error');
  }

  return c.body(null, 204);
});

eventsRoute.all('/events', (c) => c.body(null, 404));
