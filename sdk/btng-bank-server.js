#!/usr/bin/env node
/**
 * BTNG Gold Coin — Bank Wallet Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure Node.js/Express port of the BTNGGoldCoinBankWallet TypeScript class.
 * Mirrors localhost:8090 HTML dashboard endpoints.
 *
 * INSTALL & RUN:
 *   npm install express cors crypto
 *   node btng-bank-server.js
 *
 * OR with PM2:
 *   npm install -g pm2
 *   pm2 start btng-bank-server.js --name btng-bank
 *   pm2 save && pm2 startup
 *
 * OPEN FIREWALL PORT:
 *   ufw allow 8090/tcp
 *
 * VERIFY:
 *   curl http://localhost:8090/api/health
 *
 * API ENDPOINTS:
 *   GET  /api/health
 *   POST /api/wallet/create
 *   GET  /api/wallet/:accountNumber
 *   POST /api/wallet/send
 *   POST /api/wallet/receive
 *   GET  /api/wallet/:accountNumber/balance
 *   GET  /api/wallet/:accountNumber/transactions
 *   GET  /api/admin/wallets
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');

const app         = express();
const PORT        = 8090;
const WALLETS_FILE = path.join(__dirname, 'btng-wallets.json');

// ─── Persistence Helpers ─────────────────────────────────────────────────────

/**
 * Load wallets from btng-wallets.json into walletStore on startup.
 * Creates the file if it does not exist yet.
 */
function loadWallets() {
  try {
    if (!fs.existsSync(WALLETS_FILE)) {
      fs.writeFileSync(WALLETS_FILE, '{}', 'utf8');
      console.log('[PERSIST] Created new btng-wallets.json');
      return;
    }
    const raw  = fs.readFileSync(WALLETS_FILE, 'utf8');
    const data = JSON.parse(raw);
    let count  = 0;
    for (const [accountNumber, walletData] of Object.entries(data)) {
      // Defensive: ensure required fields exist before restoring
      if (walletData && walletData.address && walletData.privateKey) {
        walletStore.set(accountNumber, walletData);
        count++;
      }
    }
    console.log(`[PERSIST] Loaded ${count} wallet(s) from btng-wallets.json`);
  } catch (e) {
    console.error('[PERSIST] Failed to load wallets:', e.message);
  }
}

/**
 * Save all wallets in walletStore to btng-wallets.json.
 * Called after every create / send / receive operation.
 */
function saveWallets() {
  try {
    const data = {};
    for (const [accountNumber, walletData] of walletStore.entries()) {
      data[accountNumber] = walletData;
    }
    const json = JSON.stringify(data, null, 2);
    // Atomic write: write to a temp file then rename to prevent corruption
    const tmpFile = WALLETS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, json, 'utf8');
    fs.renameSync(tmpFile, WALLETS_FILE);
  } catch (e) {
    console.error('[PERSIST] Failed to save wallets:', e.message);
  }
}

app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── JWT / Bearer Auth Middleware ────────────────────────────────────────────
// Protects: POST /api/wallet/send, POST /api/wallet/receive, GET /api/admin/wallets
// Set BTNG_SECRET env var before starting the server:
//   BTNG_SECRET=your_secret_here node btng-bank-server.js
//
// Clients must send:  Authorization: Bearer <BTNG_SECRET>
//
function requireAuth(req, res, next) {
  const BTNG_SECRET = process.env.BTNG_SECRET;

  if (!BTNG_SECRET) {
    // Secret not configured — block all requests to protected routes
    return res.status(503).json({
      success: false,
      error:   'Server misconfiguration: BTNG_SECRET env var is not set. ' +
               'Start the server with:  BTNG_SECRET=<your_secret> node btng-bank-server.js',
    });
  }

  const authHeader = req.headers['authorization'] ?? '';
  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({
      success: false,
      error:   'Unauthorized — missing or malformed Authorization header. ' +
               'Expected:  Authorization: Bearer <token>',
    });
  }

  const token = parts[1];

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(BTNG_SECRET);
  const provided = Buffer.from(token);
  const valid =
    expected.length === provided.length &&
    crypto.timingSafeEqual(expected, provided);

  if (!valid) {
    return res.status(401).json({
      success: false,
      error:   'Unauthorized — invalid Bearer token.',
    });
  }

  next();
}

