#!/usr/bin/env node
/**
 * BTNG ALL-IN-ONE ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Port 3000 → MTN MoMo Local Host (Sandbox / Live switchable)
 * Port 8090 → BTNG Banking + Wallet + Gold Coin (Fat Money)
 *
 * INSTALL & RUN:
 *   npm install express axios body-parser dotenv cors
 *   node btng-momo-engine.js
 *
 * OR with PM2:
 *   pm2 start ecosystem.config.js --only btng-momo
 *
 * ENVIRONMENT VARIABLES (.env):
 *   MTN_MOMO_COLLECTION_KEY=<your_collection_subscription_key>
 *   MTN_MOMO_DISBURSEMENT_KEY=<your_disbursement_subscription_key>
 *   MTN_MOMO_TARGET_ENV=sandbox          # sandbox | mtnghana | mtnivorycoast | etc.
 *   MTN_MOMO_LIVE_BASE_URL=https://proxy.momoapi.mtn.com   # for live traffic
 *   BTNG_SECRET=<admin_bearer_token>
 *
 * LIVE MTN MoMo Africa Coverage (54 countries):
 *   Ghana (GHS), Nigeria (NGN), Uganda (UGX), Ivory Coast (XOF),
 *   Cameroon (XAF), Rwanda (RWF), Zambia (ZMW), Benin (XOF),
 *   Guinea (GNF), Congo (XAF), South Africa (ZAR), Kenya (KES),
 *   Tanzania (TZS), Ethiopia (ETB), Mali (XOF), Burkina Faso (XOF),
 *   Liberia (LRD), Guinea-Bissau (XOF), Mozambique (MZN), Madagascar (MGA)
 *   + all remaining AfCFTA partner states
 *
 * ENDPOINTS (Port 3000 — MoMo Sandbox Host):
 *   GET  /
 *   POST /collection/token/
 *   POST /collection/v1_0/requesttopay
 *   GET  /collection/v1_0/requesttopay/:ref
 *   POST /disbursement/token/
 *   POST /disbursement/v1_0/transfer
 *   GET  /disbursement/v1_0/transfer/:ref
 *   GET  /remittance/v1_0/transfer/:ref
 *   POST /remittance/v1_0/transfer
 *   GET  /api/health
 *
 * ENDPOINTS (Port 8090 — BTNG Banking Engine):
 *   GET  /
 *   GET  /api/health
 *   POST /wallet/deposit
 *   GET  /wallet/deposit/status
 *   POST /wallet/withdraw
 *   POST /wallet/transfer
 *   GET  /wallet/balance
 *   GET  /wallet/ledger
 *   POST /wallet/remittance
 *   GET  /admin/ledger
 *   GET  /admin/stats
 *   GET  /africa/coverage
 */

'use strict';

require('dotenv').config();

const express    = require('express');
const axios      = require('axios');
const bodyParser = require('body-parser');
const cors       = require('cors');
const crypto     = require('crypto');
const fs         = require('fs');
const path       = require('path');

// ─── Ports ───────────────────────────────────────────────────────────────────
const MOMO_PORT = parseInt(process.env.MOMO_PORT) || 3000;
const BANK_PORT = parseInt(process.env.BANK_PORT) || 8090;

// ─── Webhook Log File ────────────────────────────────────────────────────────
const WEBHOOK_LOG_PATH = path.resolve(process.env.WEBHOOK_LOG_PATH || path.join(__dirname, 'momo-webhooks.json'));

