/**
 * ============================================================================
 * CODE POLICE - BRING YOUR OWN KEY (BYOK)
 * ============================================================================
 * Open-source-friendly key management. Maintainers running Code Police on
 * their own infrastructure (or self-hosting the OSS build) can let each user
 * supply their own Gemini API key instead of relying on a single shared,
 * billed key. This makes the project sustainable for the OSS community.
 *
 * Keys are encrypted at rest with AES (crypto-js) using a server-side secret
 * (BYOK_ENCRYPTION_KEY). Plaintext keys are never persisted.
 *
 * Resolution order when picking which key to use for an analysis:
 *   1. The project's BYOK key (decrypted), if present.
 *   2. The user's BYOK key (decrypted), if present.
 *   3. The platform default (GEMINI_API_KEY / GOOGLE_API_KEY env var).
 */

import CryptoJS from "crypto-js";

export interface ByokConfig {
  /** Encrypted key payload stored in Firestore. */
  encryptedKey?: string;
  /** Which provider the key targets. Currently only "gemini". */
  provider?: "gemini";
  /** Last 4 chars for display ("…ab12") without revealing the secret. */
  keyHint?: string;
}

function getEncryptionSecret(): string {
  const secret = process.env.BYOK_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "BYOK_ENCRYPTION_KEY is not configured. Set it in your environment to enable Bring Your Own Key."
    );
  }
  return secret;
}

/** Encrypt a raw API key for storage. Returns the ciphertext string. */
export function encryptApiKey(rawKey: string): string {
  return CryptoJS.AES.encrypt(rawKey, getEncryptionSecret()).toString();
}

/** Decrypt a stored API key. Returns null if decryption fails. */
export function decryptApiKey(ciphertext: string): string | null {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, getEncryptionSecret());
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted || null;
  } catch {
    return null;
  }
}

/** Build a non-sensitive hint for the UI, e.g. "AIza…9f2c". */
export function buildKeyHint(rawKey: string): string {
  if (rawKey.length <= 8) return "••••";
  return `${rawKey.slice(0, 4)}…${rawKey.slice(-4)}`;
}

/** Validate that a string looks like a plausible Gemini key before storing. */
export function isPlausibleGeminiKey(rawKey: string): boolean {
  const trimmed = rawKey.trim();
  // Google API keys start with "AIza" and are ~39 chars; be lenient.
  return /^AIza[0-9A-Za-z\-_]{20,}$/.test(trimmed) || trimmed.length >= 20;
}

/** Create the storable BYOK config from a raw key. */
export function makeByokConfig(rawKey: string): ByokConfig {
  return {
    encryptedKey: encryptApiKey(rawKey),
    provider: "gemini",
    keyHint: buildKeyHint(rawKey),
  };
}

/**
 * Resolve the effective API key for an analysis given optional project- and
 * user-level BYOK configs. Returns the decrypted key or the platform default.
 */
export function resolveApiKey(opts: {
  projectByok?: ByokConfig | null;
  userByok?: ByokConfig | null;
}): { apiKey: string | undefined; source: "project" | "user" | "platform" } {
  if (opts.projectByok?.encryptedKey) {
    const key = decryptApiKey(opts.projectByok.encryptedKey);
    if (key) return { apiKey: key, source: "project" };
  }
  if (opts.userByok?.encryptedKey) {
    const key = decryptApiKey(opts.userByok.encryptedKey);
    if (key) return { apiKey: key, source: "user" };
  }
  return {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    source: "platform",
  };
}
