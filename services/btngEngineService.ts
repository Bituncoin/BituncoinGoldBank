/**
 * services/btngEngineService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React Native–compatible port of sdk/btngEngine.js
 *
 * The Node.js `crypto` module is NOT available in RN / Expo.
 * All randomness uses Math.random (sufficient for display / demo addresses).
 * For production key material, integrate a Secure Enclave / hardware wallet.
 *
 * Public API mirrors btngEngine.js exactly so callers are interchangeable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Address-type codes ────────────────────────────────────────────────────────
export type AddressType = 'w' | 'm' | 'e' | 'g' | 't' | 'v' | 'c';

export const ADDRESS_TYPE_LABELS: Record<AddressType, string> = {
  w: 'Individual Wallet',
  m: 'Business / Merchant',
  e: 'Enterprise',
  g: 'Government / Ministry',
  t: 'Treasury / Central Bank',
  v: 'Validator / Node',
  c: 'Coin / Asset',
};

export const ADDRESS_TYPE_ICONS: Record<AddressType, string> = {
  w: 'account-balance-wallet',
  m: 'store',
  e: 'business',
  g: 'account-balance',
  t: 'savings',
  v: 'dns',
  c: 'toll',
};

// ── 54-Country BTNG prefix map ────────────────────────────────────────────────
export const BTNG_PREFIXES: Record<string, string> = {
  GHANA:              'BTNG1G',
  NIGERIA:            'BTNG2N',
  SOUTH_AFRICA:       'BTNG3S',
  KENYA:              'BTNG4K',
  EGYPT:              'BTNG5E',
  ETHIOPIA:           'BTNG6E',
  MOROCCO:            'BTNG7M',
  UGANDA:             'BTNG8U',
  TANZANIA:           'BTNG9T',
  ALGERIA:            'BTNG10A',
  SUDAN:              'BTNG11S',
  ANGOLA:             'BTNG12A',
  MOZAMBIQUE:         'BTNG13M',
  MADAGASCAR:         'BTNG14M',
  CAMEROON:           'BTNG15C',
  COTE_DIVOIRE:       'BTNG16C',
  NIGER:              'BTNG17N',
  BURKINA_FASO:       'BTNG18B',
  MALI:               'BTNG19M',
  MALAWI:             'BTNG20M',
  ZAMBIA:             'BTNG21Z',
  SENEGAL:            'BTNG22S',
  CHAD:               'BTNG23C',
  SOMALIA:            'BTNG24S',
  ZIMBABWE:           'BTNG25Z',
  GUINEA:             'BTNG26G',
  RWANDA:             'BTNG27R',
  BENIN:              'BTNG28B',
  BURUNDI:            'BTNG29B',
  TUNISIA:            'BTNG30T',
  SOUTH_SUDAN:        'BTNG31S',
  TOGO:               'BTNG32T',
  SIERRA_LEONE:       'BTNG33S',
  LIBYA:              'BTNG34L',
  DRC:                'BTNG35D',
  CONGO:              'BTNG36C',
  LIBERIA:            'BTNG37L',
  CAR:                'BTNG38C',
  MAURITANIA:         'BTNG39M',
  ERITREA:            'BTNG40E',
  NAMIBIA:            'BTNG41N',
  BOTSWANA:           'BTNG42B',
  LESOTHO:            'BTNG43L',
  ESWATINI:           'BTNG44E',
  GABON:              'BTNG45G',
  GAMBIA:             'BTNG46G',
  GUINEA_BISSAU:      'BTNG47G',
  EQUATORIAL_GUINEA:  'BTNG48E',
  CAPE_VERDE:         'BTNG49C',
  SAO_TOME:           'BTNG50S',
  SEYCHELLES:         'BTNG51S',
  MAURITIUS:          'BTNG52M',
  COMOROS:            'BTNG53C',
  DJIBOUTI:           'BTNG54D',
};

/** Country meta enriched with flag + display info */
export interface CountryMeta {
  key: string;       // e.g. 'GHANA'
  prefix: string;    // e.g. 'BTNG1G'
  name: string;
  flag: string;
  code: string;      // ISO-2
  currency: string;
}

