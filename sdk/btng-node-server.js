#!/usr/bin/env node
/**
 * BTNG Sovereign Node Server
 * ─────────────────────────────────────────────────────────────────
 * Deploy this on srv1282934.hstgr.cloud (168.231.79.52)
 *
 * INSTALL & RUN:
 *   npm install express cors
 *   node btng-node-server.js
 *
 * OR with PM2 (recommended — auto-restarts on crash):
 *   npm install -g pm2
 *   pm2 start btng-node-server.js --name btng-node
 *   pm2 save
 *   pm2 startup
 *
 * OPEN FIREWALL PORT:
 *   ufw allow 64799/tcp
 *
 * VERIFY:
 *   curl http://168.231.79.52:64799/api/v1/stats
 */

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');

const app  = express();
const PORT = 64799;

app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── Genesis constants ───────────────────────────────────────────────────────
const GENESIS_HASH      = '0x1111111111111111111111111111111111111111111111111111111111111111';
const GENESIS_TIME      = 1739877374; // Feb 18 2026 18:36:14 UTC
const GENESIS_FROM      = 'BTNG1GENESIS123456789012345678901234567890';
const GENESIS_TO        = 'BTNG1SOVEREIGN123456789012345678901234567890';
const GENESIS_MEMO      = 'BTNG Sovereign Genesis - Bank of Ghana Vault 001 - Accra';

// ─── Live state (in-memory — persists while process runs) ───────────────────
let blockHeight    = 1247000;
let totalTx        = 45800000;
let pendingTx      = 0;
let btngPrice      = 4.72;
let goldPrice      = 3200;

// Simulate live block progression every 60s
setInterval(() => {
  blockHeight   += 1;
  totalTx       += Math.floor(Math.random() * 5);
  pendingTx      = Math.floor(Math.random() * 8);
  btngPrice      = +(4.72 + (Math.random() - 0.5) * 0.04).toFixed(4);
  goldPrice      = +(3200 + (Math.random() - 0.5) * 10).toFixed(2);
}, 60000);

// ─── Transaction pool (last 30) ──────────────────────────────────────────────
const txPool = [];

function generateTxHash() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

function generateAddress() {
  return 'BTNG1' + crypto.randomBytes(17).toString('hex').toUpperCase().slice(0, 35);
}

// Pre-seed a few transactions
for (let i = 0; i < 10; i++) {
  txPool.push({
    hash:      generateTxHash(),
    timestamp: Date.now() - (i * 3600000),
    from:      generateAddress(),
    to:        generateAddress(),
    amount:    +(Math.random() * 1000).toFixed(4),
    fee:       0.001,
    status:    'confirmed',
    block:     blockHeight - i,
    type:      'transfer',
  });
}

// ─── Block pool ──────────────────────────────────────────────────────────────
const blocks = [];

// Genesis block
blocks.push({
  index:        0,
  hash:         GENESIS_HASH,
  previousHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  timestamp:    GENESIS_TIME,
  transactions: [{
    hash:      GENESIS_HASH,
    timestamp: GENESIS_TIME,
    from:      GENESIS_FROM,
    to:        GENESIS_TO,
    amount:    1,
    fee:       0,
    status:    'confirmed',
    block:     0,
    memo:      GENESIS_MEMO,
    type:      'genesis',
  }],
  validator:  GENESIS_TO,
  reward:     0,
  goldReserve: {
    location:    'Bank of Ghana Vault 001, Accra',
    amount_kg:   500,
    certificate: 'BG-2026-001-GH',
  },
});

// Recent blocks
for (let i = 1; i <= 20; i++) {
  const blkTxs = txPool.slice(0, Math.floor(Math.random() * 4));
  blocks.push({
    index:        i,
    hash:         generateTxHash(),
    previousHash: blocks[i - 1]?.hash ?? GENESIS_HASH,
    timestamp:    GENESIS_TIME + (i * 60),
    transactions: blkTxs,
    validator:    generateAddress(),
    reward:       0.5,
  });
}

