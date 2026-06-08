import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('Missing required env var: DATABASE_URL');
}

export const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initDB(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      id                bigserial    PRIMARY KEY,
      created_at        timestamptz  DEFAULT now(),
      mode              text         CHECK (mode IN ('personal', 'business')),
      category          text         CHECK (category IN ('new-lines', 'upgrades', 'general', 'fibre')),
      contract_type     text,
      phone_brand       text,
      service_type      text,
      reached_summary   boolean      DEFAULT false,
      opened_consultant boolean      DEFAULT false,
      consultant_name   text,
      ip_hash           text
    );

    CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at DESC);
    CREATE INDEX IF NOT EXISTS events_category_idx   ON events (category);
  `);
}
