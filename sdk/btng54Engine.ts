// btng54Engine.ts
// COMPLETE 54-COUNTRY BTNG WALLET + SECURITY ENGINE
// Drop-in module for any wallet or payment engine.

import crypto from "crypto";

// ---------------------------------------------------------
// 1. ENGINE FACTORY (Universal for all 54 countries)
// ---------------------------------------------------------
function createEngine(PREFIX: string) {
  function generateHash() {
    return crypto.randomBytes(20).toString("hex").slice(0, 35);
  }

  function generateAddress(type: string) {
    return `${PREFIX}${type}${generateHash()}`;
  }

  function generateKeyBundle() {
    return {
      sovereign: crypto.generateKeyPairSync("ed25519"),
      spend: crypto.generateKeyPairSync("ed25519"),
      view: crypto.generateKeyPairSync("ed25519"),
      validator: crypto.generateKeyPairSync("ed25519"),
      trade: crypto.generateKeyPairSync("ec", { namedCurve: "secp256k1" }),
      aes: crypto.randomBytes(32) // AES-256 key
    };
  }

  function verifyAddress(addr: string) {
    return addr.startsWith(PREFIX) && addr.length > 10;
  }

  function lookup(addr: string) {
    return {
      prefix: addr.slice(0, 6),
      type: addr[6],
      hash: addr.slice(7)
    };
  }

  function eyebrow(addr: string) {
    return {
      countryPrefix: PREFIX,
      type: addr[6],
      valid: verifyAddress(addr)
    };
  }

  return {
    generateWalletAddress: () => generateAddress("w"),
    generateBusinessAddress: () => generateAddress("m"),
    generateEnterpriseAddress: () => generateAddress("e"),
    generateGovernmentAddress: () => generateAddress("g"),
    generateTreasuryAddress: () => generateAddress("t"),
    generateValidatorAddress: () => generateAddress("v"),
    generateCoinAddress: () => generateAddress("c"),

    generateKeyBundle,
    verifyAddress,
    lookup,
    eyebrow
  };
}

// ---------------------------------------------------------
// 2. 54-COUNTRY PREFIX MAP (GAS-54 SOVEREIGN STANDARD)
// ---------------------------------------------------------
export const PREFIXES = {
  GHANA:             "BTNG1G",
  NIGERIA:           "BTNG2N",
  SOUTH_AFRICA:      "BTNG3S",
  KENYA:             "BTNG4K",
  EGYPT:             "BTNG5E",
  ETHIOPIA:          "BTNG6E",
  MOROCCO:           "BTNG7M",
  UGANDA:            "BTNG8U",
  TANZANIA:          "BTNG9T",
  ALGERIA:           "BTNG10A",
  SUDAN:             "BTNG11S",
  ANGOLA:            "BTNG12A",
  MOZAMBIQUE:        "BTNG13M",
  MADAGASCAR:        "BTNG14M",
  CAMEROON:          "BTNG15C",
  COTE_DIVOIRE:      "BTNG16C",
  NIGER:             "BTNG17N",
  BURKINA_FASO:      "BTNG18B",
  MALI:              "BTNG19M",
  MALAWI:            "BTNG20M",
  ZAMBIA:            "BTNG21Z",
  SENEGAL:           "BTNG22S",
  CHAD:              "BTNG23C",
  SOMALIA:           "BTNG24S",
  ZIMBABWE:          "BTNG25Z",
  GUINEA:            "BTNG26G",
  RWANDA:            "BTNG27R",
  BENIN:             "BTNG28B",
  BURUNDI:           "BTNG29B",
  TUNISIA:           "BTNG30T",
  SOUTH_SUDAN:       "BTNG31S",
  TOGO:              "BTNG32T",
  SIERRA_LEONE:      "BTNG33S",
  LIBYA:             "BTNG34L",
  DRC:               "BTNG35D",
  CONGO:             "BTNG36C",
  LIBERIA:           "BTNG37L",
  CAR:               "BTNG38C",
  MAURITANIA:        "BTNG39M",
  ERITREA:           "BTNG40E",
  NAMIBIA:           "BTNG41N",
  BOTSWANA:          "BTNG42B",
  LESOTHO:           "BTNG43L",
  ESWATINI:          "BTNG44E",
  GABON:             "BTNG45G",
  GAMBIA:            "BTNG46G",
  GUINEA_BISSAU:     "BTNG47G",
  EQUATORIAL_GUINEA: "BTNG48E",
  CAPE_VERDE:        "BTNG49C",
  SAO_TOME:          "BTNG50S",
  SEYCHELLES:        "BTNG51S",
  MAURITIUS:         "BTNG52M",
  COMOROS:           "BTNG53C",
  DJIBOUTI:          "BTNG54D"
};

// ---------------------------------------------------------
// 3. BUILD ALL 54 ENGINES
// ---------------------------------------------------------
export const engines = Object.fromEntries(
  Object.entries(PREFIXES).map(([name, prefix]) => [name, createEngine(prefix)])
);

// ---------------------------------------------------------
// 4. CONTINENTAL ROUTER (Routes ANY BTNG address)
// ---------------------------------------------------------
export function routeByAddress(address: string) {
  const prefix = address.slice(0, 6);
  const engine = Object.values(engines).find(e => {
    const info = e.eyebrow(address);
    return info.countryPrefix === prefix;
  });
  if (!engine) throw new Error("Unknown BTNG country prefix");
  return engine;
}