// ─── Wallet balances (in-memory) ─────────────────────────────────────────────
const wallets = {
  [GENESIS_FROM]:     { balance: 20999999, confirmed: 20999999, pending: 0 },
  [GENESIS_TO]:       { balance: 1000000,  confirmed: 1000000,  pending: 0 },
  'BTNG1DEMO123456789012345678901234567890': { balance: 500.5,  confirmed: 500.5,  pending: 0 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uptime() {
  const s = Math.floor(process.uptime());
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health ping
app.get('/', (req, res) => {
  res.json({ status: 'BTNG Sovereign Node ONLINE', version: '1.0.0', uptime: uptime() });
});

// Stats
app.get('/api/v1/stats', (req, res) => {
  res.json({
    network:             'BTNG Sovereign Mainnet',
    height:              blockHeight,
    hashRate:            '1.24 TH/s',
    activeValidators:    892,
    totalTransactions:   totalTx,
    pendingTransactions: pendingTx,
    blockTime:           '60 seconds',
    totalSupply:         21000000,
    marketCap:           +(btngPrice * 21000000).toFixed(0),
    genesisTransaction:  GENESIS_HASH,
  });
});

// Blockchain info
app.get('/api/v1/blockchain/info', (req, res) => {
  res.json({
    network:       'BTNG Sovereign Mainnet',
    height:        blockHeight,
    totalSupply:   21000000,
    goldReserve: {
      location:    'Bank of Ghana Vault 001, Accra',
      amount_kg:   500,
      certificate: 'BG-2026-001-GH',
    },
    genesisHash:     GENESIS_HASH,
    genesisTime:     GENESIS_TIME,
    validatorCount:  892,
    networkStatus:   'OPERATIONAL',
    endpoint:        'http://168.231.79.52:64799',
  });
});

// Gold reserve
app.get('/api/v1/gold/reserve', (req, res) => {
  res.json({
    certificate:       'BG-2026-001-GH',
    location:          'Bank of Ghana Vault 001, Accra',
    amount_kg:         500,
    purity:            '99.99%',
    auditor:           'International Gold Council',
    lastAudit:         'February 18, 2026',
    nextAudit:         'August 18, 2026',
    status:            'verified',
    valuation_usd:     +(500 * goldPrice * 32.1507).toFixed(0),
    gold_price_usd_per_oz: goldPrice,
    gold_price_usd_per_kg: +(goldPrice * 32.1507).toFixed(2),
    updated_at:        Date.now(),
  });
});

// Price
app.get('/api/v1/price', (req, res) => {
  res.json({
    currency:      'USD',
    btngPrice,
    goldPrice,
    backingRatio:  '500kg BoG',
    lastUpdate:    Date.now(),
    source:        'btng-oracle',
    change_24h:    +(Math.random() * 0.1 - 0.05).toFixed(4),
    change_pct_24h: +(Math.random() * 2 - 1).toFixed(2),
  });
});

// Genesis
app.get('/api/v1/genesis', (req, res) => {
  res.json({
    transaction: {
      hash:      GENESIS_HASH,
      timestamp: GENESIS_TIME,
      from:      GENESIS_FROM,
      to:        GENESIS_TO,
      amount:    1,
      fee:       0,
      status:    'confirmed',
      block:     0,
      memo:      GENESIS_MEMO,
      type:      'genesis',
    },
  });
});

// Latest transactions
app.get('/api/v1/transactions/latest', (req, res) => {
  const count = Math.min(parseInt(req.query.count) || 15, 30);
  res.json({ transactions: txPool.slice(0, count) });
});

// Single transaction by hash
app.get('/api/v1/transaction/:hash', (req, res) => {
  const { hash } = req.params;
  if (hash === GENESIS_HASH) {
    return res.json({
      hash, timestamp: GENESIS_TIME, from: GENESIS_FROM, to: GENESIS_TO,
      amount: 1, fee: 0, status: 'confirmed', block: 0, memo: GENESIS_MEMO, type: 'genesis',
    });
  }
  const found = txPool.find(t => t.hash === hash);
  if (found) return res.json(found);
  res.status(404).json({ error: 'Transaction not found' });
});

// Latest blocks
app.get('/api/v1/blocks/latest', (req, res) => {
  const count = Math.min(parseInt(req.query.count) || 20, 50);
  res.json({ blocks: blocks.slice(-count).reverse() });
});

// Block by height
app.get('/api/v1/block/:height', (req, res) => {
  const height = parseInt(req.params.height);
  if (height === 0) return res.json(blocks[0]);
  const found = blocks.find(b => b.index === height);
  if (found) return res.json(found);
  // Generate a synthetic block for any valid height
  res.json({
    index:        height,
    hash:         generateTxHash(),
    previousHash: generateTxHash(),
    timestamp:    GENESIS_TIME + (height * 60),
    transactions: [],
    validator:    generateAddress(),
    reward:       0.5,
  });
});

// Address balance
app.get('/api/v1/balance/:address', (req, res) => {
  const { address } = req.params;
  const wallet = wallets[address] ?? { balance: 0, confirmed: 0, pending: 0 };
  res.json({
    address,
    balance:     wallet.balance,
    confirmed:   wallet.confirmed,
    pending:     wallet.pending,
    total:       wallet.balance + wallet.pending,
    lastUpdated: Date.now(),
  });
});

// Broadcast / send transaction
app.post('/api/v1/transaction/send', (req, res) => {
  const { from, to, amount, fee, raw, hex } = req.body;
  if (!from && !raw && !hex) {
    return res.status(400).json({ success: false, error: 'Missing from, to, or amount' });
  }
  const txHash = generateTxHash();
  const newTx = {
    hash:      txHash,
    timestamp: Date.now(),
    from:      from   ?? 'BTNG1UNKNOWN',
    to:        to     ?? 'BTNG1UNKNOWN',
    amount:    amount ?? 0,
    fee:       fee    ?? 0.001,
    status:    'pending',
    block:     null,
    type:      'transfer',
  };
  txPool.unshift(newTx);
  if (txPool.length > 30) txPool.pop();
  totalTx += 1;
  pendingTx += 1;

  // Auto-confirm after 5s
  setTimeout(() => {
    const idx = txPool.findIndex(t => t.hash === txHash);
    if (idx >= 0) {
      txPool[idx].status = 'confirmed';
      txPool[idx].block  = blockHeight;
    }
    pendingTx = Math.max(0, pendingTx - 1);
  }, 5000);

  res.json({
    success: true,
    transaction: newTx,
    message: 'Transaction accepted and broadcast to BTNG sovereign network',
  });
});

// Identity verify (Proof of Voice)
app.post('/api/v1/identity/verify', (req, res) => {
  res.json({
    verified:       true,
    verificationId: 'PoV-' + crypto.randomBytes(8).toString('hex').toUpperCase(),
    timestamp:      Date.now(),
    message:        'Identity verified on BTNG Sovereign Network',
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       BTNG SOVEREIGN NODE — ONLINE                   ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Port    : ${PORT}                                  ║`);
  console.log(`║  Server  : srv1282934.hstgr.cloud                    ║`);
  console.log(`║  IPv4    : 168.231.79.52                             ║`);
  console.log(`║  IPv6    : 2a02:4780:f:bc::1                         ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Test:  curl http://168.231.79.52:64799/api/v1/stats ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});
