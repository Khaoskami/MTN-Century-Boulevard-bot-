import { Hono } from 'hono';
import { timingSafeEqual } from 'crypto';
import { getCookie } from 'hono/cookie';
import { loginLimiter } from '../middleware/rateLimit';
import { adminCSP } from '../middleware/security';
import { adminGuard, createSessionCookie, verifySession } from '../middleware/auth';
import { db } from '../db';

if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
  throw new Error('Missing required env vars: ADMIN_USERNAME, ADMIN_PASSWORD');
}

export const adminRoute = new Hono();

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CATEGORY_LABELS: Record<string, string> = {
  'new-lines': 'New Lines',
  upgrades: 'Upgrades',
  general: 'General',
  fibre: 'Fibre',
};

function renderLogin(hasError: boolean): string {
  const errorHtml = hasError
    ? '<p style="color:#e53e3e;font-size:14px;margin-bottom:16px;">Invalid credentials.</p>'
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MTN Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#1A1A1A;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#212121;border:1px solid #333;border-radius:12px;padding:40px 36px;width:100%;max-width:380px}
h1{font-size:22px;font-weight:700;color:#FFCC00;margin-bottom:28px}
label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-bottom:8px}
input{width:100%;background:#2a2a2a;border:2px solid #363636;border-radius:8px;color:#fff;font-size:16px;padding:12px 14px;outline:none;margin-bottom:18px;font-family:system-ui,sans-serif}
input:focus{border-color:#FFCC00}
button[type="submit"]{width:100%;background:#FFCC00;color:#1A1A1A;border:none;border-radius:8px;padding:14px;font-size:16px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif}
button[type="submit"]:hover{background:#e6b800}
</style>
</head>
<body>
<div class="card">
  <h1>MTN Analytics</h1>
  ${errorHtml}<form method="POST" action="/admin/login">
    <label for="username">Username</label>
    <input type="text" id="username" name="username" autocomplete="username" required>
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required>
    <button type="submit">Sign In</button>
  </form>
</div>
</body>
</html>`;
}

interface TodayRow   { category: string; total: string; converted: string }
interface WeekRow    { category: string; total: string }
interface ModeRow    { mode: string; total: string }
interface TrendRow   { day: Date | string; category: string; total: string }

function renderDashboard(data: {
  today: TodayRow[];
  week: WeekRow[];
  mode: ModeRow[];
  trend: TrendRow[];
}): string {
  const categories = ['new-lines', 'upgrades', 'general', 'fibre'];
  const todayMap = new Map(data.today.map(r => [r.category, r]));

  const todayCards = categories.map(cat => {
    const row = todayMap.get(cat);
    const total     = row ? parseInt(row.total, 10) : 0;
    const converted = row ? parseInt(row.converted, 10) : 0;
    const pct       = total > 0 ? Math.round((converted / total) * 100) : 0;
    const label     = CATEGORY_LABELS[cat] ?? cat;
    return `<div class="stat-card">
      <div class="stat-label">${escHtml(label)}</div>
      <div class="stat-total">${total}</div>
      <div class="stat-conv">${converted} converted &middot; ${pct}%</div>
    </div>`;
  }).join('');

  const weekRows = data.week.map(r =>
    `<tr><td>${escHtml(CATEGORY_LABELS[r.category] ?? r.category)}</td><td>${escHtml(r.total)}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="color:#666">No data</td></tr>';

  const modeMap   = new Map(data.mode.map(r => [r.mode, parseInt(r.total, 10)]));
  const personal  = modeMap.get('personal') ?? 0;
  const business  = modeMap.get('business') ?? 0;

  const trendRows = data.trend.map(r => {
    const dayStr = r.day instanceof Date
      ? r.day.toISOString().split('T')[0]
      : String(r.day).split('T')[0];
    return `<tr><td>${escHtml(dayStr)}</td><td>${escHtml(CATEGORY_LABELS[r.category] ?? r.category)}</td><td>${escHtml(r.total)}</td></tr>`;
  }).join('') || '<tr><td colspan="3" style="color:#666">No data</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MTN Analytics</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#1A1A1A;color:#e0e0e0}
.header{background:#FFCC00;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
.header h1{font-size:22px;font-weight:700;color:#1A1A1A}
.btn-logout{background:#1A1A1A;color:#FFCC00;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;font-family:system-ui,sans-serif}
.btn-logout:hover{background:#2a2a2a}
.main{max-width:900px;margin:0 auto;padding:32px 20px 60px}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#FFCC00;margin-bottom:14px;margin-top:36px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.stat-card{background:#212121;border:1px solid #333;border-radius:10px;padding:20px}
.stat-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-bottom:8px}
.stat-total{font-size:40px;font-weight:700;color:#fff;line-height:1;margin-bottom:6px}
.stat-conv{font-size:13px;color:#666}
table{width:100%;border-collapse:collapse;background:#212121;border-radius:10px;overflow:hidden}
th{background:#2a2a2a;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#888;padding:12px 16px;text-align:left}
td{padding:11px 16px;font-size:14px;border-top:1px solid #2a2a2a;color:#ccc}
.mode-split{display:flex;gap:14px}
.mode-card{flex:1;background:#212121;border:1px solid #333;border-radius:10px;padding:24px;text-align:center}
.mode-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-bottom:10px}
.mode-total{font-size:48px;font-weight:700;color:#FFCC00;line-height:1}
@media(max-width:480px){.grid-2{grid-template-columns:1fr}.mode-split{flex-direction:column}}
</style>
</head>
<body>
<div class="header">
  <h1>MTN Analytics</h1>
  <form method="POST" action="/admin/logout">
    <button class="btn-logout" type="submit">Sign Out</button>
  </form>
</div>
<div class="main">
  <h2>Today</h2>
  <div class="grid-2">${todayCards}</div>

  <h2>This Week</h2>
  <table>
    <tr><th>Category</th><th>Total</th></tr>
    ${weekRows}
  </table>

  <h2>Mode Split &mdash; Last 30 Days</h2>
  <div class="mode-split">
    <div class="mode-card">
      <div class="mode-label">Personal</div>
      <div class="mode-total">${personal}</div>
    </div>
    <div class="mode-card">
      <div class="mode-label">Business</div>
      <div class="mode-total">${business}</div>
    </div>
  </div>

  <h2>14-Day Trend</h2>
  <table>
    <tr><th>Date</th><th>Category</th><th>Total</th></tr>
    ${trendRows}
  </table>
</div>
</body>
</html>`;
}

const TODAY_QUERY = `
  SELECT category,
         COUNT(*)                                          AS total,
         COUNT(*) FILTER (WHERE opened_consultant = true) AS converted
  FROM events
  WHERE created_at >= CURRENT_DATE
  GROUP BY category
  ORDER BY total DESC`;

const WEEK_QUERY = `
  SELECT category, COUNT(*) AS total
  FROM events
  WHERE created_at >= date_trunc('week', now())
  GROUP BY category
  ORDER BY total DESC`;

const MODE_QUERY = `
  SELECT mode, COUNT(*) AS total
  FROM events
  WHERE created_at > now() - interval '30 days'
    AND mode IS NOT NULL
  GROUP BY mode`;

const TREND_QUERY = `
  SELECT DATE(created_at) AS day,
         category,
         COUNT(*)          AS total
  FROM events
  WHERE created_at > now() - interval '14 days'
    AND category IS NOT NULL
  GROUP BY 1, 2
  ORDER BY 1 DESC, 3 DESC`;

// GET /admin → redirect based on session validity
adminRoute.get('/', async (c) => {
  const cookieValue = getCookie(c, 'mtn_session');
  if (cookieValue && (await verifySession(cookieValue))) {
    return c.redirect('/admin/dashboard', 302);
  }
  return c.redirect('/admin/login', 302);
});

// GET /admin/login
adminRoute.get('/login', (c) => {
  const error = c.req.query('error');
  return c.html(renderLogin(error === '1'));
});

// POST /admin/login
adminRoute.post('/login', loginLimiter(), async (c) => {
  const body     = await c.req.parseBody();
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const envUser = process.env.ADMIN_USERNAME ?? '';
  const envPass = process.env.ADMIN_PASSWORD ?? '';

  if (safeCompare(username, envUser) && safeCompare(password, envPass)) {
    c.header('Set-Cookie', await createSessionCookie(username));
    return c.redirect('/admin/dashboard', 302);
  }

  return c.redirect('/admin/login?error=1', 302);
});

// GET /admin/dashboard
adminRoute.get('/dashboard', adminGuard(), adminCSP(), async (c) => {
  const [todayResult, weekResult, modeResult, trendResult] = await Promise.all([
    db.query<TodayRow>(TODAY_QUERY),
    db.query<WeekRow>(WEEK_QUERY),
    db.query<ModeRow>(MODE_QUERY),
    db.query<TrendRow>(TREND_QUERY),
  ]);

  return c.html(
    renderDashboard({
      today: todayResult.rows,
      week:  weekResult.rows,
      mode:  modeResult.rows,
      trend: trendResult.rows,
    })
  );
});

// POST /admin/logout
adminRoute.post('/logout', (c) => {
  c.header(
    'Set-Cookie',
    'mtn_session=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0'
  );
  return c.redirect('/admin/login', 302);
});
