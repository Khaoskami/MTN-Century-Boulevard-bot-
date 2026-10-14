import { Hono } from 'hono';

export const dealsRoute = new Hono();

const brochures = [
  {
    path: '/personal-deals.pdf',
    file: 'public/personal-deals.pdf',
    filename: 'MTN-Personal-Deals-October-2026.pdf',
  },
  {
    path: '/business-deals.pdf',
    file: 'public/business-deals.pdf',
    filename: 'MTN-Business-Deals-October-2026.pdf',
  },
];

for (const brochure of brochures) {
  dealsRoute.get(brochure.path, async (c) => {
    const file = Bun.file(brochure.file);
    if (!(await file.exists())) return c.notFound();

    const disposition = c.req.query('download') === '1' ? 'attachment' : 'inline';

    return new Response(file, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(file.size),
        'Content-Disposition': `${disposition}; filename="${brochure.filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  });
}
