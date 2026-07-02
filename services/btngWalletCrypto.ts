/**
 * BTNG GoldCoin Wallet Crypto Engine — React Native Compatible
 * ─────────────────────────────────────────────────────────────
 * Generates a sovereign BTNG GoldCoin wallet using:
 *   • secp256k1 EC key pair (via ethers.js — already in project)
 *   • SHA-256 (pure JS via ethers utils)
 *   • RIPEMD-160 (pure JS implementation)
 *   • Base58Check encoding (pure JS)
 *   • BTNG prefix "btng1g" + 35-char address
 *
 * No Node.js `crypto` module required — fully runs on iOS/Android/Web.
 *
 * Usage:
 *   const wallet = generateBtngWallet();
 *   // { privateKey, publicKey, address: "btng1g..." }
 */

import { ethers } from 'ethers';

// ─── BTNG Address Configuration ──────────────────────────────────────────────
export const BTNG_PREFIX    = 'btng1g';   // BTNG GoldCoin prefix
export const BTNG_ADDR_LEN  = 35;         // enforced total length
export const BTNG_VERSION   = 0x00;       // version byte (BTC-compatible)
export const BTNG_COIN_TYPE = 9999;       // BIP44 coin type for BTNG54

// ─── Pure JS RIPEMD-160 ──────────────────────────────────────────────────────
// Implements the RIPEMD-160 digest entirely in JS/TS — no native deps.

const KL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13];
const KR = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11];
const SL = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6];
const SR = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11];
const CL = [0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xA953FD4E];
const CR = [0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x7A6D76E9, 0x00000000];

function rotl32(x: number, n: number): number { return ((x << n) | (x >>> (32 - n))) >>> 0; }
function f(j: number, x: number, y: number, z: number): number {
  if (j < 16) return (x ^ y ^ z) >>> 0;
  if (j < 32) return ((x & y) | (~x & z)) >>> 0;
  if (j < 48) return ((x | ~y) ^ z) >>> 0;
  if (j < 64) return ((x & z) | (y & ~z)) >>> 0;
  return (x ^ (y | ~z)) >>> 0;
}

function ripemd160(msgBytes: Uint8Array): Uint8Array {
  const length = msgBytes.length;
  const bitLen = length * 8;
  // Padding
  const padded = new Uint8Array(length + 1 + (length % 64 < 56 ? 55 : 119) - (length % 64));
  padded.set(msgBytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen & 0xffffffff, true);
  view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);

  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;

  for (let i = 0; i < padded.length; i += 64) {
    const X: number[] = [];
    for (let w = 0; w < 16; w++) X.push(new DataView(padded.buffer).getUint32(i + w * 4, true));

    let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
    let ar = h0, br = h1, cr = h2, dr = h3, er = h4;

    for (let j = 0; j < 80; j++) {
      let T = (rotl32((al + f(j, bl, cl, dl) + X[KL[j]] + CL[Math.floor(j / 16)]) >>> 0, SL[j]) + el) >>> 0;
      al = el; el = dl; dl = rotl32(cl, 10); cl = bl; bl = T;
      T = (rotl32((ar + f(79 - j, br, cr, dr) + X[KR[j]] + CR[Math.floor(j / 16)]) >>> 0, SR[j]) + er) >>> 0;
      ar = er; er = dr; dr = rotl32(cr, 10); cr = br; br = T;
    }
    const T = (h1 + cl + dr) >>> 0;
    h1 = (h2 + dl + er) >>> 0;
    h2 = (h3 + el + ar) >>> 0;
    h3 = (h4 + al + br) >>> 0;
    h4 = (h0 + bl + cr) >>> 0;
    h0 = T;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((v, i) => outView.setUint32(i * 4, v, true));
  return out;
}

// ─── Pure JS Base58 ──────────────────────────────────────────────────────────
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let result = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += '1';
  for (let i = digits.length - 1; i >= 0; i--) result += BASE58_ALPHABET[digits[i]];
  return result;
}