// ─── Reserve Constants ────────────────────────────────────────────────────────
const RESERVES = {
  ecoverlineData: 30_000_000_000_000,
  goldReserve:    29_500_000_000_000,
  total:          59_500_000_000_000,
};

const TRANSACTION_FEE_RATE = 0.001; // 0.1%
const COUNTRY_DEFAULT      = 'GH';

// ─── In-Memory Wallet Store ───────────────────────────────────────────────────
// Maps accountNumber → walletData object — seeded from btng-wallets.json on startup
const walletStore = new Map();

// ─── BIP-39 Style Wordbank (256 words) ───────────────────────────────────────
const WORD_BANK = [
  'abandon','ability','able','about','above','absent','absorb','abstract',
  'absurd','abuse','access','accident','account','accuse','achieve','acid',
  'acoustic','acquire','across','action','actor','africa','agent','agree',
  'ahead','aim','airport','aisle','alarm','album','alcohol','alert',
  'alien','all','alley','allow','almost','alone','alpha','already',
  'also','alter','always','amateur','amazing','among','amount','amused',
  'anchor','angel','angry','animal','another','antenna','antique','anxiety',
  'april','arch','arctic','area','arena','argue','armed','armor',
  'army','around','arrange','arrest','arrive','arrow','art','asset',
  'atom','auction','audit','august','aunt','author','autumn','average',
  'avocado','award','aware','away','awful','awkward','bacon','badge',
  'balance','bamboo','banana','banner','barely','bargain','barrel','base',
  'basic','battle','beach','bean','beauty','because','become','before',
  'begin','behave','behind','believe','below','belt','bench','benefit',
  'best','betray','better','between','beyond','bicycle','bid','bike',
  'bind','biology','bird','birth','bitter','black','blade','blame',
  'blast','bleak','bless','blind','blood','blossom','blouse','blue',
  'blur','blush','board','boat','body','boil','bomb','bone',
  'bonus','book','boost','border','boring','borrow','boss','bottom',
  'bounce','brain','brand','brave','bread','breeze','bridge','brief',
  'bright','bring','brisk','broccoli','broken','bronze','broom','brother',
  'brown','brush','bubble','buddy','budget','buffalo','build','bulb',
  'bulk','bullet','bundle','bunker','burden','burger','burst','bus',
  'business','busy','butter','buyer','buzz','cabbage','cabin','cable',
  'cactus','cage','cake','call','calm','camera','camp','canal',
  'cancel','candy','cannon','canvas','canyon','capable','capital','captain',
  'car','carbon','card','cargo','carpet','carry','cart','case',
  'cash','castle','casual','catalog','catch','category','cause','cave',
  'ceiling','celery','cement','census','century','cereal','certain','chair',
  'chalk','champion','change','chaos','chapter','charge','chase','cheap',
  'check','cheese','chef','cherry','chest','chicken','chief','child',
  'chimney','choice','choose','chronic','chuckle','chunk','cigar','cinnamon',
  'circle','citizen','city','civil','claim','clap','clarify','claw',
  'clay','clean','clerk','clever','click','client','cliff','climb',
  'clinic','clip','clock','clog','close','cloth','cloud','clown',
  'club','clump','cluster','clutch','coach','coast','coconut','code',
  'coffee','coil','coin','collect','color','column','combine','come',
  'comfort','comic','common','company','concert','conduct','confirm','congress',
  'connect','consider','control','convince','cook','cool','copper','copy',
  'coral','core','corn','correct','cost','cotton','couch','country',
  'couple','course','cousin','cover','coyote','crack','cradle','craft',
  'cram','crane','crash','crater','crawl','crazy','cream','credit',
  'creek','crew','cricket','crisp','critic','cross','crouch','crowd',
  'crucial','cruel','cruise','crumble','crunch','crush','cry','crystal',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateMnemonic() {
  const indices = Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * WORD_BANK.length),
  );
  return indices.map(i => WORD_BANK[i]).join(' ');
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function createWallet({ countryCode, fullName, email, initialDeposit }) {
  const country  = (countryCode ?? COUNTRY_DEFAULT).slice(0, 2).toUpperCase();
  const nonce    = crypto.randomBytes(8).toString('hex') + Date.now().toString(16);
  const mnemonic = generateMnemonic();

  const privateKey = sha256Hex(`BTNG-PRIVATE-${mnemonic}-${nonce}`).toUpperCase();
  const publicKey  = sha256Hex(`BTNG-PUBLIC-${privateKey}`).toUpperCase();
  const addrHash   = sha256Hex(publicKey);
  const address    = `BTNG-GOLD-${country}-${addrHash.slice(0, 32).toUpperCase()}`;
  const accountNumber = `BTNG-${Date.now().toString().slice(-8)}${addrHash.slice(32, 40).toUpperCase()}`;

  const wallet = {
    accountNumber,
    address,
    publicKey,
    privateKey,
    mnemonic,
    balance:      0,
    transactions: [],
    createdAt:    Date.now(),
    countryCode:  country,
    fullName:     fullName ?? null,
    email:        email    ?? null,
  };

  if (initialDeposit && initialDeposit > 0) {
    const rx = await receiveFunds(wallet, 'Genesis Reserve Fund', initialDeposit);
    wallet.transactions.unshift(rx);
    wallet.balance = +(wallet.balance + initialDeposit).toFixed(8);
  }

  return wallet;
}

