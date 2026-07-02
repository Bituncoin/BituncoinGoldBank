/**
 * BTNG Gold Coin — PM2 Ecosystem Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * Defines all BTNG backend services as a single managed process group.
 *
 * QUICK START:
 *   npm install -g pm2
 *   pm2 start ecosystem.config.js
 *
 * INDIVIDUAL SERVICE:
 *   pm2 start ecosystem.config.js --only btng-bank
 *   pm2 start ecosystem.config.js --only btng-zone
 *   pm2 start ecosystem.config.js --only btng-node
 *
 * MANAGEMENT COMMANDS:
 *   pm2 list                        — show all process statuses
 *   pm2 logs                        — tail all logs
 *   pm2 logs btng-bank              — tail a single service
 *   pm2 monit                       — live dashboard (CPU, RAM, logs)
 *   pm2 restart ecosystem.config.js — rolling restart all services
 *   pm2 stop ecosystem.config.js    — stop all services
 *   pm2 delete ecosystem.config.js  — remove from PM2 registry
 *   pm2 save                        — persist process list across reboots
 *   pm2 startup                     — generate OS-level auto-start script
 *
 * ENVIRONMENT OVERRIDES:
 *   Override any env var at launch time:
 *   BTNG_SECRET=mysecret pm2 start ecosystem.config.js --only btng-bank
 *
 * FIREWALL RULES (run once on server):
 *   ufw allow 8090/tcp   # Bank Wallet
 *   ufw allow 8125/tcp   # Zone Engine
 *   ufw allow 64799/tcp  # Sovereign Node
 *   ufw allow 38984/tcp  # Gold Factory Stratum V2
 */

'use strict';

// ─── Shared Paths ─────────────────────────────────────────────────────────────

const LOG_DIR  = './logs/pm2';          // All PM2 logs land here (create it first: mkdir -p logs/pm2)
const SDK_DIR  = '.';                   // Relative to the directory where `pm2 start` is invoked

// ─── Shared Watch Ignore Patterns ────────────────────────────────────────────

const WATCH_IGNORE = [
  'node_modules',
  `${LOG_DIR}/**`,
  '*.log',
  '*.json',     // Ignore btng-wallets.json and other data files
  '.git',
  '__pycache__',
  '*.pyc',
  '*.tmp',
];

// ─── Shared Restart Policy ────────────────────────────────────────────────────