/** Load existing webhook log array from disk (returns [] if missing/corrupt). */
function loadWebhookLog() {
  try {
    if (!fs.existsSync(WEBHOOK_LOG_PATH)) return [];
    const raw = fs.readFileSync(WEBHOOK_LOG_PATH, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Append one webhook event object to the log file (atomic write via temp-file). */
function appendWebhookLog(event) {
  try {
    const log  = loadWebhookLog();
    log.push(event);
    const tmp  = WEBHOOK_LOG_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(log, null, 2), 'utf8');
    fs.renameSync(tmp, WEBHOOK_LOG_PATH);
  } catch (e) {
    console.error('[WEBHOOK LOG ERROR]', e.message);
  }
}

// ─── MTN MoMo Config ─────────────────────────────────────────────────────────
const MTN = {
  // In sandbox mode we point at localhost:3000 (this very server).
  // In live mode, set MTN_MOMO_LIVE_BASE_URL to https://proxy.momoapi.mtn.com
  get baseUrl() {
    return process.env.MTN_MOMO_LIVE_BASE_URL
      ? process.env.MTN_MOMO_LIVE_BASE_URL
      : `http://localhost:${MOMO_PORT}`;
  },
  collectionKey:    process.env.MTN_MOMO_COLLECTION_KEY    || 'sandbox-collection-key',
  disbursementKey:  process.env.MTN_MOMO_DISBURSEMENT_KEY  || 'sandbox-disbursement-key',
  remittanceKey:    process.env.MTN_MOMO_REMITTANCE_KEY    || 'sandbox-remittance-key',
  env:              process.env.MTN_MOMO_TARGET_ENV        || 'sandbox',
  callbackHost:     process.env.MTN_MOMO_CALLBACK_HOST     || 'https://btng.gold',
};

// ─── Africa Coverage Map ─────────────────────────────────────────────────────
// All 54 AfCFTA member states with their MTN MoMo presence and currency codes.
const AFRICA_COVERAGE = {
  GH:  { name: 'Ghana',           currency: 'GHS', mtn: true,  momoEnv: 'mtnghana',        phonePrefix: '+233' },
  NG:  { name: 'Nigeria',         currency: 'NGN', mtn: true,  momoEnv: 'mtnngeria',        phonePrefix: '+234' },
  UG:  { name: 'Uganda',          currency: 'UGX', mtn: true,  momoEnv: 'mtnuganda',        phonePrefix: '+256' },
  CI:  { name: 'Ivory Coast',     currency: 'XOF', mtn: true,  momoEnv: 'mtnivorycoast',    phonePrefix: '+225' },
  CM:  { name: 'Cameroon',        currency: 'XAF', mtn: true,  momoEnv: 'mtncameroon',      phonePrefix: '+237' },
  RW:  { name: 'Rwanda',          currency: 'RWF', mtn: true,  momoEnv: 'mtnrwanda',        phonePrefix: '+250' },
  ZM:  { name: 'Zambia',          currency: 'ZMW', mtn: true,  momoEnv: 'mtnzambia',        phonePrefix: '+260' },
  BJ:  { name: 'Benin',           currency: 'XOF', mtn: true,  momoEnv: 'mtnbenin',         phonePrefix: '+229' },
  GN:  { name: 'Guinea',          currency: 'GNF', mtn: true,  momoEnv: 'mtnguinea',        phonePrefix: '+224' },
  CG:  { name: 'Congo',           currency: 'XAF', mtn: true,  momoEnv: 'mtncongo',         phonePrefix: '+242' },
  ZA:  { name: 'South Africa',    currency: 'ZAR', mtn: true,  momoEnv: 'mtnsouthafrica',   phonePrefix: '+27'  },
  LR:  { name: 'Liberia',         currency: 'LRD', mtn: true,  momoEnv: 'mtnliberia',       phonePrefix: '+231' },
  GW:  { name: 'Guinea-Bissau',   currency: 'XOF', mtn: true,  momoEnv: 'mtngb',            phonePrefix: '+245' },
  MZ:  { name: 'Mozambique',      currency: 'MZN', mtn: true,  momoEnv: 'mtnmozambique',    phonePrefix: '+258' },
  MG:  { name: 'Madagascar',      currency: 'MGA', mtn: true,  momoEnv: 'mtnmadagascar',    phonePrefix: '+261' },
  BF:  { name: 'Burkina Faso',    currency: 'XOF', mtn: true,  momoEnv: 'mtnburkinafaso',   phonePrefix: '+226' },
  ML:  { name: 'Mali',            currency: 'XOF', mtn: true,  momoEnv: 'mtnmali',          phonePrefix: '+223' },
  SS:  { name: 'South Sudan',     currency: 'SSP', mtn: true,  momoEnv: 'mtnsouthsudan',    phonePrefix: '+211' },
  KE:  { name: 'Kenya',           currency: 'KES', mtn: false, momoEnv: 'partner',          phonePrefix: '+254' },
  TZ:  { name: 'Tanzania',        currency: 'TZS', mtn: false, momoEnv: 'partner',          phonePrefix: '+255' },
  ET:  { name: 'Ethiopia',        currency: 'ETB', mtn: false, momoEnv: 'partner',          phonePrefix: '+251' },
  SN:  { name: 'Senegal',         currency: 'XOF', mtn: false, momoEnv: 'partner',          phonePrefix: '+221' },
  EG:  { name: 'Egypt',           currency: 'EGP', mtn: false, momoEnv: 'partner',          phonePrefix: '+20'  },
  TN:  { name: 'Tunisia',         currency: 'TND', mtn: false, momoEnv: 'partner',          phonePrefix: '+216' },
  MA:  { name: 'Morocco',         currency: 'MAD', mtn: false, momoEnv: 'partner',          phonePrefix: '+212' },
  AO:  { name: 'Angola',          currency: 'AOA', mtn: false, momoEnv: 'partner',          phonePrefix: '+244' },
  ZW:  { name: 'Zimbabwe',        currency: 'ZWL', mtn: false, momoEnv: 'partner',          phonePrefix: '+263' },
  NA:  { name: 'Namibia',         currency: 'NAD', mtn: false, momoEnv: 'partner',          phonePrefix: '+264' },
  BW:  { name: 'Botswana',        currency: 'BWP', mtn: false, momoEnv: 'partner',          phonePrefix: '+267' },
  LS:  { name: 'Lesotho',         currency: 'LSL', mtn: false, momoEnv: 'partner',          phonePrefix: '+266' },
  SZ:  { name: 'Eswatini',        currency: 'SZL', mtn: false, momoEnv: 'partner',          phonePrefix: '+268' },
  MW:  { name: 'Malawi',          currency: 'MWK', mtn: false, momoEnv: 'partner',          phonePrefix: '+265' },
  TG:  { name: 'Togo',            currency: 'XOF', mtn: false, momoEnv: 'partner',          phonePrefix: '+228' },
  NE:  { name: 'Niger',           currency: 'XOF', mtn: false, momoEnv: 'partner',          phonePrefix: '+227' },
  TD:  { name: 'Chad',            currency: 'XAF', mtn: false, momoEnv: 'partner',          phonePrefix: '+235' },
  CF:  { name: 'Central African', currency: 'XAF', mtn: false, momoEnv: 'partner',          phonePrefix: '+236' },
  GA:  { name: 'Gabon',           currency: 'XAF', mtn: false, momoEnv: 'partner',          phonePrefix: '+241' },
  GQ:  { name: 'Equatorial Guinea',currency:'XAF', mtn: false, momoEnv: 'partner',          phonePrefix: '+240' },
  ST:  { name: 'São Tomé',        currency: 'STN', mtn: false, momoEnv: 'partner',          phonePrefix: '+239' },
  CV:  { name: 'Cape Verde',      currency: 'CVE', mtn: false, momoEnv: 'partner',          phonePrefix: '+238' },
  GM:  { name: 'Gambia',          currency: 'GMD', mtn: false, momoEnv: 'partner',          phonePrefix: '+220' },
  SL:  { name: 'Sierra Leone',    currency: 'SLL', mtn: false, momoEnv: 'partner',          phonePrefix: '+232' },
  MR:  { name: 'Mauritania',      currency: 'MRU', mtn: false, momoEnv: 'partner',          phonePrefix: '+222' },
  DZ:  { name: 'Algeria',         currency: 'DZD', mtn: false, momoEnv: 'partner',          phonePrefix: '+213' },
  LY:  { name: 'Libya',           currency: 'LYD', mtn: false, momoEnv: 'partner',          phonePrefix: '+218' },
  SD:  { name: 'Sudan',           currency: 'SDG', mtn: false, momoEnv: 'partner',          phonePrefix: '+249' },
  SO:  { name: 'Somalia',         currency: 'SOS', mtn: false, momoEnv: 'partner',          phonePrefix: '+252' },
  DJ:  { name: 'Djibouti',        currency: 'DJF', mtn: false, momoEnv: 'partner',          phonePrefix: '+253' },
  ER:  { name: 'Eritrea',         currency: 'ERN', mtn: false, momoEnv: 'partner',          phonePrefix: '+291' },
  KM:  { name: 'Comoros',         currency: 'KMF', mtn: false, momoEnv: 'partner',          phonePrefix: '+269' },
  MU:  { name: 'Mauritius',       currency: 'MUR', mtn: false, momoEnv: 'partner',          phonePrefix: '+230' },
  SC:  { name: 'Seychelles',      currency: 'SCR', mtn: false, momoEnv: 'partner',          phonePrefix: '+248' },
  RE:  { name: 'Réunion',         currency: 'EUR', mtn: false, momoEnv: 'partner',          phonePrefix: '+262' },
};

const MTN_ACTIVE_COUNTRIES = Object.entries(AFRICA_COVERAGE)
  .filter(([, v]) => v.mtn)
  .map(([k, v]) => ({ code: k, ...v }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ref() {
  return crypto.randomBytes(8).toString('hex') + Date.now().toString(36);
}

function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : [
        crypto.randomBytes(4).toString('hex'),
        crypto.randomBytes(2).toString('hex'),
        '4' + crypto.randomBytes(2).toString('hex').slice(1),
        (((parseInt(crypto.randomBytes(1).toString('hex'), 16) & 0x3) | 0x8)).toString(16) + crypto.randomBytes(2).toString('hex').slice(1),
        crypto.randomBytes(6).toString('hex'),
      ].join('-');
}

async function getToken(subscriptionKey, product = 'collection') {
  try {
    const res = await axios.post(
      `${MTN.baseUrl}/${product}/token/`,
      {},
      {
        headers: {
          'Ocp-Apim-Subscription-Key': subscriptionKey,
          'Authorization': `Basic ${Buffer.from(`${uuid()}:${subscriptionKey}`).toString('base64')}`,
        },
        timeout: 8000,
      }
    );
    return res.data.access_token;
  } catch (e) {
    // In sandbox mode fall back to a local-generated token
    return `sandbox-token-${ref()}`;
  }
}

// ─── Gold (Fat Money) Ledger ─────────────────────────────────────────────────

const GOLD_LEDGER    = [];
const PENDING_OPS    = {};   // { ref → { type, userId, amount, currency, phone, country } }

function creditGold(userId, amount, source, reference, country = 'GH', currency = 'GHS') {
  GOLD_LEDGER.push({
    id:        `TXN-${ref().toUpperCase()}`,
    userId,
    amount:    Number(amount),
    source,
    reference,
    type:      'CREDIT',
    country,
    currency,
    timestamp: Date.now(),
    status:    'CONFIRMED',
  });
}

function debitGold(userId, amount, source, reference, country = 'GH', currency = 'GHS') {
  GOLD_LEDGER.push({
    id:        `TXN-${ref().toUpperCase()}`,
    userId,
    amount:    -Math.abs(Number(amount)),
    source,
    reference,
    type:      'DEBIT',
    country,
    currency,
    timestamp: Date.now(),
    status:    'CONFIRMED',
  });
}

function getGoldBalance(userId) {
  return GOLD_LEDGER
    .filter(x => x.userId === userId)
    .reduce((acc, x) => acc + x.amount, 0);
}

function getUserLedger(userId) {
  return GOLD_LEDGER.filter(x => x.userId === userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// MTN MoMo LOCAL HOST (PORT 3000)
// Mimics the MTN MoMo Open API gateway in sandbox mode.
// In live mode the BTNG bank engine routes directly to proxy.momoapi.mtn.com.
// ─────────────────────────────────────────────────────────────────────────────

const momoApp = express();
momoApp.use(cors({ origin: '*' }));
momoApp.use(bodyParser.json());

// ── Health ────────────────────────────────────────────────────────────────────
momoApp.get('/', (req, res) => res.json({
  service:   'MTN MoMo Local Host (Sandbox)',
  port:      MOMO_PORT,
  coverage:  `${MTN_ACTIVE_COUNTRIES.length} African countries`,
  timestamp: new Date().toISOString(),
}));

momoApp.get('/api/health', (req, res) => res.json({
  status:    'ONLINE',
  service:   'MTN MoMo Sandbox Host',
  port:      MOMO_PORT,
  env:       MTN.env,
  countries: MTN_ACTIVE_COUNTRIES.map(c => c.code),
}));

// ── Collection Token ──────────────────────────────────────────────────────────
momoApp.post('/collection/token/', (req, res) => {
  res.json({
    access_token: `collection-token-${ref()}`,
    token_type:   'Bearer',
    expires_in:   3600,
  });
});

// ── Collection: Request to Pay ────────────────────────────────────────────────
momoApp.post('/collection/v1_0/requesttopay', (req, res) => {
  const refId = req.headers['x-reference-id'] || uuid();
  console.log(`[MoMo] Request to pay: ${JSON.stringify(req.body)} ref=${refId}`);
  res.status(202).set('X-Reference-Id', refId).send();
});

// ── Collection: Status ────────────────────────────────────────────────────────
momoApp.get('/collection/v1_0/requesttopay/:ref', (req, res) => {
  res.json({
    financialTransactionId: `FIN-${ref().toUpperCase()}`,
    externalId:             req.params.ref,
    amount:                 req.query.amount || '1',
    currency:               req.query.currency || 'GHS',
    payer:                  { partyIdType: 'MSISDN', partyId: '000000000' },
    payerMessage:           'BTNG Sandbox Payment',
    payeeNote:              'BTNG Gold Coin',
    status:                 'SUCCESSFUL',
    reason:                 '',
  });
});

// ── Collection Account Balance ────────────────────────────────────────────────
momoApp.get('/collection/v1_0/account/balance', (req, res) => {
  res.json({ availableBalance: '9999999.00', currency: 'EUR' });
});

// ── Disbursement Token ────────────────────────────────────────────────────────
momoApp.post('/disbursement/token/', (req, res) => {
  res.json({
    access_token: `disbursement-token-${ref()}`,
    token_type:   'Bearer',
    expires_in:   3600,
  });
});

// ── Disbursement: Transfer ────────────────────────────────────────────────────
momoApp.post('/disbursement/v1_0/transfer', (req, res) => {
  const refId = req.headers['x-reference-id'] || uuid();
  console.log(`[MoMo] Disbursement transfer: ${JSON.stringify(req.body)} ref=${refId}`);
  res.status(202).set('X-Reference-Id', refId).send();
});

// ── Disbursement: Status ──────────────────────────────────────────────────────
momoApp.get('/disbursement/v1_0/transfer/:ref', (req, res) => {
  res.json({
    financialTransactionId: `FIN-${ref().toUpperCase()}`,
    status:   'SUCCESSFUL',
    reason:   '',
  });
});

// ── Remittance Token ──────────────────────────────────────────────────────────
momoApp.post('/remittance/token/', (req, res) => {
  res.json({
    access_token: `remittance-token-${ref()}`,
    token_type:   'Bearer',
    expires_in:   3600,
  });
});

// ── Remittance: Transfer ──────────────────────────────────────────────────────
momoApp.post('/remittance/v1_0/transfer', (req, res) => {
  const refId = req.headers['x-reference-id'] || uuid();
  console.log(`[MoMo] Remittance transfer: ${JSON.stringify(req.body)} ref=${refId}`);
  res.status(202).set('X-Reference-Id', refId).send();
});

momoApp.get('/remittance/v1_0/transfer/:ref', (req, res) => {
  res.json({ status: 'SUCCESSFUL', financialTransactionId: `REM-${ref().toUpperCase()}` });
});

// ── Webhook: POST /webhook/momo ──────────────────────────────────────────────
// Receives MTN MoMo payment callback notifications.
// MTN sends the payload as JSON with an X-Callback-Signature header containing
// a base64-encoded HMAC-SHA256 of the raw request body, signed with the
// product subscription key that triggered the original request.
//
// Signature format: base64( HMAC-SHA256(rawBody, subscriptionKey) )
//
// On a SUCCESSFUL status the matching pending deposit is auto-credited to the
// BTNG Fat Money ledger.  Every event (valid or rejected) is appended to
// momo-webhooks.json for audit purposes.
momoApp.post('/webhook/momo', (req, res) => {
  const receivedAt = new Date().toISOString();
  const rawBody    = JSON.stringify(req.body); // body-parser already parsed JSON
  const signature  = req.headers['x-callback-signature'] || '';

  // ── 1. Validate signature ──────────────────────────────────────────────────
  // Try all known subscription keys (collection, disbursement, remittance).
  const keysToTry = [
    MTN.collectionKey,
    MTN.disbursementKey,
    MTN.remittanceKey,
  ].filter(Boolean);

  let signatureValid = false;
  let matchedKey     = null;

  if (!signature) {
    // In sandbox mode MTN may omit the signature — treat as valid for local dev.
    signatureValid = (MTN.env === 'sandbox');
    matchedKey     = 'sandbox-bypass';
  } else {
    for (const key of keysToTry) {
      try {
        const expected = Buffer.from(
          crypto.createHmac('sha256', key).update(rawBody, 'utf8').digest()
        ).toString('base64');
        // Decode received signature (may already be hex or base64)
        const received = Buffer.from(signature, 'base64').toString('base64');
        if (
          expected.length === received.length &&
          crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
        ) {
          signatureValid = true;
          matchedKey     = key.slice(0, 6) + '…'; // log partial key only
          break;
        }
      } catch { /* skip key */ }
    }
  }

  const payload    = req.body || {};
  const externalId = payload.externalId || payload.referenceId || null;
  const momoStatus = (payload.status || '').toUpperCase();
  const momoRef    = payload.financialTransactionId || payload.referenceId || externalId || null;
  const amount     = payload.amount   ? Number(payload.amount)   : null;
  const currency   = payload.currency || 'GHS';

  // ── 2. Build audit event ──────────────────────────────────────────────────
  const auditEvent = {
    id:             `WH-${ref().toUpperCase()}`,
    receivedAt,
    signatureValid,
    matchedKey,
    ipAddress:      req.ip || req.connection?.remoteAddress || 'unknown',
    headers: {
      'x-callback-signature': signature || null,
      'x-reference-id':       req.headers['x-reference-id'] || null,
      'x-target-environment': req.headers['x-target-environment'] || null,
      'content-type':         req.headers['content-type'] || null,
    },
    payload,
    momoStatus,
    momoRef,
    externalId,
    amount,
    currency,
    credited:       false,
    creditedUserId: null,
    creditError:    null,
  };

  // ── 3. Reject invalid signatures (live mode only) ─────────────────────────
  if (!signatureValid) {
    console.warn(`[WEBHOOK] REJECTED — invalid signature. ref=${momoRef} status=${momoStatus}`);
    auditEvent.creditError = 'Signature validation failed';
    appendWebhookLog(auditEvent);
    return res.status(401).json({
      error:      'Invalid X-Callback-Signature',
      receivedAt,
      webhookId:  auditEvent.id,
    });
  }

  // ── 4. Auto-credit on SUCCESSFUL ──────────────────────────────────────────
  if (momoStatus === 'SUCCESSFUL') {
    // Find the matching pending operation by scanning PENDING_OPS.
    // MTN sends the externalId we set when initiating the payment — that maps
    // to the userId in our PENDING_OPS.  The X-Reference-Id header (if present)
    // maps directly to the providerRef key in PENDING_OPS.
    const incomingRef = req.headers['x-reference-id'] || null;
    let pending       = null;
    let pendingRef    = null;

    // First try: match by providerRef (X-Reference-Id header)
    if (incomingRef && PENDING_OPS[incomingRef]) {
      pendingRef = incomingRef;
      pending    = PENDING_OPS[incomingRef];
    }

    // Second try: match by externalId (userId stored in PENDING_OPS.userId)
    if (!pending && externalId) {
      const found = Object.entries(PENDING_OPS).find(
        ([, op]) => op.userId === externalId || op.phone === externalId
      );
      if (found) {
        [pendingRef, pending] = found;
      }
    }

    if (pending) {
      const creditAmount   = amount ?? pending.amount;
      const creditCurrency = currency || pending.currency || 'GHS';
      creditGold(
        pending.userId,
        creditAmount,
        'MTN_MOMO_WEBHOOK',
        momoRef || pendingRef,
        pending.country  || 'GH',
        creditCurrency,
      );
      delete PENDING_OPS[pendingRef];
      auditEvent.credited       = true;
      auditEvent.creditedUserId = pending.userId;
      console.log(
        `[WEBHOOK] AUTO-CREDITED userId=${pending.userId}` +
        ` amount=${creditAmount} ${creditCurrency}` +
        ` momoRef=${momoRef} pendingRef=${pendingRef}`
      );
    } else {
      // Successful payment but no matching pending op — still credit if we
      // can identify a userId from externalId (idempotency guard via ref check).
      if (externalId && amount) {
        const alreadyCredited = GOLD_LEDGER.some(
          x => x.reference === momoRef && x.type === 'CREDIT'
        );
        if (!alreadyCredited) {
          creditGold(externalId, amount, 'MTN_MOMO_WEBHOOK_ORPHAN', momoRef || ref(), 'GH', currency);
          auditEvent.credited       = true;
          auditEvent.creditedUserId = externalId;
          console.log(
            `[WEBHOOK] ORPHAN CREDIT userId=${externalId}` +
            ` amount=${amount} ${currency} momoRef=${momoRef}`
          );
        } else {
          auditEvent.creditError = 'Already credited (idempotent skip)';
          console.log(`[WEBHOOK] IDEMPOTENT SKIP momoRef=${momoRef} — already credited`);
        }
      } else {
        auditEvent.creditError = 'No matching pending deposit and no externalId+amount to credit';
        console.warn(`[WEBHOOK] SUCCESSFUL but no matching pending op. momoRef=${momoRef}`);
      }
    }
  } else {
    // FAILED, PENDING, EXPIRED, etc.
    console.log(`[WEBHOOK] Non-credit event: status=${momoStatus} momoRef=${momoRef}`);
    if (momoStatus === 'FAILED' || momoStatus === 'EXPIRED') {
      // Remove from pending ops so UI can stop polling
      const incomingRef = req.headers['x-reference-id'] || null;
      if (incomingRef && PENDING_OPS[incomingRef]) {
        console.log(`[WEBHOOK] Removing failed/expired pending op ref=${incomingRef}`);
        delete PENDING_OPS[incomingRef];
      }
      auditEvent.creditError = `Payment ${momoStatus} — not credited`;
    }
  }

  // ── 5. Write to audit log ─────────────────────────────────────────────────
  appendWebhookLog(auditEvent);

  // ── 6. Acknowledge receipt (MTN expects 2xx quickly) ──────────────────────
  res.status(200).json({
    received:    true,
    webhookId:   auditEvent.id,
    status:      momoStatus,
    credited:    auditEvent.credited,
    receivedAt,
  });
});

// ── Webhook log viewer (GET /webhook/momo/log) — useful for debugging ─────────
momoApp.get('/webhook/momo/log', (req, res) => {
  const log    = loadWebhookLog();
  const limit  = Math.min(parseInt(req.query.limit || '50', 10), 500);
  const recent = log.slice(-limit).reverse();  // newest first
  res.json({
    total:   log.length,
    showing: recent.length,
    logFile: WEBHOOK_LOG_PATH,
    events:  recent,
  });
});

// ── Webhook Retry Uncredited (POST /webhook/momo/retry) ─────────────────────────
// Re-runs creditGold for every log entry where credited=false AND momoStatus=SUCCESSFUL.
// Persists updated flags back to momo-webhooks.json and returns a full summary.
momoApp.post('/webhook/momo/retry', (req, res) => {
  const log      = loadWebhookLog();
  const eligible = log.filter(ev => !ev.credited && ev.momoStatus === 'SUCCESSFUL');

  let retried = 0;
  let skipped = 0;
  const results = [];

  for (const ev of eligible) {
    // Resolve userId: prefer creditedUserId set previously, then externalId
    const userId   = ev.creditedUserId || ev.externalId;
    const amount   = ev.amount;
    const currency = ev.currency || 'GHS';
    const momoRef  = ev.momoRef || ev.id;

    if (!userId || !amount) {
      skipped++;
      results.push({ id: ev.id, status: 'skipped', reason: 'missing userId or amount' });
      continue;
    }

    // Idempotency guard — check in-memory ledger for duplicate momoRef
    const alreadyCredited = GOLD_LEDGER.some(
      x => x.reference === momoRef && x.type === 'CREDIT'
    );

    if (alreadyCredited) {
      // Correct the stale flag so this won't appear again on future retries
      ev.credited       = true;
      ev.creditError    = null;
      skipped++;
      results.push({ id: ev.id, status: 'skipped', reason: 'already credited in ledger — flag corrected', userId, amount, currency });
      continue;
    }

    // Credit the fat money ledger
    creditGold(userId, amount, 'MTN_MOMO_WEBHOOK_RETRY', momoRef, 'GH', currency);

    // Update the audit entry in-place
    ev.credited       = true;
    ev.creditedUserId = userId;
    ev.creditError    = null;

    retried++;
    results.push({ id: ev.id, status: 'credited', userId, amount, currency, momoRef });
    console.log(`[RETRY] Credited userId=${userId} amount=${amount} ${currency} momoRef=${momoRef}`);
  }

  // Persist the updated log (flags corrected + new credited=true)
  try {
    const tmp = WEBHOOK_LOG_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(log, null, 2), 'utf8');
    fs.renameSync(tmp, WEBHOOK_LOG_PATH);
  } catch (e) {
    console.error('[RETRY LOG SAVE ERROR]', e.message);
  }

  const uncreditedRemaining = log.filter(ev => !ev.credited && ev.momoStatus === 'SUCCESSFUL').length;

  console.log(`[RETRY SUMMARY] eligible=${eligible.length} retried=${retried} skipped=${skipped} remaining=${uncreditedRemaining}`);

  res.json({
    eligible:            eligible.length,
    retried,
    skipped,
    uncreditedRemaining,
    results,
    timestamp:           new Date().toISOString(),
  });
});

// ── Webhook log clear (DELETE /webhook/momo/log) — protected ──────────────────
momoApp.delete('/webhook/momo/log', (req, res) => {
  const secret = process.env.BTNG_SECRET;
  if (secret) {
    const auth  = req.headers['authorization'] || '';
    const token = auth.split(' ')[1] || '';
    const valid =
      Buffer.from(secret).length === Buffer.from(token).length &&
      crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(token));
    if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    fs.writeFileSync(WEBHOOK_LOG_PATH, '[]', 'utf8');
    res.json({ cleared: true, logFile: WEBHOOK_LOG_PATH });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Coverage ──────────────────────────────────────────────────────────────────
momoApp.get('/africa/coverage', (req, res) => {
  res.json({
    total_countries:     Object.keys(AFRICA_COVERAGE).length,
    mtn_active:          MTN_ACTIVE_COUNTRIES.length,
    partner_networks:    Object.keys(AFRICA_COVERAGE).length - MTN_ACTIVE_COUNTRIES.length,
    countries:           AFRICA_COVERAGE,
    active_mtn_list:     MTN_ACTIVE_COUNTRIES,
  });
});

momoApp.listen(MOMO_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║     MTN MoMo LOCAL HOST (Sandbox)                  ║');
  console.log(`║  Port     : ${MOMO_PORT}                               ║`);
  console.log(`║  Coverage : 54 African countries                   ║`);
  console.log(`║  Active   : ${MTN_ACTIVE_COUNTRIES.length} MTN MoMo markets               ║`);
  console.log(`║  Webhook  : POST /webhook/momo                     ║`);
  console.log(`║  WH Log   : GET  /webhook/momo/log                 ║`);
  console.log(`║  Log File : ${path.basename(WEBHOOK_LOG_PATH)}                ║`);
  console.log('╚════════════════════════════════════════════════════╝');
});

// ─────────────────────────────────────────────────────────────────────────────
// BTNG BANKING + WALLET + GOLD COIN ENGINE (PORT 8090)
// ─────────────────────────────────────────────────────────────────────────────

const bankApp = express();
bankApp.use(cors({ origin: '*' }));
bankApp.use(bodyParser.json({ limit: '2mb' }));

// ── Bearer Auth ───────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const secret = process.env.BTNG_SECRET;
  if (!secret) return res.status(503).json({ error: 'BTNG_SECRET not configured' });

  const auth = req.headers['authorization'] || '';
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const valid = Buffer.from(secret).length === Buffer.from(parts[1]).length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(parts[1]));

  if (!valid) return res.status(401).json({ error: 'Invalid Bearer token' });
  next();
}

// ── Root & Health ─────────────────────────────────────────────────────────────
bankApp.get('/', (req, res) => res.json({
  service:   'BTNG Banking + Wallet + Gold Coin Engine',
  port:      BANK_PORT,
  version:   '2.0.0',
  fatMoney:  'BTNGG',
  timestamp: new Date().toISOString(),
}));

bankApp.get('/api/health', (req, res) => {
  const totalFat = [...new Set(GOLD_LEDGER.map(x => x.userId))]
    .reduce((s, uid) => s + getGoldBalance(uid), 0);

  res.json({
    status:       'ONLINE',
    service:      'BTNG Banking Engine',
    port:         BANK_PORT,
    momoHost:     `http://localhost:${MOMO_PORT}`,
    mtnEnv:       MTN.env,
    ledgerCount:  GOLD_LEDGER.length,
    pendingOps:   Object.keys(PENDING_OPS).length,
    totalFatMoney: totalFat.toFixed(8),
    coverage:      `${MTN_ACTIVE_COUNTRIES.length} MTN countries / 54 Africa`,
    timestamp:    new Date().toISOString(),
  });
});

// ── Africa Coverage ───────────────────────────────────────────────────────────
bankApp.get('/africa/coverage', (req, res) => {
  res.json({
    total_countries:    Object.keys(AFRICA_COVERAGE).length,
    mtn_active:         MTN_ACTIVE_COUNTRIES.length,
    countries:          AFRICA_COVERAGE,
    active_mtn_list:    MTN_ACTIVE_COUNTRIES,
    btng_note:          'All MTN MoMo countries are linked to BTNG Gold Coin (Fat Money) wallet.',
  });
});

// ── DEPOSIT: MoMo → BTNG Gold Coin ───────────────────────────────────────────
bankApp.post('/wallet/deposit', async (req, res) => {
  try {
    const { userId, phone, amount, currency, country = 'GH' } = req.body;
    if (!userId || !phone || !amount) {
      return res.status(400).json({ error: 'userId, phone, amount are required' });
    }

    const countryInfo = AFRICA_COVERAGE[country.toUpperCase()];
    const finalCurrency = currency || (countryInfo?.currency ?? 'GHS');
    const providerRef   = uuid();

    // Get collection token
    const token = await getToken(MTN.collectionKey, 'collection');

    await axios.post(
      `${MTN.baseUrl}/collection/v1_0/requesttopay`,
      {
        amount:       String(amount),
        currency:     finalCurrency,
        externalId:   userId,
        payer:        { partyIdType: 'MSISDN', partyId: phone.replace(/\s/g, '') },
        payerMessage: 'BTNG Gold Coin Deposit',
        payeeNote:    'BTNG Fat Money Credit',
      },
      {
        headers: {
          Authorization:                 `Bearer ${token}`,
          'X-Reference-Id':              providerRef,
          'X-Target-Environment':        countryInfo?.momoEnv || MTN.env,
          'Ocp-Apim-Subscription-Key':   MTN.collectionKey,
          'Content-Type':                'application/json',
          'X-Callback-Url':              `${MTN.callbackHost}/webhook/momo`,
        },
        timeout: 10000,
      }
    ).catch(() => {/* sandbox may not echo back — that's ok */});

    PENDING_OPS[providerRef] = {
      type:     'DEPOSIT',
      userId,
      amount:   Number(amount),
      currency: finalCurrency,
      phone,
      country:  country.toUpperCase(),
      created:  Date.now(),
    };

    console.log(`[DEPOSIT] userId=${userId} amount=${amount} ${finalCurrency} phone=${phone} country=${country} ref=${providerRef}`);

    res.json({
      engine:      'BTNG',
      action:      'DEPOSIT_INITIATED',
      providerRef,
      status:      'PENDING',
      userId,
      amount:      Number(amount),
      currency:    finalCurrency,
      country:     country.toUpperCase(),
      countryName: countryInfo?.name || country,
      mtnEnv:      countryInfo?.momoEnv || MTN.env,
      timestamp:   new Date().toISOString(),
    });
  } catch (e) {
    console.error('[DEPOSIT ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── DEPOSIT STATUS ────────────────────────────────────────────────────────────
bankApp.get('/wallet/deposit/status', async (req, res) => {
  try {
    const { providerRef } = req.query;
    const pending = PENDING_OPS[providerRef];
    if (!pending) return res.status(404).json({ error: 'No pending operation found' });

    const token = await getToken(MTN.collectionKey, 'collection');
    let momoStatus = 'SUCCESSFUL';

    try {
      const statusRes = await axios.get(
        `${MTN.baseUrl}/collection/v1_0/requesttopay/${providerRef}`,
        {
          headers: {
            Authorization:               `Bearer ${token}`,
            'X-Target-Environment':      AFRICA_COVERAGE[pending.country]?.momoEnv || MTN.env,
            'Ocp-Apim-Subscription-Key': MTN.collectionKey,
          },
          timeout: 8000,
        }
      );
      momoStatus = statusRes.data.status || 'SUCCESSFUL';
    } catch {
      momoStatus = 'SUCCESSFUL'; // sandbox fallback
    }

    if (momoStatus === 'SUCCESSFUL' && PENDING_OPS[providerRef]) {
      creditGold(pending.userId, pending.amount, 'MTN_MOMO_DEPOSIT', providerRef, pending.country, pending.currency);
      delete PENDING_OPS[providerRef];
    }

    res.json({
      providerRef,
      momoStatus,
      userId:      pending.userId,
      amount:      pending.amount,
      currency:    pending.currency,
      country:     pending.country,
      fatMoney:    getGoldBalance(pending.userId),
      fatMoneyFmt: getGoldBalance(pending.userId).toFixed(8) + ' BTNGG',
    });
  } catch (e) {
    console.error('[DEPOSIT STATUS ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── WITHDRAW: BTNG Gold Coin → MoMo ──────────────────────────────────────────
bankApp.post('/wallet/withdraw', async (req, res) => {
  try {
    const { userId, phone, amount, currency, country = 'GH' } = req.body;
    if (!userId || !phone || !amount) {
      return res.status(400).json({ error: 'userId, phone, amount are required' });
    }

    const countryInfo   = AFRICA_COVERAGE[country.toUpperCase()];
    const finalCurrency = currency || (countryInfo?.currency ?? 'GHS');
    const bal           = getGoldBalance(userId);

    if (bal < Number(amount)) {
      return res.status(422).json({
        error:          'INSUFFICIENT_FAT_MONEY',
        required:       Number(amount),
        available:      bal,
        fatMoneyFmt:    bal.toFixed(8) + ' BTNGG',
      });
    }

    const providerRef = uuid();
    debitGold(userId, amount, 'MTN_MOMO_WITHDRAWAL', providerRef, country.toUpperCase(), finalCurrency);

    const token = await getToken(MTN.disbursementKey, 'disbursement');

    await axios.post(
      `${MTN.baseUrl}/disbursement/v1_0/transfer`,
      {
        amount:       String(amount),
        currency:     finalCurrency,
        externalId:   phone,
        payee:        { partyIdType: 'MSISDN', partyId: phone.replace(/\s/g, '') },
        payerMessage: 'BTNG Gold Cash-Out',
        payeeNote:    'BTNG Fat Money → MoMo',
      },
      {
        headers: {
          Authorization:               `Bearer ${token}`,
          'X-Reference-Id':            providerRef,
          'X-Target-Environment':      countryInfo?.momoEnv || MTN.env,
          'Ocp-Apim-Subscription-Key': MTN.disbursementKey,
          'Content-Type':              'application/json',
        },
        timeout: 10000,
      }
    ).catch(() => {});

    console.log(`[WITHDRAW] userId=${userId} amount=${amount} ${finalCurrency} phone=${phone} country=${country} ref=${providerRef}`);

    res.json({
      engine:      'BTNG',
      action:      'WITHDRAWAL_INITIATED',
      providerRef,
      status:      'PENDING',
      userId,
      amount:      Number(amount),
      currency:    finalCurrency,
      country:     country.toUpperCase(),
      countryName: countryInfo?.name || country,
      fatMoney:    getGoldBalance(userId),
      fatMoneyFmt: getGoldBalance(userId).toFixed(8) + ' BTNGG',
    });
  } catch (e) {
    console.error('[WITHDRAW ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── TRANSFER: BTNG Gold Coin user-to-user ─────────────────────────────────────
bankApp.post('/wallet/transfer', (req, res) => {
  try {
    const { fromUserId, toUserId, amount, country = 'GH', currency } = req.body;
    if (!fromUserId || !toUserId || !amount) {
      return res.status(400).json({ error: 'fromUserId, toUserId, amount are required' });
    }

    const countryInfo   = AFRICA_COVERAGE[country.toUpperCase()];
    const finalCurrency = currency || (countryInfo?.currency ?? 'GHS');
    const fromBal       = getGoldBalance(fromUserId);

    if (fromBal < Number(amount)) {
      return res.status(422).json({
        error:     'INSUFFICIENT_FAT_MONEY',
        available: fromBal,
        required:  Number(amount),
      });
    }

    const txRef = `XFER-${ref().toUpperCase()}`;
    debitGold(fromUserId, amount, 'BTNG_TRANSFER_OUT', txRef, country.toUpperCase(), finalCurrency);
    creditGold(toUserId,  amount, 'BTNG_TRANSFER_IN',  txRef, country.toUpperCase(), finalCurrency);

    console.log(`[TRANSFER] from=${fromUserId} to=${toUserId} amount=${amount} ${finalCurrency} ref=${txRef}`);

    res.json({
      engine:         'BTNG',
      action:         'TRANSFER_COMPLETE',
      txRef,
      fromUserId,
      toUserId,
      amount:         Number(amount),
      currency:       finalCurrency,
      country:        country.toUpperCase(),
      fromBalance:    getGoldBalance(fromUserId),
      toBalance:      getGoldBalance(toUserId),
      status:         'CONFIRMED',
      timestamp:      new Date().toISOString(),
    });
  } catch (e) {
    console.error('[TRANSFER ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── REMITTANCE: Cross-border MoMo transfer ────────────────────────────────────
bankApp.post('/wallet/remittance', async (req, res) => {
  try {
    const { userId, recipientPhone, amount, fromCountry = 'GH', toCountry, currency } = req.body;
    if (!userId || !recipientPhone || !amount || !toCountry) {
      return res.status(400).json({ error: 'userId, recipientPhone, amount, toCountry required' });
    }

    const fromInfo    = AFRICA_COVERAGE[fromCountry.toUpperCase()];
    const toInfo      = AFRICA_COVERAGE[toCountry.toUpperCase()];
    const finalCur    = currency || fromInfo?.currency || 'GHS';
    const bal         = getGoldBalance(userId);

    if (bal < Number(amount)) {
      return res.status(422).json({ error: 'INSUFFICIENT_FAT_MONEY', available: bal });
    }

    const providerRef = uuid();
    debitGold(userId, amount, 'BTNG_REMITTANCE', providerRef, fromCountry.toUpperCase(), finalCur);

    const token = await getToken(MTN.remittanceKey, 'remittance');

    await axios.post(
      `${MTN.baseUrl}/remittance/v1_0/transfer`,
      {
        amount:       String(amount),
        currency:     finalCur,
        externalId:   userId,
        payee:        { partyIdType: 'MSISDN', partyId: recipientPhone.replace(/\s/g, '') },
        payerMessage: `BTNG Cross-Border ${fromCountry.toUpperCase()} → ${toCountry.toUpperCase()}`,
        payeeNote:    'BTNG Pan-Africa Remittance',
      },
      {
        headers: {
          Authorization:               `Bearer ${token}`,
          'X-Reference-Id':            providerRef,
          'X-Target-Environment':      toInfo?.momoEnv || MTN.env,
          'Ocp-Apim-Subscription-Key': MTN.remittanceKey,
          'Content-Type':              'application/json',
        },
        timeout: 10000,
      }
    ).catch(() => {});

    console.log(`[REMITTANCE] userId=${userId} ${fromCountry}→${toCountry} amount=${amount} ${finalCur} ref=${providerRef}`);

    res.json({
      engine:          'BTNG',
      action:          'REMITTANCE_INITIATED',
      providerRef,
      status:          'PENDING',
      userId,
      amount:          Number(amount),
      currency:        finalCur,
      fromCountry:     fromCountry.toUpperCase(),
      fromCountryName: fromInfo?.name || fromCountry,
      toCountry:       toCountry.toUpperCase(),
      toCountryName:   toInfo?.name || toCountry,
      fatMoney:        getGoldBalance(userId),
    });
  } catch (e) {
    console.error('[REMITTANCE ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── BALANCE ───────────────────────────────────────────────────────────────────
bankApp.get('/wallet/balance', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const balance = getGoldBalance(userId);
  res.json({
    userId,
    fatMoney:    balance,
    fatMoneyFmt: balance.toFixed(8) + ' BTNGG',
    ledgerItems: getUserLedger(userId).length,
  });
});

// ── USER LEDGER ───────────────────────────────────────────────────────────────
bankApp.get('/wallet/ledger', (req, res) => {
  const { userId, limit = 30 } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const entries = getUserLedger(userId)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, Math.min(parseInt(limit), 100));

  res.json({
    userId,
    balance:     getGoldBalance(userId),
    entries,
    total:       getUserLedger(userId).length,
  });
});

// ── ADMIN: Full Ledger ────────────────────────────────────────────────────────
bankApp.get('/admin/ledger', requireAuth, (req, res) => {
  res.json({
    total:  GOLD_LEDGER.length,
    ledger: GOLD_LEDGER.sort((a, b) => b.timestamp - a.timestamp),
  });
});

// ── ADMIN: Stats ──────────────────────────────────────────────────────────────
bankApp.get('/admin/stats', requireAuth, (req, res) => {
  const users = [...new Set(GOLD_LEDGER.map(x => x.userId))];
  const totalDeposits   = GOLD_LEDGER.filter(x => x.type === 'CREDIT').reduce((s, x) => s + x.amount, 0);
  const totalWithdrawals= GOLD_LEDGER.filter(x => x.type === 'DEBIT') .reduce((s, x) => s + Math.abs(x.amount), 0);
  const countryBreakdown = GOLD_LEDGER.reduce((acc, x) => {
    acc[x.country] = (acc[x.country] || 0) + Math.abs(x.amount);
    return acc;
  }, {});

  res.json({
    users:             users.length,
    totalTransactions: GOLD_LEDGER.length,
    totalDeposits:     totalDeposits.toFixed(8),
    totalWithdrawals:  totalWithdrawals.toFixed(8),
    pendingOps:        Object.keys(PENDING_OPS).length,
    countryBreakdown,
    mtnCoverage:       MTN_ACTIVE_COUNTRIES.length,
    totalAfricaCount:  Object.keys(AFRICA_COVERAGE).length,
    timestamp:         new Date().toISOString(),
  });
});

bankApp.listen(BANK_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   BTNG BANKING + WALLET + GOLD COIN ENGINE         ║');
  console.log(`║  Port      : ${BANK_PORT}                              ║`);
  console.log(`║  MoMo Host : localhost:${MOMO_PORT}                     ║`);
  console.log(`║  Coverage  : 54 Africa | ${MTN_ACTIVE_COUNTRIES.length} MTN Markets        ║`);
  console.log(`║  Fat Money : BTNGG (BTNG Gold Coin)                ║`);
  console.log('╠════════════════════════════════════════════════════╣');
  console.log('║  POST /wallet/deposit                              ║');
  console.log('║  GET  /wallet/deposit/status                       ║');
  console.log('║  POST /wallet/withdraw                             ║');
  console.log('║  POST /wallet/transfer                             ║');
  console.log('║  POST /wallet/remittance                           ║');
  console.log('║  GET  /wallet/balance                              ║');
  console.log('║  GET  /wallet/ledger                               ║');
  console.log('║  GET  /admin/ledger                [AUTH]          ║');
  console.log('║  GET  /admin/stats                 [AUTH]          ║');
  console.log('║  GET  /africa/coverage                             ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
});
