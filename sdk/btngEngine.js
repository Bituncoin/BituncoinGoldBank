// btngEngine.js
// BTNG 54-Country Sovereign Engine (Wallet + Security + Lookup)
// Canonical Node.js version — used in CLI / server deployments.
// React Native apps import from services/btngEngineService.ts instead.

const crypto = require("crypto");

/**
 * Create a sovereign engine for a given country prefix.
 * PREFIX format: BTNG<CountryNumber><CountryInitial>  (e.g. BTNG1G, BTNG2N)
 */
function createEngine(PREFIX) {
  function generateHash() {
    return crypto.randomBytes(20).toString("hex").slice(0, 35);
  }

  function generateAddress(type) {
    return `${PREFIX}${type}${generateHash()}`;
  }

  function generateKeyBundle() {
    return {
      sovereign:  crypto.generateKeyPairSync("ed25519"),
      spend:      crypto.generateKeyPairSync("ed25519"),
      view:       crypto.generateKeyPairSync("ed25519"),
      validator:  crypto.generateKeyPairSync("ed25519"),
      trade:      crypto.generateKeyPairSync("ec", { namedCurve: "secp256k1" }),
      aes:        crypto.randomBytes(32), // AES-256 key
    };
  }

  function verifyAddress(addr) {
    return addr.startsWith(PREFIX) && addr.length > 10;
  }

  function lookup(addr) {
    return {
      prefix: addr.slice(0, 6), // BTNG1G
      type:   addr[6],          // w/m/e/g/t/v/c
      hash:   addr.slice(7),
    };
  }

  function eyebrow(addr) {
    return {
      countryPrefix: PREFIX,
      type:          addr[6],
      valid:         verifyAddress(addr),
    };
  }

  return {
    // Address generators by class
    generateWalletAddress:     () => generateAddress("w"), // individual
    generateBusinessAddress:   () => generateAddress("m"), // SME / merchant
    generateEnterpriseAddress: () => generateAddress("e"), // large corp
    generateGovernmentAddress: () => generateAddress("g"), // ministry/agency
    generateTreasuryAddress:   () => generateAddress("t"), // central bank/treasury
    generateValidatorAddress:  () => generateAddress("v"), // node / validator
    generateCoinAddress:       () => generateAddress("c"), // coin / asset

    // Security + identity
    generateKeyBundle,
    verifyAddress,
    lookup,
    eyebrow,
  };
}

/**
 * 54-country BTNG prefixes
 * Canonical GAS-54 map — mirrors services/btngEngineService.ts
 */
const PREFIXES = {
  GHANA:              "BTNG1G",
  NIGERIA:            "BTNG2N",
  SOUTH_AFRICA:       "BTNG3S",
  KENYA:              "BTNG4K",
  EGYPT:              "BTNG5E",
  ETHIOPIA:           "BTNG6E",
  MOROCCO:            "BTNG7M",
  UGANDA:             "BTNG8U",
  TANZANIA:           "BTNG9T",
  ALGERIA:            "BTNG10A",
  SUDAN:              "BTNG11S",
  ANGOLA:             "BTNG12A",
  MOZAMBIQUE:         "BTNG13M",
  MADAGASCAR:         "BTNG14M",
  CAMEROON:           "BTNG15C",
  COTE_DIVOIRE:       "BTNG16C",
  NIGER:              "BTNG17N",
  BURKINA_FASO:       "BTNG18B",
  MALI:               "BTNG19M",
  MALAWI:             "BTNG20M",
  ZAMBIA:             "BTNG21Z",
  SENEGAL:            "BTNG22S",
  CHAD:               "BTNG23C",
  SOMALIA:            "BTNG24S",
  ZIMBABWE:           "BTNG25Z",
  GUINEA:             "BTNG26G",
  RWANDA:             "BTNG27R",
  BENIN:              "BTNG28B",
  BURUNDI:            "BTNG29B",
  TUNISIA:            "BTNG30T",
  SOUTH_SUDAN:        "BTNG31S",
  TOGO:               "BTNG32T",
  SIERRA_LEONE:       "BTNG33S",
  LIBYA:              "BTNG34L",
  DRC:                "BTNG35D",
  CONGO:              "BTNG36C",
  LIBERIA:            "BTNG37L",
  CAR:                "BTNG38C",
  MAURITANIA:         "BTNG39M",
  ERITREA:            "BTNG40E",
  NAMIBIA:            "BTNG41N",
  BOTSWANA:           "BTNG42B",
  LESOTHO:            "BTNG43L",
  ESWATINI:           "BTNG44E",
  GABON:              "BTNG45G",
  GAMBIA:             "BTNG46G",
  GUINEA_BISSAU:      "BTNG47G",
  EQUATORIAL_GUINEA:  "BTNG48E",
  CAPE_VERDE:         "BTNG49C",
  SAO_TOME:           "BTNG50S",
  SEYCHELLES:         "BTNG51S",
  MAURITIUS:          "BTNG52M",
  COMOROS:            "BTNG53C",
  DJIBOUTI:           "BTNG54D",
};

// Build all 54 engines
const engines = Object.fromEntries(
  Object.entries(PREFIXES).map(([name, prefix]) => [name, createEngine(prefix)])
);

/**
 * Route an address to the correct country engine based on its prefix.
 */
function routeByAddress(address) {
  const prefix = address.slice(0, 6); // BTNG1G, BTNG2N, …
  const engine = Object.values(engines).find(e => {
    const info = e.eyebrow(address);
    return info.countryPrefix === prefix;
  });
  if (!engine) throw new Error("Unknown country prefix: " + prefix);
  return engine;
}

module.exports = {
  createEngine,
  engines,
  PREFIXES,
  routeByAddress,
};