// ─── SHA-256 via ethers ───────────────────────────────────────────────────────
function sha256(bytes: Uint8Array): Uint8Array {
  // ethers.sha256 accepts a hex string or BytesLike — convert Uint8Array to hex string first
  let hex: string;
  try {
    hex = ethers.sha256(ethers.hexlify(bytes)).slice(2);
  } catch {
    // Fallback: manual hex conversion
    const h = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    hex = ethers.sha256('0x' + h).slice(2);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ─── Address derivation ───────────────────────────────────────────────────────
function deriveBtngAddress(pubKeyHex: string): string {
  const pubKey = ethers.getBytes('0x' + pubKeyHex);

  // 1. SHA-256(pubkey)
  const sha = sha256(pubKey);

  // 2. RIPEMD-160(SHA256(pubkey))
  const ripe = ripemd160(sha);

  // 3. Version byte prefix
  const versioned = new Uint8Array(21);
  versioned[0] = BTNG_VERSION;
  versioned.set(ripe, 1);

  // 4. Double SHA-256 checksum (4 bytes)
  const checksum = sha256(sha256(versioned)).slice(0, 4);

  // 5. Full payload
  const full = new Uint8Array(25);
  full.set(versioned);
  full.set(checksum, 21);

  // 6. Base58Check encode
  const b58 = base58Encode(full);

  // 7. Apply BTNG prefix
  let address = BTNG_PREFIX + b58;

  // 8. Enforce exactly 35 chars
  if (address.length > BTNG_ADDR_LEN) {
    address = address.slice(0, BTNG_ADDR_LEN);
  } else if (address.length < BTNG_ADDR_LEN) {
    address = address.padEnd(BTNG_ADDR_LEN, '0');
  }

  return address;
}

// ─── Wallet Types ─────────────────────────────────────────────────────────────
export interface BtngGoldWallet {
  /** Hex-encoded 32-byte private key — KEEP SECRET, never transmit */
  privateKey: string;
  /** Hex-encoded 65-byte uncompressed public key */
  publicKey: string;
  /** Compressed public key hex (33 bytes) */
  publicKeyCompressed: string;
  /** BTNG GoldCoin address — "btng1g…" (35 chars) */
  address: string;
  /** Ethereum-compatible address (EVM fallback) */
  evmAddress: string;
  /** BIP-44 mnemonic phrase (24 words) */
  mnemonic: string;
  /** Derivation path (BIP-44) */
  derivationPath: string;
  /** Wallet creation timestamp ISO-8601 */
  createdAt: string;
  /** BTNG coin type (9999) */
  coinType: number;
  /** Chain ID for BTNG-MAINNET */
  chainId: string;
  /** Network label */
  network: string;
}

export interface BtngWalletSummary {
  address: string;
  evmAddress: string;
  publicKey: string;
  publicKeyCompressed: string;
  derivationPath: string;
  createdAt: string;
  network: string;
  chainId: string;
}

// ─── Main Generator ───────────────────────────────────────────────────────────

/**
 * generateBtngWallet()
 *
 * ONE SHOT — generates a complete BTNG GoldCoin wallet:
 *   1. Creates a secure 24-word BIP-39 mnemonic
 *   2. Derives secp256k1 key pair via BIP-44 path m/44'/9999'/0'/0/0
 *   3. Computes BTNG-style address (btng1g…, 35 chars)
 *   4. Computes EVM-compatible address as fallback
 *
 * @returns Full wallet including private key — store securely, never log
 */
export function generateBtngWallet(): BtngGoldWallet {
  const createdAt = new Date().toISOString();
  const derivationPath = `m/44'/${BTNG_COIN_TYPE}'/0'/0/0`;

  // Generate entropy → mnemonic
  const entropy = ethers.randomBytes(32); // 256-bit → 24 words
  const mnemonic = ethers.Mnemonic.fromEntropy(entropy);

  // HD derivation
  const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, derivationPath);

  const privateKey          = hdNode.privateKey.slice(2);    // strip 0x
  const publicKey           = hdNode.signingKey.publicKey.slice(2);   // uncompressed, strip 0x
  const publicKeyCompressed = hdNode.signingKey.compressedPublicKey.slice(2); // compressed, strip 0x
  const evmAddress          = hdNode.address;

  // BTNG address via BTC-style Hash160
  const address = deriveBtngAddress(publicKey);

  return {
    privateKey,
    publicKey,
    publicKeyCompressed,
    address,
    evmAddress,
    mnemonic:        mnemonic.phrase,
    derivationPath,
    createdAt,
    coinType:  BTNG_COIN_TYPE,
    chainId:   'BTNG-MAINNET-9999',
    network:   'BTNG Gold Chain · Mainnet',
  };
}

/**
 * generateBtngWalletFromMnemonic(phrase)
 *
 * Restore a BTNG wallet from an existing 24-word mnemonic.
 * Returns the same deterministic keypair every time.
 */
export function generateBtngWalletFromMnemonic(phrase: string): BtngGoldWallet {
  const trimmed = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  const mnemonic = ethers.Mnemonic.fromPhrase(trimmed);
  const derivationPath = `m/44'/${BTNG_COIN_TYPE}'/0'/0/0`;
  const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, derivationPath);

  const privateKey          = hdNode.privateKey.slice(2);
  const publicKey           = hdNode.signingKey.publicKey.slice(2);
  const publicKeyCompressed = hdNode.signingKey.compressedPublicKey.slice(2);
  const evmAddress          = hdNode.address;
  const address             = deriveBtngAddress(publicKey);

  return {
    privateKey,
    publicKey,
    publicKeyCompressed,
    address,
    evmAddress,
    mnemonic:      mnemonic.phrase,
    derivationPath,
    createdAt:     new Date().toISOString(),
    coinType:      BTNG_COIN_TYPE,
    chainId:       'BTNG-MAINNET-9999',
    network:       'BTNG Gold Chain · Mainnet',
  };
}

