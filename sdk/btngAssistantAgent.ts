// btngAssistantAgent.ts
// BTNG Sovereign Assistant Agent

import { BTNG, PREFIXES, BTNGCountry } from "./btngRuntime";

export type BTNGAgentIntent =
  | "CREATE_WALLET"
  | "CREATE_VALIDATOR"
  | "CREATE_COIN_ADDRESS"
  | "LOOKUP_ADDRESS"
  | "VERIFY_ADDRESS"
  | "EYEBROW_ADDRESS"
  | "HELP";

export interface BTNGAgentRequest {
  intent: BTNGAgentIntent;
  country?: BTNGCountry;
  address?: string;
}

export interface BTNGAgentResponse {
  ok: boolean;
  intent: BTNGAgentIntent;
  message: string;
  data?: any;
}

export class BTNGAssistantAgent {
  handle(req: BTNGAgentRequest): BTNGAgentResponse {
    try {
      switch (req.intent) {
        case "CREATE_WALLET": {
          if (!req.country) throw new Error("country is required");
          const wallet = BTNG.createWallet(req.country);
          return {
            ok: true,
            intent: req.intent,
            message: `Created wallet for ${req.country}`,
            data: {
              address: wallet.address,
              country: wallet.country
              // keys: wallet.keys // store securely if you expose this
            }
          };
        }

        case "CREATE_VALIDATOR": {
          if (!req.country) throw new Error("country is required");
          const v = BTNG.createValidator(req.country);
          return {
            ok: true,
            intent: req.intent,
            message: `Created validator for ${req.country}`,
            data: {
              validatorAddress: v.validatorAddress,
              country: v.country
            }
          };
        }

        case "CREATE_COIN_ADDRESS": {
          if (!req.country) throw new Error("country is required");
          const c = BTNG.createCoinAddress(req.country);
          return {
            ok: true,
            intent: req.intent,
            message: `Created coin address for ${req.country}`,
            data: c
          };
        }

        case "LOOKUP_ADDRESS": {
          if (!req.address) throw new Error("address is required");
          const info = BTNG.lookup(req.address);
          return {
            ok: true,
            intent: req.intent,
            message: "Lookup complete",
            data: info
          };
        }

        case "VERIFY_ADDRESS": {
          if (!req.address) throw new Error("address is required");
          const valid = BTNG.verify(req.address);
          return {
            ok: true,
            intent: req.intent,
            message: valid ? "Address is valid" : "Address is invalid",
            data: { valid }
          };
        }

        case "EYEBROW_ADDRESS": {
          if (!req.address) throw new Error("address is required");
          const eyebrow = BTNG.eyebrow(req.address);
          return {
            ok: true,
            intent: req.intent,
            message: "Eyebrow identity resolved",
            data: eyebrow
          };
        }

        case "HELP":
        default:
          return {
            ok: true,
            intent: "HELP",
            message:
              "Supported intents: CREATE_WALLET, CREATE_VALIDATOR, CREATE_COIN_ADDRESS, LOOKUP_ADDRESS, VERIFY_ADDRESS, EYEBROW_ADDRESS",
            data: { countries: Object.keys(PREFIXES) }
          };
      }
    } catch (err: any) {
      return {
        ok: false,
        intent: req.intent,
        message: err.message || "BTNG agent error"
      };
    }
  }
}

export const BTNG_AGENT = new BTNGAssistantAgent();
