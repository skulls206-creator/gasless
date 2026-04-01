/**
 * Cryptographic helpers for Gasless wallet key storage.
 *
 * v1 (legacy): CryptoJS.AES.encrypt(pk, password) — EVP_BytesToKey / MD5 KDF.
 *              The stored string is plain base64 and does NOT start with "{".
 *              Kept for backward-compat decryption only.
 *
 * v2 (current): Web Crypto API — PBKDF2-SHA256 (200 000 iterations) +
 *               AES-256-GCM.  Async & hardware-accelerated.
 *               Stored as JSON: {"v":2,"s":"hex","i":"hex","ct":"hex"}
 *               (s = salt, i = iv/nonce, ct = ciphertext incl. GCM auth tag)
 */

import CryptoJS from "crypto-js";

const PBKDF2_ITERATIONS = 200_000;

// ── SHA-256 helper ────────────────────────────────────────────────────────
export async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return buf2hex(new Uint8Array(hashBuffer));
}

function buf2hex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hex2buf(hex: string): Uint8Array {
  const len = hex.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── v2 encryption ─────────────────────────────────────────────────────────
export async function encryptPrivateKey(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12)); // 96-bit nonce for GCM
  const key  = await deriveKey(password, salt);

  const encoded   = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  return JSON.stringify({
    v: 2,
    s: buf2hex(salt),
    i: buf2hex(iv),
    ct: buf2hex(new Uint8Array(cipherBuf)),
  });
}

// ── Decryption: v1 + v2 ───────────────────────────────────────────────────
export async function decryptPrivateKey(stored: string, password: string): Promise<string | null> {
  try {
    if (stored.startsWith("{")) {
      // v2: Web Crypto PBKDF2 + AES-GCM
      const { v, s, i, ct } = JSON.parse(stored);
      if (v !== 2) return null;

      const salt = hex2buf(s);
      const iv   = hex2buf(i);
      const data = hex2buf(ct);
      const key  = await deriveKey(password, salt);

      const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
      return new TextDecoder().decode(plainBuf);
    } else {
      // v1 legacy: CryptoJS EVP_BytesToKey / MD5
      const bytes = CryptoJS.AES.decrypt(stored, password);
      return bytes.toString(CryptoJS.enc.Utf8) || null;
    }
  } catch {
    return null;
  }
}