export const COUNTRY_META: CountryMeta[] = [
  { key: 'GHANA',             prefix: 'BTNG1G',  name: 'Ghana',             flag: '🇬🇭', code: 'GH', currency: 'GHS' },
  { key: 'NIGERIA',           prefix: 'BTNG2N',  name: 'Nigeria',           flag: '🇳🇬', code: 'NG', currency: 'NGN' },
  { key: 'SOUTH_AFRICA',      prefix: 'BTNG3S',  name: 'South Africa',      flag: '🇿🇦', code: 'ZA', currency: 'ZAR' },
  { key: 'KENYA',             prefix: 'BTNG4K',  name: 'Kenya',             flag: '🇰🇪', code: 'KE', currency: 'KES' },
  { key: 'EGYPT',             prefix: 'BTNG5E',  name: 'Egypt',             flag: '🇪🇬', code: 'EG', currency: 'EGP' },
  { key: 'ETHIOPIA',          prefix: 'BTNG6E',  name: 'Ethiopia',          flag: '🇪🇹', code: 'ET', currency: 'ETB' },
  { key: 'MOROCCO',           prefix: 'BTNG7M',  name: 'Morocco',           flag: '🇲🇦', code: 'MA', currency: 'MAD' },
  { key: 'UGANDA',            prefix: 'BTNG8U',  name: 'Uganda',            flag: '🇺🇬', code: 'UG', currency: 'UGX' },
  { key: 'TANZANIA',          prefix: 'BTNG9T',  name: 'Tanzania',          flag: '🇹🇿', code: 'TZ', currency: 'TZS' },
  { key: 'ALGERIA',           prefix: 'BTNG10A', name: 'Algeria',           flag: '🇩🇿', code: 'DZ', currency: 'DZD' },
  { key: 'SUDAN',             prefix: 'BTNG11S', name: 'Sudan',             flag: '🇸🇩', code: 'SD', currency: 'SDG' },
  { key: 'ANGOLA',            prefix: 'BTNG12A', name: 'Angola',            flag: '🇦🇴', code: 'AO', currency: 'AOA' },
  { key: 'MOZAMBIQUE',        prefix: 'BTNG13M', name: 'Mozambique',        flag: '🇲🇿', code: 'MZ', currency: 'MZN' },
  { key: 'MADAGASCAR',        prefix: 'BTNG14M', name: 'Madagascar',        flag: '🇲🇬', code: 'MG', currency: 'MGA' },
  { key: 'CAMEROON',          prefix: 'BTNG15C', name: 'Cameroon',          flag: '🇨🇲', code: 'CM', currency: 'XAF' },
  { key: 'COTE_DIVOIRE',      prefix: 'BTNG16C', name: "Côte d'Ivoire",    flag: '🇨🇮', code: 'CI', currency: 'XOF' },
  { key: 'NIGER',             prefix: 'BTNG17N', name: 'Niger',             flag: '🇳🇪', code: 'NE', currency: 'XOF' },
  { key: 'BURKINA_FASO',      prefix: 'BTNG18B', name: 'Burkina Faso',      flag: '🇧🇫', code: 'BF', currency: 'XOF' },
  { key: 'MALI',              prefix: 'BTNG19M', name: 'Mali',              flag: '🇲🇱', code: 'ML', currency: 'XOF' },
  { key: 'MALAWI',            prefix: 'BTNG20M', name: 'Malawi',            flag: '🇲🇼', code: 'MW', currency: 'MWK' },
  { key: 'ZAMBIA',            prefix: 'BTNG21Z', name: 'Zambia',            flag: '🇿🇲', code: 'ZM', currency: 'ZMW' },
  { key: 'SENEGAL',           prefix: 'BTNG22S', name: 'Senegal',           flag: '🇸🇳', code: 'SN', currency: 'XOF' },
  { key: 'CHAD',              prefix: 'BTNG23C', name: 'Chad',              flag: '🇹🇩', code: 'TD', currency: 'XAF' },
  { key: 'SOMALIA',           prefix: 'BTNG24S', name: 'Somalia',           flag: '🇸🇴', code: 'SO', currency: 'SOS' },
  { key: 'ZIMBABWE',          prefix: 'BTNG25Z', name: 'Zimbabwe',          flag: '🇿🇼', code: 'ZW', currency: 'ZWL' },
  { key: 'GUINEA',            prefix: 'BTNG26G', name: 'Guinea',            flag: '🇬🇳', code: 'GN', currency: 'GNF' },
  { key: 'RWANDA',            prefix: 'BTNG27R', name: 'Rwanda',            flag: '🇷🇼', code: 'RW', currency: 'RWF' },
  { key: 'BENIN',             prefix: 'BTNG28B', name: 'Benin',             flag: '🇧🇯', code: 'BJ', currency: 'XOF' },
  { key: 'BURUNDI',           prefix: 'BTNG29B', name: 'Burundi',           flag: '🇧🇮', code: 'BI', currency: 'BIF' },
  { key: 'TUNISIA',           prefix: 'BTNG30T', name: 'Tunisia',           flag: '🇹🇳', code: 'TN', currency: 'TND' },
  { key: 'SOUTH_SUDAN',       prefix: 'BTNG31S', name: 'South Sudan',       flag: '🇸🇸', code: 'SS', currency: 'SSP' },
  { key: 'TOGO',              prefix: 'BTNG32T', name: 'Togo',              flag: '🇹🇬', code: 'TG', currency: 'XOF' },
  { key: 'SIERRA_LEONE',      prefix: 'BTNG33S', name: 'Sierra Leone',      flag: '🇸🇱', code: 'SL', currency: 'SLL' },
  { key: 'LIBYA',             prefix: 'BTNG34L', name: 'Libya',             flag: '🇱🇾', code: 'LY', currency: 'LYD' },
  { key: 'DRC',               prefix: 'BTNG35D', name: 'DR Congo',          flag: '🇨🇩', code: 'CD', currency: 'CDF' },
  { key: 'CONGO',             prefix: 'BTNG36C', name: 'Congo',             flag: '🇨🇬', code: 'CG', currency: 'XAF' },
  { key: 'LIBERIA',           prefix: 'BTNG37L', name: 'Liberia',           flag: '🇱🇷', code: 'LR', currency: 'LRD' },
  { key: 'CAR',               prefix: 'BTNG38C', name: 'C.A. Republic',     flag: '🇨🇫', code: 'CF', currency: 'XAF' },
  { key: 'MAURITANIA',        prefix: 'BTNG39M', name: 'Mauritania',        flag: '🇲🇷', code: 'MR', currency: 'MRU' },
  { key: 'ERITREA',           prefix: 'BTNG40E', name: 'Eritrea',           flag: '🇪🇷', code: 'ER', currency: 'ERN' },
  { key: 'NAMIBIA',           prefix: 'BTNG41N', name: 'Namibia',           flag: '🇳🇦', code: 'NA', currency: 'NAD' },
  { key: 'BOTSWANA',          prefix: 'BTNG42B', name: 'Botswana',          flag: '🇧🇼', code: 'BW', currency: 'BWP' },
  { key: 'LESOTHO',           prefix: 'BTNG43L', name: 'Lesotho',           flag: '🇱🇸', code: 'LS', currency: 'LSL' },
  { key: 'ESWATINI',          prefix: 'BTNG44E', name: 'Eswatini',          flag: '🇸🇿', code: 'SZ', currency: 'SZL' },
  { key: 'GABON',             prefix: 'BTNG45G', name: 'Gabon',             flag: '🇬🇦', code: 'GA', currency: 'XAF' },
  { key: 'GAMBIA',            prefix: 'BTNG46G', name: 'Gambia',            flag: '🇬🇲', code: 'GM', currency: 'GMD' },
  { key: 'GUINEA_BISSAU',     prefix: 'BTNG47G', name: 'Guinea-Bissau',     flag: '🇬🇼', code: 'GW', currency: 'XOF' },
  { key: 'EQUATORIAL_GUINEA', prefix: 'BTNG48E', name: 'Equatorial Guinea', flag: '🇬🇶', code: 'GQ', currency: 'XAF' },
  { key: 'CAPE_VERDE',        prefix: 'BTNG49C', name: 'Cape Verde',        flag: '🇨🇻', code: 'CV', currency: 'CVE' },
  { key: 'SAO_TOME',          prefix: 'BTNG50S', name: 'São Tomé',          flag: '🇸🇹', code: 'ST', currency: 'STN' },
  { key: 'SEYCHELLES',        prefix: 'BTNG51S', name: 'Seychelles',        flag: '🇸🇨', code: 'SC', currency: 'SCR' },
  { key: 'MAURITIUS',         prefix: 'BTNG52M', name: 'Mauritius',         flag: '🇲🇺', code: 'MU', currency: 'MUR' },
  { key: 'COMOROS',           prefix: 'BTNG53C', name: 'Comoros',           flag: '🇰🇲', code: 'KM', currency: 'KMF' },
  { key: 'DJIBOUTI',          prefix: 'BTNG54D', name: 'Djibouti',          flag: '🇩🇯', code: 'DJ', currency: 'DJF' },
];