function signTransaction(privateKey, amount, counterparty) {
  const raw = `${amount}|${counterparty}|${privateKey}|${Date.now()}`;
  return sha256Hex(raw).slice(0, 64).toUpperCase();
}

function sendFunds(wallet, recipientAddress, amount, privateKey) {
  if (privateKey.trim().toUpperCase() !== wallet.privateKey) {
    throw new Error('Invalid private key — authorisation denied');
  }
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  if (amount > wallet.balance) throw new Error('Insufficient balance');

  const fee   = parseFloat((amount * TRANSACTION_FEE_RATE).toFixed(8));
  const total = amount + fee;
  const sig   = signTransaction(wallet.privateKey, amount, recipientAddress);

  const tx = {
    id:        `BTNG-TX-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    type:      'send',
    from:      wallet.address,
    to:        recipientAddress,
    amount,
    fee,
    timestamp: Date.now(),
    status:    'confirmed',
    signature: sig,
  };

  wallet.balance  = parseFloat((wallet.balance - total).toFixed(8));
  wallet.transactions.unshift(tx);
  return tx;
}

async function receiveFunds(wallet, senderAddress, amount) {
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  const sig = signTransaction(wallet.privateKey ?? 'GENESIS', amount, senderAddress);

  const tx = {
    id:        `BTNG-RX-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    type:      'receive',
    from:      senderAddress,
    to:        wallet.address,
    amount,
    fee:       0,
    timestamp: Date.now(),
    status:    'confirmed',
    signature: sig,
  };

  wallet.balance = parseFloat((wallet.balance + amount).toFixed(8));
  wallet.transactions.unshift(tx);
  return tx;
}

