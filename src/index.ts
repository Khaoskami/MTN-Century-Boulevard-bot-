// Required environment variables:
// DATABASE_URL    - PostgreSQL connection string (Railway Postgres plugin, auto-injected)
// ADMIN_USERNAME  - Admin dashboard username (choose something non-obvious)
// ADMIN_PASSWORD  - Admin password (minimum 20 chars, random alphanumeric)
// SESSION_SECRET  - HMAC signing key (run: openssl rand -hex 32)
// NODE_ENV        - Set to "production" in Railway
// PORT            - Auto-injected by Railway; do not hardcode

import { Hono } from 'hono';
import { initDB } from './db';
import { securityHeaders, publicCSP } from './middleware/security';
import { eventsRoute } from './routes/events';
import { adminRoute } from './routes/admin';

const required = ['DATABASE_URL', 'SESSION_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

await initDB();

const app = new Hono();

app.use('*', securityHeaders());

// Health check — no DB query
app.get('/health', (c) => c.text('ok'));

// Serve the public bot
app.get('/', publicCSP(), async (c) => {
  return c.html(await Bun.file('public/index.html').text());
});

// Block directory traversal
app.get('/public/*', (c) => c.body(null, 404));

app.route('/api', eventsRoute);
app.route('/admin', adminRoute);

// Catch-all 404
app.all('*', (c) => c.body(null, 404));

app.onError((err, c) => {
  console.error('[server error]', err.message);
  return c.body(null, 500);
});

export default {
  port:  process.env.PORT ?? 3000,
  fetch: app.fetch,
};