// ── Address lookup / routing result ──────────────────────────────────────────
export interface AddressInfo {
  prefix: string;
  type: AddressType;
  typeLabel: string;
  hash: string;
  valid: boolean;
  country: CountryMeta | undefined;
}

export interface GeneratedAddress {
  address: string;
  prefix: string;
  type: AddressType;
  typeLabel: string;
  country: CountryMeta;
  issuedAt: string;
}

// ── Pure RN-safe random helpers ───────────────────────────────────────────────
function randomHex(len: number): string {
  const chars = '0123456789abcdef';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * 16)]).join('');
}

// ── Core engine factory (mirrors btngEngine.js createEngine) ─────────────────
function createEngine(prefix: string) {
  const generateAddress = (type: AddressType) =>
    `${prefix}${type}${randomHex(35)}`;

  const verifyAddress = (addr: string) =>
    addr.startsWith(prefix) && addr.length > 10;

  const lookup = (addr: string) => ({
    prefix: addr.slice(0, prefix.length),
    type:   addr[prefix.length] as AddressType,
    hash:   addr.slice(prefix.length + 1),
  });

  const eyebrow = (addr: string) => ({
    countryPrefix: prefix,
    type:          addr[prefix.length] as AddressType,
    valid:         verifyAddress(addr),
  });

  return {
    generateWalletAddress:     (): string => generateAddress('w'),
    generateBusinessAddress:   (): string => generateAddress('m'),
    generateEnterpriseAddress: (): string => generateAddress('e'),
    generateGovernmentAddress: (): string => generateAddress('g'),
    generateTreasuryAddress:   (): string => generateAddress('t'),
    generateValidatorAddress:  (): string => generateAddress('v'),
    generateCoinAddress:       (): string => generateAddress('c'),
    verifyAddress,
    lookup,
    eyebrow,
  };
}