const RESTART_POLICY = {
  restart_delay:    4000,         // ms — wait 4s before restart to avoid CPU spin
  max_restarts:     10,           // give up after 10 consecutive crashes
  min_uptime:       '10s',        // must run ≥10s to count as a successful start
  exp_backoff_restart_delay: 100, // exponential backoff (100ms → doubles each attempt)
};

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  apps: [

    // ── 1. BTNG Bank Wallet Server (port 8090) ──────────────────────────────
    {
      name:         'btng-bank',
      script:       `${SDK_DIR}/btng-bank-server.js`,
      interpreter:  'node',

      // ── Cluster / Exec Mode ──────────────────────────────────────────────
      exec_mode:    'fork',         // single process; switch to 'cluster' for multi-core
      instances:    1,

      // ── Auto-restart ─────────────────────────────────────────────────────
      autorestart:  true,
      watch:        false,          // disable file-watch for production stability
      ...RESTART_POLICY,

      // ── Logging ──────────────────────────────────────────────────────────
      out_file:     `${LOG_DIR}/btng-bank-out.log`,
      error_file:   `${LOG_DIR}/btng-bank-err.log`,
      merge_logs:   false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      log_type:     'raw',

      // ── Environment: Production ──────────────────────────────────────────
      env: {
        NODE_ENV:    'production',
        PORT:        8090,
        HOST:        '0.0.0.0',
        BTNG_SECRET: process.env.BTNG_SECRET || '',   // set via env or .env file
      },

      // ── Environment: Development (activate with --env development) ───────
      env_development: {
        NODE_ENV:    'development',
        PORT:        8090,
        HOST:        '0.0.0.0',
        BTNG_SECRET: 'dev_btng_secret_2024',
      },

      // ── Meta ─────────────────────────────────────────────────────────────
      description: 'BTNG Gold Coin — Bank Wallet Server (REST API)',
      node_args:   '--max-old-space-size=512',
    },

    // ── 2. BTNG Zone Engine Server (port 8125) ──────────────────────────────
    {
      name:         'btng-zone',
      script:       `${SDK_DIR}/zoneServer.ts`,
      interpreter:  'node',
      interpreter_args: '--loader ts-node/esm --experimental-specifier-resolution=node',

      // ── Fallback: if compiled JS exists, prefer it ───────────────────────
      // Uncomment the line below and comment out the ts-node interpreter_args
      // if you pre-compile with `npx tsc --outDir dist`:
      // script: `${SDK_DIR}/dist/zoneServer.js`,
      // interpreter: 'node',
      // interpreter_args: '',

      exec_mode:    'fork',
      instances:    1,

      autorestart:  true,
      watch:        false,
      ...RESTART_POLICY,

      out_file:     `${LOG_DIR}/btng-zone-out.log`,
      error_file:   `${LOG_DIR}/btng-zone-err.log`,
      merge_logs:   false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      env: {
        NODE_ENV:    'production',
        PORT:        8125,
        HOST:        '0.0.0.0',
        BTNG_SECRET: process.env.BTNG_SECRET || '',
      },

      env_development: {
        NODE_ENV:    'development',
        PORT:        8125,
        HOST:        '0.0.0.0',
        BTNG_SECRET: 'dev_btng_secret_2024',
      },

      description: 'BTNG Gold Coin — Zone Engine (Zone policy & rule evaluator)',
      node_args:   '--max-old-space-size=256',
    },

    // ── 3. BTNG Sovereign Node Server (port 64799) ─────────────────────────
    {
      name:         'btng-node',
      script:       `${SDK_DIR}/btng-node-server.js`,
      interpreter:  'node',

      exec_mode:    'fork',
      instances:    1,

      autorestart:  true,
      watch:        false,
      ...RESTART_POLICY,

      out_file:     `${LOG_DIR}/btng-node-out.log`,
      error_file:   `${LOG_DIR}/btng-node-err.log`,
      merge_logs:   false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      env: {
        NODE_ENV:         'production',
        PORT:             64799,
        HOST:             '0.0.0.0',
        BTNG_SECRET:      process.env.BTNG_SECRET || '',
        BTNG_CHAIN_ID:    'BTNG-MAINNET',
        BTNG_NETWORK:     'BTNG Sovereign Blockchain',
        BTNG_NATIVE_COIN: 'BTNGG',
        BTNG_RESERVE:     '59500000000000',
      },

      env_development: {
        NODE_ENV:         'development',
        PORT:             64799,
        HOST:             '0.0.0.0',
        BTNG_SECRET:      'dev_btng_secret_2024',
        BTNG_CHAIN_ID:    'BTNG-TESTNET',
        BTNG_NETWORK:     'BTNG Test Network',
        BTNG_NATIVE_COIN: 'tBTNGG',
        BTNG_RESERVE:     '59500000000000',
      },

      description: 'BTNG Sovereign Node (blockchain stats & node API)',
      node_args:   '--max-old-space-size=512',
    },

    // ── 4. BTNG MTN MoMo All-in-One Engine (port 3000 + port 8090) ───────────
    // Runs the MTN MoMo sandbox host on 3000 AND the BTNG banking engine on 8090.
    // NOTE: Do NOT run both btng-bank and btng-momo simultaneously on port 8090.
    //       Comment out btng-bank above if using btng-momo for the full stack.
    {
      name:         'btng-momo',
      script:       `${SDK_DIR}/btng-momo-engine.js`,
      interpreter:  'node',
      exec_mode:    'fork',
      instances:    1,
      autorestart:  true,
      watch:        false,
      ...RESTART_POLICY,
      out_file:     `${LOG_DIR}/btng-momo-out.log`,
      error_file:   `${LOG_DIR}/btng-momo-err.log`,
      merge_logs:   false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV:                 'production',
        MOMO_PORT:                3000,
        BANK_PORT:                8090,
        BTNG_SECRET:              process.env.BTNG_SECRET || '',
        MTN_MOMO_TARGET_ENV:      'sandbox',
        MTN_MOMO_COLLECTION_KEY:  process.env.MTN_MOMO_COLLECTION_KEY  || 'sandbox-collection-key',
        MTN_MOMO_DISBURSEMENT_KEY:process.env.MTN_MOMO_DISBURSEMENT_KEY || 'sandbox-disbursement-key',
        MTN_MOMO_REMITTANCE_KEY:  process.env.MTN_MOMO_REMITTANCE_KEY  || 'sandbox-remittance-key',
      },
      env_development: {
        NODE_ENV:                 'development',
        MOMO_PORT:                3000,
        BANK_PORT:                8090,
        BTNG_SECRET:              'dev_btng_secret_2024',
        MTN_MOMO_TARGET_ENV:      'sandbox',
        MTN_MOMO_COLLECTION_KEY:  'sandbox-collection-key',
        MTN_MOMO_DISBURSEMENT_KEY:'sandbox-disbursement-key',
        MTN_MOMO_REMITTANCE_KEY:  'sandbox-remittance-key',
      },
      description: 'BTNG MTN MoMo Engine — MoMo Sandbox (3000) + Banking (8090)',
      node_args:   '--max-old-space-size=512',
    },

    // ── 5. BTNG Gold Factory — Stratum V2 Mining Gateway (port 38984) ──────────
    {
      name:         'btng-gold-factory',
      script:       `${SDK_DIR}/stratum-gateway.js`,
      interpreter:  'node',

      exec_mode:    'fork',
      instances:    1,

      autorestart:  true,
      watch:        false,
      ...RESTART_POLICY,

      out_file:     `${LOG_DIR}/gold-factory-out.log`,
      error_file:   `${LOG_DIR}/gold-factory-err.log`,
      merge_logs:   false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      env: {
        NODE_ENV:     'production',
        PORT:         38984,
        HOST:         '0.0.0.0',
        DATABASE_URL: process.env.DATABASE_URL || '',    // postgres://user:pass@host:5432/btng
        // RPC credentials are hardcoded in stratum-gateway.js — override here if needed:
        // BTNG_RPC_URL:      'http://72.62.160.237:7051',
        // BTNG_RPC_USER:     'btngrpc',
        // BTNG_RPC_PASSWORD: process.env.BTNG_RPC_PASSWORD || '',
      },

      env_development: {
        NODE_ENV:     'development',
        PORT:         38984,
        HOST:         '0.0.0.0',
        DATABASE_URL: process.env.DATABASE_URL || 'postgres://localhost:5432/btng_dev',
      },

      description: 'BTNG Gold Factory — Stratum V2 TCP gateway + PoW share recorder (port 38984)',
      node_args:   '--max-old-space-size=512',
    },

    // ── 6. (Optional) BTNG Brain Gate — AI engine (port 8087) ──────────────
    // Uncomment when sdk/brain_server.py or equivalent JS entry exists.
    // {
    //   name:         'btng-brain',
    //   script:       `${SDK_DIR}/btng-ai-brain/brain_server.py`,
    //   interpreter:  'python3',
    //   exec_mode:    'fork',
    //   instances:    1,
    //   autorestart:  true,
    //   watch:        false,
    //   ...RESTART_POLICY,
    //   out_file:     `${LOG_DIR}/btng-brain-out.log`,
    //   error_file:   `${LOG_DIR}/btng-brain-err.log`,
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    //   env: {
    //     PYTHONUNBUFFERED: '1',
    //     PORT:  8087,
    //     HOST:  '0.0.0.0',
    //   },
    //   description: 'BTNG Brain Gate — Python AI engine',
    // },

    // ── 7. (Optional) BTNG Private Banker (port 8000) ──────────────────────
    // Uncomment when the Private Banker server file is in place.
    // {
    //   name:         'btng-banker',
    //   script:       `${SDK_DIR}/btngEngine.js`,
    //   interpreter:  'node',
    //   exec_mode:    'fork',
    //   instances:    1,
    //   autorestart:  true,
    //   watch:        false,
    //   ...RESTART_POLICY,
    //   out_file:     `${LOG_DIR}/btng-banker-out.log`,
    //   error_file:   `${LOG_DIR}/btng-banker-err.log`,
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    //   env: { NODE_ENV: 'production', PORT: 8000, HOST: '0.0.0.0' },
    //   description: 'BTNG Private Banker AI server',
    // },

  ],

  // ── Deploy Configuration (optional) ────────────────────────────────────────
  // Use with: pm2 deploy ecosystem.config.js production setup
  //           pm2 deploy ecosystem.config.js production
  //
  deploy: {
    production: {
      user:         'ubuntu',
      host:         '168.231.79.52',
      ref:          'origin/main',
      repo:         'git@github.com:yourorg/btng-sovereign.git',
      path:         '/var/www/btng-sovereign',
      'pre-deploy-local': '',
      'post-deploy':
        'cd sdk && npm install && ' +
        'mkdir -p logs/pm2 && ' +
        'pm2 startOrRestart ecosystem.config.js --env production && ' +
        'pm2 save',
      'pre-setup':  'apt-get install -y git',
      env: {
        NODE_ENV: 'production',
      },
    },
    development: {
      user:         'ubuntu',
      host:         'localhost',
      ref:          'origin/develop',
      repo:         'git@github.com:yourorg/btng-sovereign.git',
      path:         '/var/www/btng-dev',
      'post-deploy':
        'cd sdk && npm install && ' +
        'mkdir -p logs/pm2 && ' +
        'pm2 startOrRestart ecosystem.config.js --env development && ' +
        'pm2 save',
      env: {
        NODE_ENV: 'development',
      },
    },
  },
};
