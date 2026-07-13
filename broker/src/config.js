import { existsSync, readFileSync } from "fs";

loadEnvFile();

export function getConfig() {
  const port = Number(process.env.PORT || 8788);
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`;
  const redirectUri = process.env.ATLASSIAN_REDIRECT_URI || `${publicBaseUrl}/auth/callback`;

  return {
    port,
    publicBaseUrl,
    corsOrigin: process.env.CORS_ORIGIN || "*",
    sessionCookieName: process.env.SESSION_COOKIE_NAME || "qa_capture_session",
    sessionCookieSecure: process.env.SESSION_COOKIE_SECURE === "true",
    databaseUrl: process.env.DATABASE_URL || "",
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || "",
    atlassian: {
      clientId: process.env.ATLASSIAN_CLIENT_ID || "",
      clientSecret: process.env.ATLASSIAN_CLIENT_SECRET || "",
      redirectUri,
      scopes: (process.env.ATLASSIAN_SCOPES || "read:jira-work write:jira-work read:jira-user offline_access")
        .split(/\s+/)
        .filter(Boolean)
    }
  };
}

function loadEnvFile() {
  const envPath = ".env";
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = unquoteEnvValue(rawValue);
  }
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function assertOAuthConfigured(config) {
  const missing = [];
  if (!config.atlassian.clientId) missing.push("ATLASSIAN_CLIENT_ID");
  if (!config.atlassian.clientSecret) missing.push("ATLASSIAN_CLIENT_SECRET");
  if (!config.atlassian.redirectUri) missing.push("ATLASSIAN_REDIRECT_URI");
  if (missing.length) {
    throw new Error(`Missing OAuth config: ${missing.join(", ")}`);
  }
}