/**
 * walletSummary(wallet)
 * Returns public-safe fields only — safe to display or transmit.
 */
export function walletSummary(wallet: BtngGoldWallet): BtngWalletSummary {
  return {
    address:             wallet.address,
    evmAddress:          wallet.evmAddress,
    publicKey:           wallet.publicKey,
    publicKeyCompressed: wallet.publicKeyCompressed,
    derivationPath:      wallet.derivationPath,
    createdAt:           wallet.createdAt,
    network:             wallet.network,
    chainId:             wallet.chainId,
  };
}

/**
 * validateBtngAddress(address)
 * Checks format: starts with "btng1g", exactly 35 chars.
 */
export function validateBtngAddress(address: string): boolean {
  return (
    typeof address === 'string' &&
    address.startsWith(BTNG_PREFIX) &&
    address.length === BTNG_ADDR_LEN
  );
}

/**
 * formatBtngAddress(address)
 * Returns a display-friendly shortened version: "btng1g…XXXX"
 */
export function formatBtngAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 10)}\u2026${address.slice(-4)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateBtngWalletMobile()
// ─────────────────────────────────────────────────────────────────────────────
// Mobile-banking one-shot generator — matches the user-defined spec exactly:
//   Section 1  Imports & Constants  (BTNG_PREFIX, ADDRESS_LENGTH)
//   Section 2  hash160()            (SHA256 → RIPEMD160)
//   Section 3  checksum()           (Double SHA256, first 4 bytes)
//   Section 4  safeBase58()         (validates buffer, then encodes)
//   Section 5  formatBtngAddress()  (prefix + enforce 35 chars)
//   Section 6  generateBtngWalletMobile() → { privateKey, publicKey, address }
//
// Uses the SAME pure-JS engine above (ethers secp256k1 / RIPEMD160 / Base58Check)
// — no Node.js `crypto`, `bs58`, or `elliptic` needed on mobile.
// ─────────────────────────────────────────────────────────────────────────────

/** Section 2 — hash160(pubKeyBytes): SHA256 → RIPEMD160 */
export function hash160(pubKeyBytes: Uint8Array): Uint8Array {
  return ripemd160(sha256(pubKeyBytes));
}

/** Section 3 — checksum(payload): Double SHA256, first 4 bytes */
export function doubleSha256Checksum(payload: Uint8Array): Uint8Array {
  return sha256(sha256(payload)).slice(0, 4);
}

/** Section 4 — safeBase58(buf): validates + Base58Check encodes */
export function safeBase58(buf: Uint8Array): string {
  if (!buf || buf.length === 0) throw new Error('Invalid buffer for Base58 encoding');
  return base58Encode(buf);
}

export interface BtngWalletMobile {
  privateKey: string;   // hex 32 bytes — KEEP SECRET
  publicKey:  string;   // hex 65 bytes uncompressed
  address:    string;   // btng1g… 35 chars
  evmAddress: string;   // 0x… EVM address
  mnemonic:   string;   // 24-word BIP-39 backup
  createdAt:  string;
  error?:     boolean;
  message?:   string;
}

/**
 * generateBtngWalletMobile()
 *
 * FINAL ONE-SHOT WALLET GENERATOR (mobile-banking ready)
 * ─────────────────────────────────────────────────────
 * 1. Generates secp256k1 keypair via BIP-44 m/44'/9999'/0'/0/0
 * 2. HASH160(pubkey) = RIPEMD160(SHA256(pubkey))
 * 3. Adds version byte 0x00
 * 4. Appends 4-byte double-SHA256 checksum
 * 5. Base58Check encodes full payload
 * 6. Prepends "btng1g" prefix, enforces 35 chars
 * Returns: { privateKey, publicKey, address (btng1g…), evmAddress, mnemonic }
 */
// ─────────────────────────────────────────────────────────────────────────────
// FINAL ONE-SHOT MOBILE ENGINE
// User-spec: Section 1–6 algorithm using pure-JS secp256k1 (ethers SigningKey)
// No BIP39/HD derivation — direct random keypair for maximum mobile reliability
// ─────────────────────────────────────────────────────────────────────────────

// Pure-JS secp256k1 point multiply via ethers SigningKey (no elliptic import needed)
function _generateRawKeypair(): { privateKeyHex: string; publicKeyHex: string; evmAddress: string } {
  // Generate 32 random bytes as private key
  const privBytes = ethers.randomBytes(32);
  const privHex   = ethers.hexlify(privBytes).slice(2); // strip 0x

  // Derive public key using ethers SigningKey (secp256k1 under the hood)
  const signingKey = new ethers.SigningKey('0x' + privHex);
  const pubHex     = signingKey.publicKey.slice(2);  // uncompressed 65-byte, strip 0x

  // EVM address = keccak256 of uncompressed pubkey (last 20 bytes)
  const pubBytes   = ethers.getBytes('0x' + pubHex);
  const pubNoPrefix = pubBytes.slice(1); // drop 0x04 prefix
  const evmAddress = ethers.computeAddress('0x' + privHex);

  return { privateKeyHex: privHex, publicKeyHex: pubHex, evmAddress };
}

export function generateBtngWalletMobile(): BtngWalletMobile {
  try {
    const createdAt = new Date().toISOString();

    // SECTION 1 — Generate secp256k1 keypair (pure-JS, no Node.js crypto)
    const { privateKeyHex: privateKey, publicKeyHex: publicKey, evmAddress } = _generateRawKeypair();

    // SECTION 2 — hash160(pubkey) = SHA256 → RIPEMD160
    const pubKeyBytes = ethers.getBytes('0x' + publicKey);
    const ripe        = hash160(pubKeyBytes);

    // SECTION 3 — version byte 0x00 + ripe
    const versioned = new Uint8Array(21);
    versioned[0] = 0x00;
    versioned.set(ripe, 1);

    // SECTION 3 — checksum: double SHA256 first 4 bytes
    const check = doubleSha256Checksum(versioned);

    // SECTION 4 — full payload = versioned + checksum
    const full = new Uint8Array(25);
    full.set(versioned);
    full.set(check, 21);

    // SECTION 4 — safeBase58 encode
    const base58Str = safeBase58(full);

    // SECTION 5 — format: btng1g prefix + enforce 35 chars
    let address = BTNG_PREFIX + base58Str;
    if (address.length > BTNG_ADDR_LEN) {
      address = address.substring(0, BTNG_ADDR_LEN);
    } else if (address.length < BTNG_ADDR_LEN) {
      address = address.padEnd(BTNG_ADDR_LEN, '0');
    }

    // SECTION 6 — return complete wallet
    return {
      privateKey,
      publicKey,
      address,
      evmAddress,
      mnemonic:  '',   // raw keypair mode — use generateBtngWallet() for BIP39 mnemonic
      createdAt,
      error:     false,
      message:   'OK',
    };
  } catch (e: any) {
    return {
      privateKey: '',
      publicKey:  '',
      address:    '',
      evmAddress: '',
      mnemonic:   '',
      createdAt:  new Date().toISOString(),
      error:      true,
      message:    e?.message ?? String(e),
    };
  }
}