// ── Build all 54 engines keyed by country name ────────────────────────────────
type EngineMap = Record<string, ReturnType<typeof createEngine>>;

export const btngEngines: EngineMap = Object.fromEntries(
  COUNTRY_META.map(c => [c.key, createEngine(c.prefix)])
);

// ── High-level: generate an address for a country + type ─────────────────────
export function generateBtngAddress(
  countryKey: string,
  type: AddressType = 'w'
): GeneratedAddress | null {
  const engine = btngEngines[countryKey];
  const country = COUNTRY_META.find(c => c.key === countryKey);
  if (!engine || !country) return null;

  const generators: Record<AddressType, () => string> = {
    w: engine.generateWalletAddress,
    m: engine.generateBusinessAddress,
    e: engine.generateEnterpriseAddress,
    g: engine.generateGovernmentAddress,
    t: engine.generateTreasuryAddress,
    v: engine.generateValidatorAddress,
    c: engine.generateCoinAddress,
  };

  return {
    address:   generators[type](),
    prefix:    country.prefix,
    type,
    typeLabel: ADDRESS_TYPE_LABELS[type],
    country,
    issuedAt:  new Date().toISOString(),
  };
}

// ── Lookup any BTNG address → country + type info ────────────────────────────
export function lookupBtngAddress(address: string): AddressInfo {
  // Find matching country prefix (longest-first for safety)
  const sortedMeta = [...COUNTRY_META].sort(
    (a, b) => b.prefix.length - a.prefix.length
  );
  const match = sortedMeta.find(c => address.startsWith(c.prefix));

  if (!match) {
    return {
      prefix: '',
      type: 'w',
      typeLabel: 'Unknown',
      hash: address,
      valid: false,
      country: undefined,
    };
  }

  const type  = (address[match.prefix.length] ?? 'w') as AddressType;
  const hash  = address.slice(match.prefix.length + 1);
  const valid = address.length > match.prefix.length + 1;

  return {
    prefix:    match.prefix,
    type,
    typeLabel: ADDRESS_TYPE_LABELS[type] ?? 'Unknown',
    hash,
    valid,
    country:   match,
  };
}

// ── Route any BTNG address to its country engine ─────────────────────────────
export function routeByAddress(address: string): ReturnType<typeof createEngine> | null {
  const info = lookupBtngAddress(address);
  if (!info.country) return null;
  return btngEngines[info.country.key] ?? null;
}

// ── Convenience: verify any BTNG address ─────────────────────────────────────
export function verifyBtngAddress(address: string): boolean {
  return lookupBtngAddress(address).valid;
}

// ── Get country meta by ISO-2 code ───────────────────────────────────────────
export function getCountryByCode(isoCode: string): CountryMeta | undefined {
  return COUNTRY_META.find(c => c.code.toUpperCase() === isoCode.toUpperCase());
}

// ── Get country meta by engine key ───────────────────────────────────────────
export function getCountryByKey(key: string): CountryMeta | undefined {
  return COUNTRY_META.find(c => c.key === key);
}
