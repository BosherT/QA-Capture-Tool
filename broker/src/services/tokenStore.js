import { getPool, hasDatabase } from "../db.js";
import { assertTokenEncryptionConfigured, decryptToken, encryptToken } from "./tokenCrypto.js";

const memoryStore = new Map();
let latestSessionId = null;

export function createTokenStore(config) {
  if (hasDatabase(config)) return createPostgresTokenStore(config);
  return createMemoryTokenStore();
}

function createMemoryTokenStore() {
  return {
    mode: "memory",

    async getTokenSet(sessionId) {
      return memoryStore.get(sessionId) || null;
    },

    async getLatestTokenSet() {
      return latestSessionId ? memoryStore.get(latestSessionId) || null : null;
    },

    async getLatestSessionId() {
      return latestSessionId;
    },

    async saveTokenSet(sessionId, tokenSet, sites) {
      latestSessionId = sessionId;
      memoryStore.set(sessionId, {
        tokenSet,
        sites,
        updatedAt: new Date().toISOString()
      });
    },

    async updateTokenSet(sessionId, tokenSet) {
      const current = memoryStore.get(sessionId);
      if (!current) return;
      memoryStore.set(sessionId, {
        ...current,
        tokenSet,
        updatedAt: new Date().toISOString()
      });
    },

    async deleteTokenSet(sessionId) {
      memoryStore.delete(sessionId);
      if (latestSessionId === sessionId) latestSessionId = memoryStore.keys().next().value || null;
    },

    async deleteLatestTokenSet() {
      if (!latestSessionId) return;
      memoryStore.delete(latestSessionId);
      latestSessionId = memoryStore.keys().next().value || null;
    }
  };
}

function createPostgresTokenStore(config) {
  assertTokenEncryptionConfigured(config);
  const pool = getPool(config);

  return {
    mode: "postgres",

    async getTokenSet(sessionId) {
      const result = await pool.query(
        `select * from qa_capture_oauth_connections
         where session_id = $1 and disconnected_at is null
         limit 1`,
        [sessionId]
      );
      return rowToStoredToken(config, result.rows[0]);
    },

    async getLatestTokenSet() {
      const result = await pool.query(
        `select * from qa_capture_oauth_connections
         where disconnected_at is null
         order by updated_at desc
         limit 1`
      );
      return rowToStoredToken(config, result.rows[0]);
    },

    async getLatestSessionId() {
      const result = await pool.query(
        `select session_id from qa_capture_oauth_connections
         where disconnected_at is null
         order by updated_at desc
         limit 1`
      );
      return result.rows[0]?.session_id || null;
    },

    async saveTokenSet(sessionId, tokenSet, sites) {
      const primarySite = sites?.[0] || {};
      await pool.query(
        `insert into qa_capture_oauth_connections (
           session_id,
           cloud_id,
           site_url,
           access_token_encrypted,
           refresh_token_encrypted,
           expires_at,
           sites_json,
           disconnected_at,
           updated_at
         ) values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $7::jsonb, null, now())
         on conflict (session_id) do update set
           cloud_id = excluded.cloud_id,
           site_url = excluded.site_url,
           access_token_encrypted = excluded.access_token_encrypted,
           refresh_token_encrypted = excluded.refresh_token_encrypted,
           expires_at = excluded.expires_at,
           sites_json = excluded.sites_json,
           disconnected_at = null,
           updated_at = now()`,
        [
          sessionId,
          primarySite.id || null,
          primarySite.url || null,
          encryptToken(config, tokenSet.access_token),
          encryptToken(config, tokenSet.refresh_token),
          Number(tokenSet.expires_at || 0),
          JSON.stringify(sites || [])
        ]
      );
    },

    async updateTokenSet(sessionId, tokenSet) {
      await pool.query(
        `update qa_capture_oauth_connections set
           access_token_encrypted = $2,
           refresh_token_encrypted = $3,
           expires_at = to_timestamp($4 / 1000.0),
           updated_at = now()
         where session_id = $1 and disconnected_at is null`,
        [
          sessionId,
          encryptToken(config, tokenSet.access_token),
          encryptToken(config, tokenSet.refresh_token),
          Number(tokenSet.expires_at || 0)
        ]
      );
    },

    async deleteTokenSet(sessionId) {
      await pool.query(
        `update qa_capture_oauth_connections
         set disconnected_at = now(), updated_at = now()
         where session_id = $1 and disconnected_at is null`,
        [sessionId]
      );
    },

    async deleteLatestTokenSet() {
      const latestSessionId = await this.getLatestSessionId();
      if (latestSessionId) await this.deleteTokenSet(latestSessionId);
    }
  };
}

function rowToStoredToken(config, row) {
  if (!row) return null;
  const sites = Array.isArray(row.sites_json) ? row.sites_json : [];
  return {
    tokenSet: {
      access_token: decryptToken(config, row.access_token_encrypted),
      refresh_token: decryptToken(config, row.refresh_token_encrypted),
      expires_at: row.expires_at ? new Date(row.expires_at).getTime() : 0
    },
    sites,
    updatedAt: row.updated_at?.toISOString?.() || null
  };
}