function uptime() {
  const s = Math.floor(process.uptime());
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m ${s % 60}s`;
}

function fmtBig(v) {
  return `$${(v / 1e12).toFixed(1)}T`;
}

// ─── Middleware: rate-limit safety header ─────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-BTNG-Node', 'bank-wallet-8090');
  next();
});

// ─── Route: GET /api/health ───────────────────────────────────────────────────
/**
 * Returns server health status, reserve totals, session stats.
 * No auth required.
 */
app.get('/api/health', (req, res) => {
  const wallets = [...walletStore.values()];
  const totalBalance  = wallets.reduce((s, w) => s + w.balance, 0);
  const totalTx       = wallets.reduce((s, w) => s + w.transactions.length, 0);

  res.json({
    status:   'BTNG Bank Wallet Server ONLINE',
    version:  '1.0.0',
    port:     PORT,
    uptime:   uptime(),
    reserves: {
      total:          RESERVES.total,
      ecoverlineData: RESERVES.ecoverlineData,
      goldReserve:    RESERVES.goldReserve,
      formatted: {
        total:          fmtBig(RESERVES.total),
        ecoverlineData: fmtBig(RESERVES.ecoverlineData),
        goldReserve:    fmtBig(RESERVES.goldReserve),
      },
    },
    session: {
      walletCount:  wallets.length,
      totalBalance: +totalBalance.toFixed(8),
      totalTx,
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── Route: POST /api/wallet/create ──────────────────────────────────────────
/**
 * Create a new BTNG Gold Coin bank wallet with a public/private key pair.
 *
 * Body:
 *   { countryCode?, fullName, email?, initialDeposit? }
 *
 * Returns full wallet data including privateKey and mnemonic (shown ONCE).
 */
app.post('/api/wallet/create', async (req, res) => {
  const { countryCode, fullName, email, initialDeposit } = req.body ?? {};

  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ success: false, error: 'fullName is required' });
  }

  try {
    const wallet = await createWallet({
      countryCode,
      fullName: fullName.trim(),
      email: email?.trim() ?? null,
      initialDeposit: parseFloat(initialDeposit) > 0 ? parseFloat(initialDeposit) : 0,
    });

    // Store in session
    walletStore.set(wallet.accountNumber, wallet);
    saveWallets(); // persist immediately after creation

    res.status(201).json({
      success: true,
      message: 'BTNG wallet created. Save credentials immediately — shown only once.',
      wallet: {
        accountNumber: wallet.accountNumber,
        address:       wallet.address,
        publicKey:     wallet.publicKey,
        privateKey:    wallet.privateKey,   // ⚠️ Show once only
        mnemonic:      wallet.mnemonic,     // ⚠️ Show once only
        balance:       wallet.balance,
        countryCode:   wallet.countryCode,
        fullName:      wallet.fullName,
        email:         wallet.email,
        createdAt:     new Date(wallet.createdAt).toISOString(),
        transactionCount: wallet.transactions.length,
      },
    });
  } catch (e) {
    console.error('[CREATE WALLET ERROR]', e.message);
    res.status(500).json({ success: false, error: e.message ?? 'Failed to create wallet' });
  }
});

// ─── Route: GET /api/wallet/:accountNumber ────────────────────────────────────
/**
 * Get wallet details and current balance.
 * Returns wallet summary (privateKey and mnemonic are NOT returned for security).
 */
app.get('/api/wallet/:accountNumber', (req, res) => {
  const wallet = walletStore.get(req.params.accountNumber);
  if (!wallet) {
    return res.status(404).json({ success: false, error: 'Wallet not found' });
  }

  res.json({
    success: true,
    wallet: {
      accountNumber: wallet.accountNumber,
      address:       wallet.address,
      publicKey:     wallet.publicKey,
      balance:       wallet.balance,
      countryCode:   wallet.countryCode,
      fullName:      wallet.fullName,
      email:         wallet.email,
      createdAt:     new Date(wallet.createdAt).toISOString(),
      transactionCount: wallet.transactions.length,
    },
  });
});

// ─── Route: POST /api/wallet/send ─────────────────────────────────────────────
// 🔒 Protected — requires Authorization: Bearer <BTNG_SECRET>
/**
 * Send funds from a wallet.
 * Requires private key for authorization. A 0.1% fee is applied.
 *
 * Body:
 *   { accountNumber, recipientAddress, amount, privateKey }
 */
app.post('/api/wallet/send', requireAuth, (req, res) => {
  const { accountNumber, recipientAddress, amount, privateKey } = req.body ?? {};

  if (!accountNumber)    return res.status(400).json({ success: false, error: 'accountNumber is required' });
  if (!recipientAddress) return res.status(400).json({ success: false, error: 'recipientAddress is required' });
  if (!amount || isNaN(parseFloat(amount))) {
    return res.status(400).json({ success: false, error: 'Valid amount is required' });
  }
  if (!privateKey)       return res.status(400).json({ success: false, error: 'privateKey is required for authorization' });

  const wallet = walletStore.get(accountNumber);
  if (!wallet) {
    return res.status(404).json({ success: false, error: 'Wallet not found' });
  }

  try {
    const tx = sendFunds(wallet, recipientAddress.trim(), parseFloat(amount), privateKey.trim());
    saveWallets(); // persist updated balance + new transaction

    res.json({
      success: true,
      message: 'Transaction broadcast to BTNG sovereign network',
      transaction: tx,
      newBalance: wallet.balance,
      fee: tx.fee,
      feeRate: '0.1%',
    });
  } catch (e) {
    const code = e.message.includes('private key')    ? 401
               : e.message.includes('Insufficient')   ? 422
               : 400;
    res.status(code).json({ success: false, error: e.message });
  }
});

// ─── Route: POST /api/wallet/receive ─────────────────────────────────────────
// 🔒 Protected — requires Authorization: Bearer <BTNG_SECRET>
/**
 * Simulate receiving funds into a wallet.
 * No fee on incoming transactions.
 *
 * Body:
 *   { accountNumber, senderAddress, amount }
 */
app.post('/api/wallet/receive', requireAuth, async (req, res) => {
  const { accountNumber, senderAddress, amount } = req.body ?? {};

  if (!accountNumber) return res.status(400).json({ success: false, error: 'accountNumber is required' });
  if (!senderAddress) return res.status(400).json({ success: false, error: 'senderAddress is required' });
  if (!amount || isNaN(parseFloat(amount))) {
    return res.status(400).json({ success: false, error: 'Valid amount is required' });
  }

  const wallet = walletStore.get(accountNumber);
  if (!wallet) {
    return res.status(404).json({ success: false, error: 'Wallet not found' });
  }

  try {
    const tx = await receiveFunds(wallet, senderAddress.trim(), parseFloat(amount));
    saveWallets(); // persist updated balance + new transaction

    res.json({
      success: true,
      message: 'Funds received and credited to wallet',
      transaction: tx,
      newBalance: wallet.balance,
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ─── Route: GET /api/wallet/:accountNumber/balance ────────────────────────────
/**
 * Get current balance for a wallet.
 */
app.get('/api/wallet/:accountNumber/balance', (req, res) => {
  const wallet = walletStore.get(req.params.accountNumber);
  if (!wallet) {
    return res.status(404).json({ success: false, error: 'Wallet not found' });
  }

  res.json({
    success:       true,
    accountNumber: wallet.accountNumber,
    address:       wallet.address,
    balance:       wallet.balance,
    asset:         'BTNGG',
    goldBackedGHS: +(wallet.balance * 134.5).toFixed(2),
    lastUpdated:   new Date().toISOString(),
  });
});

// ─── Route: GET /api/wallet/:accountNumber/transactions ───────────────────────
/**
 * Get transaction history for a wallet.
 *
 * Query params:
 *   ?limit=30   — max transactions to return (default 30, max 100)
 *   ?type=send  — filter by type: 'send' | 'receive' | 'all' (default 'all')
 *   ?sort=date  — sort by: 'date' | 'amount' (default 'date')
 */
app.get('/api/wallet/:accountNumber/transactions', (req, res) => {
  const wallet = walletStore.get(req.params.accountNumber);
  if (!wallet) {
    return res.status(404).json({ success: false, error: 'Wallet not found' });
  }

  const limit  = Math.min(parseInt(req.query.limit)  || 30, 100);
  const type   = (req.query.type  || 'all').toLowerCase();
  const sort   = (req.query.sort  || 'date').toLowerCase();

  let txs = [...wallet.transactions];

  if (type !== 'all') {
    txs = txs.filter(tx => tx.type === type);
  }

  if (sort === 'amount') {
    txs.sort((a, b) => b.amount - a.amount);
  } else {
    txs.sort((a, b) => b.timestamp - a.timestamp);
  }

  txs = txs.slice(0, limit);

  const totalSent     = wallet.transactions.filter(t => t.type === 'send')   .reduce((s, t) => s + t.amount, 0);
  const totalReceived = wallet.transactions.filter(t => t.type === 'receive').reduce((s, t) => s + t.amount, 0);
  const totalFees     = wallet.transactions.filter(t => t.fee > 0)            .reduce((s, t) => s + t.fee,    0);

  res.json({
    success:       true,
    accountNumber: wallet.accountNumber,
    address:       wallet.address,
    balance:       wallet.balance,
    transactions:  txs,
    summary: {
      total:            wallet.transactions.length,
      returned:         txs.length,
      totalSent:        +totalSent.toFixed(8),
      totalReceived:    +totalReceived.toFixed(8),
      totalFees:        +totalFees.toFixed(8),
      netFlow:          +(totalReceived - totalSent).toFixed(8),
    },
    filters: { type, sort, limit },
  });
});

// ─── Route: GET /api/admin/wallets ────────────────────────────────────────────
// 🔒 Protected — requires Authorization: Bearer <BTNG_SECRET>
/**
 * Admin endpoint — returns summary of ALL wallets in the current session.
 * Sensitive fields (privateKey, mnemonic) are NEVER returned.
 *
 * Query params:
 *   ?sort=balance   — sort by: 'balance' | 'date' | 'txcount' (default 'date')
 *   ?limit=50       — max wallets to return (default 50, max 200)
 */
app.get('/api/admin/wallets', requireAuth, (req, res) => {
  const sort  = (req.query.sort  || 'date').toLowerCase();
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  let wallets = [...walletStore.values()].map(w => ({
    accountNumber:    w.accountNumber,
    address:          w.address,
    publicKey:        w.publicKey,
    balance:          w.balance,
    goldBackedGHS:    +(w.balance * 134.5).toFixed(2),
    countryCode:      w.countryCode,
    fullName:         w.fullName,
    email:            w.email,
    transactionCount: w.transactions.length,
    createdAt:        new Date(w.createdAt).toISOString(),
    lastActivity:     w.transactions.length > 0
                        ? new Date(w.transactions[0].timestamp).toISOString()
                        : new Date(w.createdAt).toISOString(),
  }));

  if (sort === 'balance') {
    wallets.sort((a, b) => b.balance - a.balance);
  } else if (sort === 'txcount') {
    wallets.sort((a, b) => b.transactionCount - a.transactionCount);
  } else {
    wallets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  wallets = wallets.slice(0, limit);

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);
  const totalTxs     = wallets.reduce((s, w) => s + w.transactionCount, 0);

  res.json({
    success: true,
    admin: {
      totalWallets:    walletStore.size,
      totalBalance:    +totalBalance.toFixed(8),
      totalTxs,
      reserveCover:    RESERVES.total,
      reserveFormatted: fmtBig(RESERVES.total),
      serverUptime:    uptime(),
      timestamp:       new Date().toISOString(),
    },
    wallets,
    filters: { sort, limit },
  });
});

// ─── Route: GET /api/admin/backup ───────────────────────────────────────────
// 🔒 Protected — requires Authorization: Bearer <BTNG_SECRET>
/**
 * Download the full btng-wallets.json as a JSON attachment.
 * Useful for taking snapshots before destructive operations.
 *
 * No query params.
 */
app.get('/api/admin/backup', requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(WALLETS_FILE)) {
      return res.status(404).json({
        success: false,
        error:   'btng-wallets.json does not exist yet — create a wallet first.',
      });
    }

    const raw  = fs.readFileSync(WALLETS_FILE, 'utf8');
    const data = JSON.parse(raw);
    const count = Object.keys(data).length;

    // Build a backup envelope with metadata
    const backup = {
      _meta: {
        generated_at:   new Date().toISOString(),
        wallet_count:   count,
        server_uptime:  uptime(),
        server_version: '1.0.0',
        reserves:       RESERVES,
      },
      wallets: data,
    };

    const filename = `btng-wallets-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(backup, null, 2));

    console.log(`[BACKUP] Exported ${count} wallet(s) → ${filename}`);
  } catch (e) {
    console.error('[BACKUP ERROR]', e.message);
    res.status(500).json({ success: false, error: e.message ?? 'Failed to read backup file' });
  }
});

