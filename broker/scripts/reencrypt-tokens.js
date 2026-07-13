import { getConfig } from "../src/config.js";
import { getPool, hasDatabase, closePool } from "../src/db.js";
import { assertTokenEncryptionConfigured, encryptToken } from "../src/services/tokenCrypto.js";

const config = getConfig();

if (!hasDatabase(config)) {
  console.error("DATABASE_URL is not set to a real Postgres connection string.");
  process.exit(1);
}

assertTokenEncryptionConfigured(config);

const pool = getPool(config);

try {
  const result = await pool.query(
    `select id, access_token_encrypted, refresh_token_encrypted
     from qa_capture_oauth_connections
     where disconnected_at is null`
  );

  let updated = 0;
  for (const row of result.rows) {
    const accessToken = maybeEncrypt(config, row.access_token_encrypted);
    const refreshToken = maybeEncrypt(config, row.refresh_token_encrypted);
    if (accessToken === row.access_token_encrypted && refreshToken === row.refresh_token_encrypted) continue;

    await pool.query(
      `update qa_capture_oauth_connections
       set access_token_encrypted = $2,
           refresh_token_encrypted = $3,
           updated_at = now()
       where id = $1`,
      [row.id, accessToken, refreshToken]
    );
    updated += 1;
  }

  console.log(`Re-encrypted ${updated} active OAuth connection${updated === 1 ? "" : "s"}.`);
} finally {
  await closePool();
}

function maybeEncrypt(config, value) {
  if (!value || String(value).startsWith("enc:v1:")) return value;
  return encryptToken(config, value);
}
