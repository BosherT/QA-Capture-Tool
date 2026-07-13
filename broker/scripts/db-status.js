import { getConfig } from "../src/config.js";
import { getPool, hasDatabase, closePool } from "../src/db.js";

const config = getConfig();

if (!hasDatabase(config)) {
  console.log("Database mode: memory fallback");
  process.exit(0);
}

const pool = getPool(config);

try {
  const result = await pool.query("select count(*)::int as connections from qa_capture_oauth_connections where disconnected_at is null");
  console.log(`Database mode: Postgres`);
  console.log(`Active OAuth connections: ${result.rows[0].connections}`);
} finally {
  await closePool();
}
