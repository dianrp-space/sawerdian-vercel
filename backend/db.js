import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
  ? new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : null;

if (pool) {
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });
}

function getPool() {
  if (!pool) {
    throw new Error('DATABASE_URL tidak dikonfigurasi');
  }
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  const start = Date.now();
  try {
    const res = await p.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production' && process.env.LOG_QUERIES === '1') {
      console.log('query', { text: text.substring(0, 80), duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('Query error:', err.message);
    throw err;
  }
}

export async function getClient() {
  const p = getPool();
  return p.connect();
}

export async function testConnection() {
  try {
    const p = getPool();
    const res = await p.query('SELECT NOW()');
    return { ok: true, time: res.rows[0].now };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export { pool, getPool };
export default { pool, query, getClient, testConnection };
