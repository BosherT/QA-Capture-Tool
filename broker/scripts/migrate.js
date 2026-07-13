import { readFileSync } from "fs";
import { getConfig } from "../src/config.js";
import { getPool, hasDatabase, closePool } from "../src/db.js";

const config = getConfig();

if (!hasDatabase(config)) {
  console.error("DATABASE_URL is not set to a real Postgres connection string.");
  process.exit(1);
}

const pool = getPool(config);
const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

try {
  await pool.query(sql);
  console.log("Database migration complete.");
} finally {
  await closePool();
}
