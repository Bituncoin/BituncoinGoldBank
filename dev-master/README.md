# ════════════════════════════════════════════════════════════════════════
# BTNG SOVEREIGN BANK — DEVELOPER MASTER ADMIN FOLDER
# ════════════════════════════════════════════════════════════════════════
#
# Company       : EKUYE DIGITAL GATEWAY TRUST LTD
# Registration  : CS099020624
# TIN           : C0064220206
# Founder       : John Kojo Zi — Lead Architect & Bank Manager
# Chain         : BTNG Sovereign Mainnet
# Network Node  : 168.231.79.52:64799 (srv1282934.hstgr.cloud)
# Email         : info@bituncoin.io
# Platform      : Ghana · 54 Africa Nations · Global Diaspora
# ════════════════════════════════════════════════════════════════════════

## PURPOSE

This `dev-master/` folder is the **single source of truth** for all bank
engine code, cryptographic implementations, payment flows, and wallet
architecture. It is maintained exclusively by:

- **John Kojo Zi** — Founder & Lead Architect
- **BTNG Bank Development Team** — Core engineers
- **Client Maintenance** — Authorized bank account maintainers

> ⚠️  NO CODE IN THIS FOLDER IS DEMO, FAKE, OR RANDOM.
>    EVERY ENGINE IS PRODUCTION-GRADE WITH REAL CRYPTOGRAPHY.

---

## FOLDER STRUCTURE

```
dev-master/
├── README.md                        ← This file — master reference
├── MANIFEST.md                      ← Complete file registry
├── CHANGELOG.md                     ← Version history
├── SECURITY.md                      ← Cryptographic security spec
├── MAINTENANCE.md                   ← Bank developer maintenance guide
│
├── engines/
│   ├── index.ts                     ← Unified engine exports (re-exports)
│   ├── sovereign-engine.README.md   ← Sovereign Engine deep-dive docs
│   └── address-engine.README.md     ← 54-Nation Address Engine docs
│
├── payments/
│   └── triple-key-payment.README.md ← Triple-Key Payment flow docs
│
└── wallets/
    └── wallet-architecture.README.md ← Wallet security architecture
```

---

## LIVE ENGINE FILES (Source of Truth)

All engine source files live in `services/` at the project root:

| Engine | File | Status |
|--------|------|--------|
| Sovereign Engine v3.0 | `services/btngSovereignEngineService.ts` | LIVE |
| Address Engine (54 Nations) | `services/btngEngineService.ts` | LIVE |
| BTNG Bank Engine | `services/btngBankEngine.ts` | LIVE |
| BTNG Wallet Service | `services/btngWalletService.ts` | LIVE |
| BTNG3 Wallet Service | `services/btng3WalletService.ts` | LIVE |
| Cash Rail Service | `services/cashRailService.ts` | LIVE |
| Minting Pipeline | `services/mintingPipelineService.ts` | LIVE |
| Verification Pipeline | `services/verificationPipelineService.ts` | LIVE |
| KYC Service | `services/kycService.ts` | LIVE |
| Portfolio Service | `services/portfolioService.ts` | LIVE |
| Trading Service | `services/tradingService.ts` | LIVE |
| P2P Service | `services/p2pService.ts` | LIVE |

---

## QUICK REFERENCE — IMPORTANT IDs

```
Merchant ID (MTN MoMo)  : 248059
MSISDN                   : +233 54 041 8537
BTNG Chain               : BTNG-MAINNET
Genesis Date             : 18 February 2026
Node IP                  : 168.231.79.52:64799
Backend URL              : mebznlvyycuuddfkmebz.backend.onspace.ai
Reg. Number              : CS099020624
TIN                      : C0064220206
Gold Price Anchor        : $3,250 / troy oz (XAU)
BTNGG / USD              : $3.250
```

---

## AUTHORIZED MAINTAINERS

1. **John Kojo Zi** — `info@bituncoin.io` — Founder, full access
2. **BTNG Dev Team** — Core engineers, engine-level access
3. **Bank Client Maintenance** — Authorized account maintainers

All changes require commit message prefix: `[BTNG-MASTER]`
