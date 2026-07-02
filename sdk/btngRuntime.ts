// btngRuntime.ts
// Sovereign Runtime Layer for BTNG 54‑Country Engine

import { engines, PREFIXES, routeByAddress } from "./btng54Engine";

export type BTNGCountry = keyof typeof PREFIXES;

export class BTNGSovereignRuntime {
  createWallet(country: BTNGCountry) {
    const engine = engines[country];
    return {
      address: engine.generateWalletAddress(),
      keys: engine.generateKeyBundle(),
      country
    };
  }

  createValidator(country: BTNGCountry) {
    const engine = engines[country];
    return {
      validatorAddress: engine.generateValidatorAddress(),
      keys: engine.generateKeyBundle(),
      country
    };
  }

  createCoinAddress(country: BTNGCountry) {
    const engine = engines[country];
    return {
      coinAddress: engine.generateCoinAddress(),
      country
    };
  }

  lookup(address: string) {
    const engine = routeByAddress(address);
    return engine.lookup(address);
  }

  verify(address: string) {
    const engine = routeByAddress(address);
    return engine.verifyAddress(address);
  }

  eyebrow(address: string) {
    const engine = routeByAddress(address);
    return engine.eyebrow(address);
  }
}

export const BTNG = new BTNGSovereignRuntime();
export { PREFIXES };