// ─── Route: POST /api/admin/restore ──────────────────────────────────────────
// 🔒 Protected — requires Authorization: Bearer <BTNG_SECRET>
/**
 * Restore wallets from a JSON body produced by GET /api/admin/backup.
 * Supports two modes controlled by the `mode` field:
 *
 *   mode = 'merge'     (default) — adds/updates wallets without removing existing ones.
 *   mode = 'overwrite'           — replaces the entire wallet store.
 *
 * Body:
 *   {
 *     mode?: 'merge' | 'overwrite',
 *     wallets: { [accountNumber]: walletData }   // raw wallet store object
 *   }
 *
 * The body may also be the full backup envelope produced by GET /api/admin/backup
 * (i.e. { _meta: {...}, wallets: {...} }) — both formats are accepted.
 */
app.post('/api/admin/restore', requireAuth, (req, res) => {
  try {
    const body = req.body ?? {};

    // Accept both the raw store and the backup-envelope format
    const walletData = body.wallets ?? body;
    const mode       = (body.mode ?? 'merge').toLowerCase();

    if (!walletData || typeof walletData !== 'object' || Array.isArray(walletData)) {
      return res.status(400).json({
        success: false,
        error:   'Request body must contain a "wallets" object (accountNumber → walletData map).',
      });
    }

    // Strip _meta if it leaked into the wallet map
    delete walletData['_meta'];

    if (!['merge', 'overwrite'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error:   'Invalid mode. Use "merge" (default) or "overwrite".',
      });
    }

    const entries    = Object.entries(walletData);
    const validCount = entries.filter(([, v]) => v && v.address && v.privateKey).length;

    if (validCount === 0) {
      return res.status(400).json({
        success: false,
        error:   'No valid wallet entries found. Each entry must contain at least address and privateKey.',
      });
    }

    const previousCount = walletStore.size;

    if (mode === 'overwrite') {
      // Clear the entire store first
      walletStore.clear();
      console.log(`[RESTORE] Overwrite mode — cleared ${previousCount} existing wallet(s)`);
    }

    let imported  = 0;
    let skipped   = 0;
    const skippedList = [];

    for (const [accountNumber, data] of entries) {
      // Basic validation
      if (!data || !data.address || !data.privateKey) {
        skipped++;
        skippedList.push(accountNumber);
        continue;
      }

      // Ensure required defaults exist
      const normalised = {
        accountNumber: data.accountNumber ?? accountNumber,
        address:       data.address,
        publicKey:     data.publicKey  ?? '',
        privateKey:    data.privateKey,
        mnemonic:      data.mnemonic   ?? '',
        balance:       typeof data.balance === 'number' ? data.balance : 0,
        transactions:  Array.isArray(data.transactions) ? data.transactions : [],
        createdAt:     data.createdAt  ?? Date.now(),
        countryCode:   data.countryCode ?? 'GH',
        fullName:      data.fullName   ?? null,
        email:         data.email      ?? null,
      };

      walletStore.set(accountNumber, normalised);
      imported++;
    }

    // Persist the restored state to disk
    saveWallets();

    console.log(`[RESTORE] mode=${mode} imported=${imported} skipped=${skipped} total=${walletStore.size}`);

    res.json({
      success: true,
      message: `Restore complete (${mode} mode).`,
      summary: {
        mode,
        previousWalletCount: previousCount,
        imported,
        skipped,
        skippedAccounts:     skippedList,
        currentTotal:        walletStore.size,
        savedToDisk:         true,
      },
    });
  } catch (e) {
    console.error('[RESTORE ERROR]', e.message);
    res.status(500).json({ success: false, error: e.message ?? 'Restore failed' });
  }
});

