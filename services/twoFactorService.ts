// BTNG Gold — Two-Factor Authentication (TOTP) Service
import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '@/template';

// ─── Base32 Encoding / Decoding ─────────────────────────────────────────────
const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(bytes: Uint8Array): string {
  let result = '';
  let bits = 0;
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      result += B32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += B32_CHARS[(value << (5 - bits)) & 31];
  return result;
}

function decodeBase32(str: string): number[] {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < clean.length; i++) {
    const idx = B32_CHARS.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return bytes;
}

// ─── Pure-JS SHA-1 ───────────────────────────────────────────────────────────
function sha1(msg: number[]): number[] {
  const data = [...msg];
  const len = data.length;
  data.push(0x80);
  while (data.length % 64 !== 56) data.push(0);
  const bitLen = len * 8;
  for (let i = 7; i >= 0; i--) data.push((bitLen / Math.pow(2, i * 8)) & 255);

  let [h0, h1, h2, h3, h4] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];

  for (let i = 0; i < data.length; i += 64) {
    const w: number[] = [];
    for (let j = 0; j < 16; j++) {
      w[j] = (data[i + j * 4] << 24) | (data[i + j * 4 + 1] << 16) | (data[i + j * 4 + 2] << 8) | data[i + j * 4 + 3];
    }
    for (let j = 16; j < 80; j++) {
      const x = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = (x << 1) | (x >>> 31);
    }
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let j = 0; j < 80; j++) {
      let f = 0, k = 0;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out: number[] = [];
  for (const h of [h0, h1, h2, h3, h4]) {
    out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
  }
  return out;
}

// ─── HMAC-SHA1 ───────────────────────────────────────────────────────────────
function hmacSha1(keyBytes: number[], msg: number[]): number[] {
  let key = keyBytes.length > 64 ? sha1(keyBytes) : [...keyBytes];
  while (key.length < 64) key.push(0);
  const ipad = key.map(b => b ^ 0x36);
  const opad = key.map(b => b ^ 0x5C);
  return sha1([...opad, ...sha1([...ipad, ...msg])]);
}

// ─── TOTP Core ───────────────────────────────────────────────────────────────
function computeTotp(secret: string, time: number, period = 30, digits = 6): string {
  const counter = Math.floor(time / period);
  const keyBytes = decodeBase32(secret);
  // 8-byte big-endian counter
  const counterBytes: number[] = [0, 0, 0, 0,
    (counter >>> 24) & 255, (counter >>> 16) & 255, (counter >>> 8) & 255, counter & 255,
  ];
  const hmac = hmacSha1(keyBytes, counterBytes);
  const offset = hmac[19] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | (hmac[offset + 1] << 16)
    | (hmac[offset + 2] << 8)
    | hmac[offset + 3];
  return String(code % Math.pow(10, digits)).padStart(digits, '0');
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Generate a secure 20-byte (160-bit) TOTP secret */
export function generateTotpSecret(): string {
  const bytes = Crypto.getRandomValues(new Uint8Array(20));
  return encodeBase32(bytes);
}

/** Build the otpauth:// URI for the QR code */
export function buildOtpAuthUri(secret: string, email: string, issuer = 'BTNG Gold'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const iss = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`;
}

/** Verify a 6-digit TOTP code (±1 period window for clock drift) */
export function verifyTotp(secret: string, token: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (const delta of [-1, 0, 1]) {
    if (computeTotp(secret, now + delta * 30) === token.trim()) return true;
  }
  return false;
}

/** Format secret for manual entry display: groups of 4 */
export function formatSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

// ─── Supabase operations ─────────────────────────────────────────────────────

export interface TwoFARecord {
  id: string;
  user_id: string;
  secret: string;
  enabled: boolean;
  verified_at: string | null;
  created_at: string;
}

export async function fetchTwoFA(userId: string): Promise<{ data: TwoFARecord | null; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('user_2fa')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return { data: data as TwoFARecord | null, error: error?.message ?? null };
}

export async function upsertTwoFASecret(userId: string, secret: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('user_2fa')
    .upsert({ user_id: userId, secret, enabled: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  return { error: error?.message ?? null };
}

export async function enableTwoFA(userId: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('user_2fa')
    .update({ enabled: true, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  return { error: error?.message ?? null };
}

export async function disableTwoFA(userId: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('user_2fa')
    .update({ enabled: false, verified_at: null, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  return { error: error?.message ?? null };
}
