import pg from "pg";

let pool = null;

export function hasDatabase(config) {
  return Boolean(config.databaseUrl && !config.databaseUrl.includes("user:password"));
}

export function getPool(config) {
  if (!hasDatabase(config)) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.databaseUrl
    });
  }
  return pool;
}

export async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}