// ─── Route: POST /api/admin/exec ────────────────────────────────────────────
// 🔒 Protected — requires Authorization: Bearer <BTNG_SECRET>
/**
 * Execute a whitelisted read-only server command.
 * Returns stdout/stderr as plain text — no destructive commands allowed.
 *
 * Body:
 *   { command: string }  — must match an entry in ALLOWED_COMMANDS exactly.
 */
const { exec: childExec } = require('child_process');

const ALLOWED_COMMANDS = [
  'uptime',
  'df -h',
  'df -i',
  'free -m',
  'who',
  'uname -a',
  'ps aux --sort=-%mem | head -10',
  'ps aux --sort=-%cpu | head -10',
  'pm2 list',
  'pm2 logs --lines 20 --nostream 2>&1 | tail -20',
  'ss -tuln',
  'node -v && npm -v',
];

app.post('/api/admin/exec', requireAuth, (req, res) => {
  const { command } = req.body ?? {};

  if (!command || typeof command !== 'string') {
    return res.status(400).json({ success: false, error: 'command (string) is required' });
  }

  const trimmedCmd = command.trim();

  if (!ALLOWED_COMMANDS.includes(trimmedCmd)) {
    return res.status(403).json({
      success:   false,
      error:     `Command not in allowlist: "${trimmedCmd}"`,
      allowlist: ALLOWED_COMMANDS,
    });
  }

  const startTime = Date.now();

  childExec(trimmedCmd, { timeout: 10_000, maxBuffer: 1024 * 256 }, (err, stdout, stderr) => {
    const elapsed_ms = Date.now() - startTime;
    const output     = (stdout || stderr || '').toString();
    const exitCode   = err ? (err.code ?? 1) : 0;

    console.log(`[EXEC] cmd="${trimmedCmd}" exit=${exitCode} elapsed=${elapsed_ms}ms`);

    res.json({
      success:    exitCode === 0,
      command:    trimmedCmd,
      output,
      exit_code:  exitCode,
      elapsed_ms,
      timestamp:  new Date().toISOString(),
    });
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   `Endpoint ${req.method} ${req.path} not found`,
    endpoints: [
      'GET  /api/health',
      'POST /api/wallet/create',
      'GET  /api/wallet/:accountNumber',
      'POST /api/wallet/send',
      'POST /api/wallet/receive',
      'GET  /api/wallet/:accountNumber/balance',
      'GET  /api/wallet/:accountNumber/transactions',
      'GET  /api/admin/wallets',
      'GET  /api/admin/backup',
      'POST /api/admin/restore',
      'POST /api/admin/exec',
    ],
  });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[BTNG BANK SERVER ERROR]', err);
  res.status(500).json({ success: false, error: err.message ?? 'Internal server error' });
});

