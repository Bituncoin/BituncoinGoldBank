# BTNG 54-NATION ADDRESS ENGINE
# Deep-Dive Technical Documentation
# ═══════════════════════════════════════════════════════════════════
# EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
# John Kojo Zi — Founder & Lead Architect

## SOURCE FILE
`services/btngEngineService.ts`

---

## ADDRESS FORMAT

```
[PREFIX][TYPE][HASH]

Examples:
  BTNG1Gw1a2b3c4d5e6f...    ← Ghana Wallet
  BTNG1Gm9f8e7d6c5b4a...    ← Ghana Merchant
  BTNG2Nw3c4d5e6f7a8b...    ← Nigeria Wallet
  BTNG54Dv2b3c4d5e6f7...    ← Djibouti Validator

Where:
  PREFIX = Country-specific BTNG prefix (BTNG1G through BTNG54D)
  TYPE   = Single character: w m e g t v c
  HASH   = 35 random hex characters (address uniqueness)
```

---

## ADDRESS TYPES

| Code | Name | Use Case |
|---|---|---|
| `w` | Individual Wallet | Personal account — everyday transactions |
| `m` | Business / Merchant | Point-of-sale, merchant payments |
| `e` | Enterprise | Corporate accounts, multi-sig |
| `g` | Government / Ministry | Government treasury, public funds |
| `t` | Treasury / Central Bank | National reserve, central bank |
| `v` | Validator / Node | Network validators, staking |
| `c` | Coin / Asset | Token contracts, digital assets |

---

## COUNTRY ENGINES API

```typescript
// Get Ghana engine
const ghanaEngine = btngEngines['GHANA'];

// Generate addresses
const wallet    = ghanaEngine.generateWalletAddress();     // BTNG1Gw...
const merchant  = ghanaEngine.generateBusinessAddress();   // BTNG1Gm...
const enterprise= ghanaEngine.generateEnterpriseAddress(); // BTNG1Ge...
const govt      = ghanaEngine.generateGovernmentAddress(); // BTNG1Gg...
const treasury  = ghanaEngine.generateTreasuryAddress();   // BTNG1Gt...
const validator = ghanaEngine.generateValidatorAddress();  // BTNG1Gv...
const coin      = ghanaEngine.generateCoinAddress();       // BTNG1Gc...

// Verify an address belongs to Ghana
const valid = ghanaEngine.verifyAddress('BTNG1Gw...');  // true

// Look up address details
const info = ghanaEngine.lookup('BTNG1Gw1a2b3c...');
// { prefix: 'BTNG1G', type: 'w', hash: '1a2b3c...' }
```

---

## HIGH-LEVEL FUNCTIONS

```typescript
// Generate for any country
const addr = generateBtngAddress('NIGERIA', 'm');
// { address: 'BTNG2Nm...', prefix: 'BTNG2N', type: 'm',
//   typeLabel: 'Business / Merchant', country: {...}, issuedAt: '...' }

// Look up any BTNG address — identifies country + type
const info = lookupBtngAddress('BTNG27Rv...');
// { prefix: 'BTNG27R', type: 'v', typeLabel: 'Validator / Node',
//   hash: '...', valid: true, country: { name: 'Rwanda', flag: '🇷🇼', ... } }

// Route to correct engine by address
const engine = routeByAddress('BTNG3Sw...');
// Returns the South Africa engine

// Verify any address
const valid = verifyBtngAddress('BTNG1Gw...');  // true

// Find country by ISO code
const ghana = getCountryByCode('GH');
// { key: 'GHANA', prefix: 'BTNG1G', name: 'Ghana', flag: '🇬🇭', ... }

// Find country by engine key
const nigeria = getCountryByKey('NIGERIA');
// { key: 'NIGERIA', prefix: 'BTNG2N', name: 'Nigeria', ... }
```

---

## HD VAULT CARD INTEGRATION

HD Vault Cards (stored in `btng_cards` table) use address type codes
for filtering and display in the profile screen:

| DB type char | Address Type | Icon |
|---|---|---|
| `w` | Wallet | account-balance-wallet |
| `v` | Validator | hub |
| `m` | Merchant | store |
| `e` | Enterprise | business |
| `g` | Gov | account-balance |
| `t` | Treasury | savings |
| `c` | Coin | monetization-on |

The address type is detected from the `btng_id` field:
```typescript
// Pattern: BTNG{number}{UpperChar}{typeChar}{hash}
const match = btngId.match(/^BTNG\d+[A-Z]([wmegtvco])/i);
const typeKey = match?.[1]?.toLowerCase() ?? 'w';
```

---

*BTNG 54-Nation Address Engine · Technical Reference v1.0*
*EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624*
