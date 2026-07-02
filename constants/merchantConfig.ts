/**
 * BTNG Sovereign Cash-Rail — Merchant Identity
 * Anchor merchant for all BTNG payment rails, settlement, and disbursement.
 */

// ── International Equity Partners ─────────────────────────────────────────────
export const INTL_EQUITY_TRUST = {
  legalName: 'International Equity Trust Co',
  shortName: 'Intl Equity Trust',
  merchantCenterId: '5669519153',
  shoppingService: 'Google Shopping',
  shoppingUrl: 'google.com/shopping',
  country: 'International',
  region: 'Global · 54 Africa Nations',
} as const;

export const INTL_EQUITY_CUSTODIAN = {
  legalName: 'International Equity Custodian Goldnet Inc',
  shortName: 'Equity Custodian Goldnet',
  country: 'International',
  assetType: 'Gold-backed Digital Equity',
  network: 'BTNG Sovereign Chain',
} as const;

export const BTNG_MERCHANT = {
  legalName: 'EKUYE DIGITAL GATEWAY TRUST LTD',
  tradingName: 'BTNG SOVEREIGN NETWORK',
  shortName: 'Ekuye Digital Gateway',
  merchantId: '248059',
  msisdn: '+233 54 041 8537',
  msisdnLocal: '0540418537',
  network: 'MTN MoMo',
  country: 'Ghana',
  currency: 'GHS',
  region: 'West Africa · 54 Nations',
  dialCode: '*170#',
  payInstruction: 'Dial *170# to MoMoPay',
} as const;

export const BTNG_RAIL_CHANNELS = [
  {
    id: 'btng_pay',
    label: 'BTNG PAY',
    sublabel: 'Merchant gateway',
    icon: 'payment' as const,
    color: '#D4A017',
    active: true,
  },
  {
    id: 'cash_rail',
    label: 'Cash-In / Cash-Out',
    sublabel: 'Telecom settlement',
    icon: 'swap-horiz' as const,
    color: '#F59E0B',
    active: true,
  },
  {
    id: 'gov_disbursement',
    label: 'Gov Disbursement',
    sublabel: 'Government channels',
    icon: 'account-balance' as const,
    color: '#10B981',
    active: true,
  },
  {
    id: 'institutional',
    label: 'Institutional',
    sublabel: 'Onboarding pipeline',
    icon: 'business' as const,
    color: '#6366F1',
    active: true,
  },
  {
    id: 'creator_credit',
    label: 'Creator Credit',
    sublabel: 'Credit line engine',
    icon: 'credit-card' as const,
    color: '#EC4899',
    active: true,
  },
  {
    id: 'national_treasury',
    label: 'National Treasury',
    sublabel: 'Treasury flows',
    icon: 'domain' as const,
    color: '#14B8A6',
    active: true,
  },
] as const;