// ─── Load persisted wallets before accepting connections ────────────────────
loadWallets();

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║     BTNG GOLD COIN — BANK WALLET SERVER            ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Port     : ${PORT}                                ║`);
  console.log(`║  Host     : 0.0.0.0 (all interfaces)               ║`);
  console.log(`║  Reserves : $59.5 Trillion sovereign cover         ║`);
  console.log(`║  Fee Rate : 0.1% per outgoing transaction           ║`);
  console.log('╠════════════════════════════════════════════════════╣');
  console.log('║  ENDPOINTS:                                        ║');
  console.log('║  GET  /api/health                                  ║');
  console.log('║  POST /api/wallet/create                           ║');
  console.log('║  GET  /api/wallet/:accountNumber                   ║');
  console.log('║  POST /api/wallet/send                             ║');
  console.log('║  POST /api/wallet/receive                          ║');
  console.log('║  GET  /api/wallet/:accountNumber/balance           ║');
  console.log('║  GET  /api/wallet/:accountNumber/transactions      ║');
  console.log('║  GET  /api/admin/wallets                           ║');
  console.log('║  GET  /api/admin/backup                            ║');
  console.log('║  POST /api/admin/restore                           ║');
  console.log('║  POST /api/admin/exec                              ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Auth   : Bearer token (BTNG_SECRET env var)       ║`);
  console.log(`║  Protected: /wallet/send · /receive · /admin/*     ║`);
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Persist: btng-wallets.json (auto-save on write)   ║`);
  console.log(`║  File   : ${WALLETS_FILE.slice(-40).padStart(40)} ║`);
  console.log('╠════════════════════════════════════════════════════╣');
  if (!process.env.BTNG_SECRET) {
    console.log('║  ⚠️  WARNING: BTNG_SECRET is not set!              ║');
    console.log('║  Protected routes will return 503 until set.       ║');
  } else {
    console.log('║  ✅  BTNG_SECRET loaded — auth middleware active    ║');
  }
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Test: curl http://localhost:${PORT}/api/health    ║`);
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
});
