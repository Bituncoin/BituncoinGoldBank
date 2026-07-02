// All 54 African Union member-state currencies with ISO codes, names, flags, and mock FX rates to USD

export interface AfricanCurrency {
  code: string;
  name: string;
  country: string;
  flag: string;
  symbol: string;
  usdRate: number; // how many units of this currency = 1 USD
}

export const AFRICAN_CURRENCIES: AfricanCurrency[] = [
  { code: 'DZD', name: 'Algerian Dinar',          country: 'Algeria',               flag: '🇩🇿', symbol: 'DA',   usdRate: 134.5  },
  { code: 'AOA', name: 'Angolan Kwanza',           country: 'Angola',                flag: '🇦🇴', symbol: 'Kz',   usdRate: 840.0  },
  { code: 'XOF', name: 'West African CFA Franc',   country: 'Benin',                 flag: '🇧🇯', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'BWP', name: 'Botswana Pula',            country: 'Botswana',              flag: '🇧🇼', symbol: 'P',    usdRate: 13.5   },
  { code: 'XOF', name: 'West African CFA Franc',   country: 'Burkina Faso',          flag: '🇧🇫', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'BIF', name: 'Burundian Franc',          country: 'Burundi',               flag: '🇧🇮', symbol: 'Fr',   usdRate: 2840.0 },
  { code: 'CVE', name: 'Cape Verdean Escudo',      country: 'Cape Verde',            flag: '🇨🇻', symbol: '$',    usdRate: 104.0  },
  { code: 'XAF', name: 'Central African CFA Franc',country: 'Cameroon',              flag: '🇨🇲', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'XAF', name: 'Central African CFA Franc',country: 'Central African Rep.',  flag: '🇨🇫', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'XAF', name: 'Central African CFA Franc',country: 'Chad',                  flag: '🇹🇩', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'KMF', name: 'Comorian Franc',           country: 'Comoros',               flag: '🇰🇲', symbol: 'CF',   usdRate: 460.0  },
  { code: 'CDF', name: 'Congolese Franc',          country: 'DR Congo',              flag: '🇨🇩', symbol: 'FC',   usdRate: 2730.0 },
  { code: 'XAF', name: 'Central African CFA Franc',country: 'Republic of Congo',     flag: '🇨🇬', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'DJF', name: 'Djiboutian Franc',         country: 'Djibouti',              flag: '🇩🇯', symbol: 'Fdj',  usdRate: 177.8  },
  { code: 'EGP', name: 'Egyptian Pound',           country: 'Egypt',                 flag: '🇪🇬', symbol: '£',    usdRate: 30.9   },
  { code: 'XAF', name: 'Central African CFA Franc',country: 'Equatorial Guinea',     flag: '🇬🇶', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'ERN', name: 'Eritrean Nakfa',           country: 'Eritrea',               flag: '🇪🇷', symbol: 'Nfk',  usdRate: 15.0   },
  { code: 'SZL', name: 'Swazi Lilangeni',          country: 'Eswatini',              flag: '🇸🇿', symbol: 'L',    usdRate: 18.5   },
  { code: 'ETB', name: 'Ethiopian Birr',           country: 'Ethiopia',              flag: '🇪🇹', symbol: 'Br',   usdRate: 56.3   },
  { code: 'XAF', name: 'Central African CFA Franc',country: 'Gabon',                 flag: '🇬🇦', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'GMD', name: 'Gambian Dalasi',           country: 'Gambia',                flag: '🇬🇲', symbol: 'D',    usdRate: 67.4   },
  { code: 'GHS', name: 'Ghanaian Cedi',            country: 'Ghana',                 flag: '🇬🇭', symbol: '₵',    usdRate: 11.8   },
  { code: 'GNF', name: 'Guinean Franc',            country: 'Guinea',                flag: '🇬🇳', symbol: 'FG',   usdRate: 8600.0 },
  { code: 'XOF', name: 'West African CFA Franc',   country: 'Guinea-Bissau',         flag: '🇬🇼', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'KES', name: 'Kenyan Shilling',          country: 'Kenya',                 flag: '🇰🇪', symbol: 'KSh',  usdRate: 130.2  },
  { code: 'LSL', name: 'Lesotho Loti',             country: 'Lesotho',               flag: '🇱🇸', symbol: 'M',    usdRate: 18.5   },
  { code: 'LRD', name: 'Liberian Dollar',          country: 'Liberia',               flag: '🇱🇷', symbol: '$',    usdRate: 189.5  },
  { code: 'LYD', name: 'Libyan Dinar',             country: 'Libya',                 flag: '🇱🇾', symbol: 'LD',   usdRate: 4.8    },
  { code: 'MGA', name: 'Malagasy Ariary',          country: 'Madagascar',            flag: '🇲🇬', symbol: 'Ar',   usdRate: 4510.0 },
  { code: 'MWK', name: 'Malawian Kwacha',          country: 'Malawi',                flag: '🇲🇼', symbol: 'MK',   usdRate: 1680.0 },
  { code: 'XOF', name: 'West African CFA Franc',   country: 'Mali',                  flag: '🇲🇱', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'MRU', name: 'Mauritanian Ouguiya',      country: 'Mauritania',            flag: '🇲🇷', symbol: 'UM',   usdRate: 39.6   },
  { code: 'MUR', name: 'Mauritian Rupee',          country: 'Mauritius',             flag: '🇲🇺', symbol: '₨',    usdRate: 45.3   },
  { code: 'MAD', name: 'Moroccan Dirham',          country: 'Morocco',               flag: '🇲🇦', symbol: 'MAD',  usdRate: 10.2   },
  { code: 'MZN', name: 'Mozambican Metical',       country: 'Mozambique',            flag: '🇲🇿', symbol: 'MT',   usdRate: 63.7   },
  { code: 'NAD', name: 'Namibian Dollar',          country: 'Namibia',               flag: '🇳🇦', symbol: 'N$',   usdRate: 18.5   },
  { code: 'XOF', name: 'West African CFA Franc',   country: 'Niger',                 flag: '🇳🇪', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'NGN', name: 'Nigerian Naira',           country: 'Nigeria',               flag: '🇳🇬', symbol: '₦',    usdRate: 1550.0 },
  { code: 'RWF', name: 'Rwandan Franc',            country: 'Rwanda',                flag: '🇷🇼', symbol: 'RF',   usdRate: 1330.0 },
  { code: 'STN', name: 'São Tomé Dobra',           country: 'São Tomé & Príncipe',   flag: '🇸🇹', symbol: 'Db',   usdRate: 23.0   },
  { code: 'XOF', name: 'West African CFA Franc',   country: 'Senegal',               flag: '🇸🇳', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'SCR', name: 'Seychellois Rupee',        country: 'Seychelles',            flag: '🇸🇨', symbol: '₨',    usdRate: 14.2   },
  { code: 'SLL', name: 'Sierra Leonean Leone',     country: 'Sierra Leone',          flag: '🇸🇱', symbol: 'Le',   usdRate: 20900.0},
  { code: 'SOS', name: 'Somali Shilling',          country: 'Somalia',               flag: '🇸🇴', symbol: 'Sh',   usdRate: 570.0  },
  { code: 'ZAR', name: 'South African Rand',       country: 'South Africa',          flag: '🇿🇦', symbol: 'R',    usdRate: 18.5   },
  { code: 'SSP', name: 'South Sudanese Pound',     country: 'South Sudan',           flag: '🇸🇸', symbol: '£',    usdRate: 1305.0 },
  { code: 'SDG', name: 'Sudanese Pound',           country: 'Sudan',                 flag: '🇸🇩', symbol: 'LS',   usdRate: 601.0  },
  { code: 'TZS', name: 'Tanzanian Shilling',       country: 'Tanzania',              flag: '🇹🇿', symbol: 'TSh',  usdRate: 2560.0 },
  { code: 'XOF', name: 'West African CFA Franc',   country: 'Togo',                  flag: '🇹🇬', symbol: 'CFA',  usdRate: 616.0  },
  { code: 'TND', name: 'Tunisian Dinar',           country: 'Tunisia',               flag: '🇹🇳', symbol: 'DT',   usdRate: 3.1    },
  { code: 'UGX', name: 'Ugandan Shilling',         country: 'Uganda',                flag: '🇺🇬', symbol: 'USh',  usdRate: 3730.0 },
  { code: 'ZMW', name: 'Zambian Kwacha',           country: 'Zambia',                flag: '🇿🇲', symbol: 'ZK',   usdRate: 26.4   },
  { code: 'ZWL', name: 'Zimbabwean Dollar',        country: 'Zimbabwe',              flag: '🇿🇼', symbol: 'Z$',   usdRate: 361.0  },
  { code: 'LKR', name: 'Sahrawi Peseta',           country: 'Western Sahara',        flag: '🇪🇭', symbol: 'Pts',  usdRate: 1.0    },
];

// BTNG Gold mock price in USD (matches trading service)
export const BTNG_USD_PRICE = 12.45;

// Convert USD value to African currency
export function convertUSDtoLocal(usdAmount: number, currency: AfricanCurrency): number {
  return usdAmount * currency.usdRate;
}

// Convert BTNG to African currency
export function convertBTNGtoLocal(btngAmount: number, currency: AfricanCurrency): number {
  return btngAmount * BTNG_USD_PRICE * currency.usdRate;
}

// Format a local currency amount
export function formatLocalCurrency(amount: number, currency: AfricanCurrency): string {
  if (amount >= 1_000_000) {
    return `${currency.symbol}${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `${currency.symbol}${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `${currency.symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Most-used African currencies for quick access
export const FEATURED_CURRENCIES = ['GHS', 'NGN', 'KES', 'ZAR', 'EGP', 'ETB', 'TZS', 'UGX', 'MAD', 'XOF'];

export function getCurrencyByCode(code: string): AfricanCurrency | undefined {
  return AFRICAN_CURRENCIES.find(c => c.code === code);
}

// Default currency (Ghana - platform origin)
export const DEFAULT_CURRENCY_CODE = 'GHS';
