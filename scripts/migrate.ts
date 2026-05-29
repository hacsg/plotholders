/**
 * Database migration runner
 * Usage: npm run migrate
 *
 * For now executes the full schema.sql (idempotent CREATE TABLE IF NOT EXISTS would be better in future).
 * Later this can be replaced with a proper migration tool (knex, prisma, etc).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from '../src/db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  console.log('[Migrate] Running database schema...');

  try {
    const schemaPath = join(__dirname, '../src/db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    await pool.query(schema);

    console.log('✅ Database schema created / verified successfully');
  } catch (err: any) {
    console.error('[Migrate] Error:', err.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
