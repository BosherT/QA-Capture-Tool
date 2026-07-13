import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";

export function assertTokenEncryptionConfigured(config) {
  if (!config.tokenEncryptionKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required when DATABASE_URL enables Postgres token storage.");
  }
}

export function encryptToken(config, value) {
  if (!value) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFromConfig(config), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(config, value) {
  if (!value || !String(value).startsWith(PREFIX)) return value;

  const encoded = String(value).slice(PREFIX.length);
  const [ivText, tagText, encryptedText] = encoded.split(".");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Stored token is encrypted but has an invalid format.");
  }

  const decipher = createDecipheriv(ALGORITHM, keyFromConfig(config), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

function keyFromConfig(config) {
  return createHash("sha256").update(config.tokenEncryptionKey, "utf8").digest();
}
