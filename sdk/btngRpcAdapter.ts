// btngRpcAdapter.ts
// JSON-RPC 2.0 adapter for the BTNG 54-Nation Sovereign Runtime
// Wraps BTNGSovereignRuntime so any HTTP client can call the engine
// without importing btngRuntime.ts directly.
//
// Supported methods:
//   btng_createWallet        — generate a sovereign wallet address + keys
//   btng_createValidator     — generate a validator address + keys
//   btng_createCoinAddress   — generate a coin/asset address
//   btng_lookup              — decode a BTNG address (prefix / type / hash)
//   btng_verify              — check whether an address is valid
//   btng_eyebrow             — return countryPrefix + type + valid flag
//   rpc_listMethods          — introspect available methods
//
// ── JSON-RPC 2.0 wire shapes ─────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// ── Standard JSON-RPC 2.0 error codes ────────────────────────────────────────
const RPC_ERRORS = {
  PARSE_ERROR:      { code: -32700, message: "Parse error"      },
  INVALID_REQUEST:  { code: -32600, message: "Invalid Request"  },
  METHOD_NOT_FOUND: { code: -32601, message: "Method not found" },
  INVALID_PARAMS:   { code: -32602, message: "Invalid params"   },
  INTERNAL_ERROR:   { code: -32603, message: "Internal error"   },
} as const;

// ── Runtime import (Node.js / server-side only) ───────────────────────────────
import { BTNG, PREFIXES, BTNGCountry } from "./btngRuntime";

// ── Method registry ───────────────────────────────────────────────────────────

type RpcHandler = (params: Record<string, unknown>) => unknown;

const METHODS: Record<string, RpcHandler> = {
  /**
   * btng_createWallet
   * params: { country: BTNGCountry }
   * result: { address, country }   (keys omitted — store server-side only)
   */
  btng_createWallet: (params) => {
    const country = requireCountry(params);
    const wallet = BTNG.createWallet(country);
    return { address: wallet.address, country: wallet.country };
  },

  /**
   * btng_createValidator
   * params: { country: BTNGCountry }
   * result: { validatorAddress, country }
   */
  btng_createValidator: (params) => {
    const country = requireCountry(params);
    const v = BTNG.createValidator(country);
    return { validatorAddress: v.validatorAddress, country: v.country };
  },

  /**
   * btng_createCoinAddress
   * params: { country: BTNGCountry }
   * result: { coinAddress, country }
   */
  btng_createCoinAddress: (params) => {
    const country = requireCountry(params);
    return BTNG.createCoinAddress(country);
  },

  /**
   * btng_lookup
   * params: { address: string }
   * result: { prefix, type, hash }
   */
  btng_lookup: (params) => {
    const address = requireAddress(params);
    return BTNG.lookup(address);
  },

  /**
   * btng_verify
   * params: { address: string }
   * result: { valid: boolean, address: string }
   */
  btng_verify: (params) => {
    const address = requireAddress(params);
    const valid = BTNG.verify(address);
    return { valid, address };
  },

  /**
   * btng_eyebrow
   * params: { address: string }
   * result: { countryPrefix, type, valid }
   */
  btng_eyebrow: (params) => {
    const address = requireAddress(params);
    return BTNG.eyebrow(address);
  },

  /**
   * rpc_listMethods
   * params: {}
   * result: { methods: string[], countries: string[] }
   */
  rpc_listMethods: (_params) => ({
    methods: Object.keys(METHODS),
    countries: Object.keys(PREFIXES),
    spec: "JSON-RPC 2.0",
    engine: "BTNG 54-Nation Sovereign Runtime",
  }),
};

// ── Param validators ──────────────────────────────────────────────────────────

function requireCountry(params: Record<string, unknown>): BTNGCountry {
  const country = params["country"];
  if (typeof country !== "string") {
    throw rpcError("INVALID_PARAMS", '"country" must be a string (e.g. "GHANA")');
  }
  if (!(country in PREFIXES)) {
    throw rpcError(
      "INVALID_PARAMS",
      `Unknown country "${country}". Valid values: ${Object.keys(PREFIXES).join(", ")}`
    );
  }
  return country as BTNGCountry;
}

function requireAddress(params: Record<string, unknown>): string {
  const address = params["address"];
  if (typeof address !== "string" || address.trim() === "") {
    throw rpcError("INVALID_PARAMS", '"address" must be a non-empty string');
  }
  if (!address.startsWith("BTNG")) {
    throw rpcError("INVALID_PARAMS", '"address" must begin with "BTNG"');
  }
  return address.trim();
}

// ── Error factory ─────────────────────────────────────────────────────────────

interface RpcInternalError {
  _rpcError: true;
  code: number;
  message: string;
  data?: unknown;
}

function rpcError(
  type: keyof typeof RPC_ERRORS,
  detail?: string
): RpcInternalError {
  return {
    _rpcError: true,
    ...RPC_ERRORS[type],
    ...(detail ? { data: detail } : {}),
  };
}

function isRpcError(e: unknown): e is RpcInternalError {
  return typeof e === "object" && e !== null && (e as RpcInternalError)._rpcError === true;
}

// ── Core dispatcher ───────────────────────────────────────────────────────────

export function handleRpcRequest(rawRequest: unknown): JsonRpcResponse {
  // Validate envelope
  if (
    typeof rawRequest !== "object" ||
    rawRequest === null ||
    (rawRequest as JsonRpcRequest).jsonrpc !== "2.0" ||
    typeof (rawRequest as JsonRpcRequest).method !== "string"
  ) {
    return errorResponse(null, RPC_ERRORS.INVALID_REQUEST);
  }

  const req = rawRequest as JsonRpcRequest;
  const id = req.id ?? null;

  // Normalise params → Record<string, unknown>
  let params: Record<string, unknown> = {};
  if (Array.isArray(req.params)) {
    // Positional params not supported for named-param API; treat as empty
    params = {};
  } else if (typeof req.params === "object" && req.params !== null) {
    params = req.params as Record<string, unknown>;
  }

  // Resolve method
  const handler = METHODS[req.method];
  if (!handler) {
    return errorResponse(id, { ...RPC_ERRORS.METHOD_NOT_FOUND, data: `"${req.method}" is not a registered method` });
  }

  // Invoke
  try {
    const result = handler(params);
    return { jsonrpc: "2.0", id, result };
  } catch (err) {
    if (isRpcError(err)) {
      return errorResponse(id, { code: err.code, message: err.message, data: err.data });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(id, { ...RPC_ERRORS.INTERNAL_ERROR, data: msg });
  }
}

/** Convenience: handle a batch of requests (JSON-RPC 2.0 batch) */
export function handleRpcBatch(requests: unknown[]): JsonRpcResponse[] {
  if (!Array.isArray(requests) || requests.length === 0) {
    return [errorResponse(null, RPC_ERRORS.INVALID_REQUEST)];
  }
  return requests.map(handleRpcRequest);
}

// ── HTTP handler (works with Express / Deno / any req+res pair) ───────────────

/**
 * btngRpcHandler
 * Drop into any Express-style router:
 *
 *   import { btngRpcHandler } from "./btngRpcAdapter";
 *   app.post("/rpc", btngRpcHandler);
 *
 * Or use handleRpcRequest() directly for serverless edge functions.
 */
export async function btngRpcHandler(
  req: { body: unknown },
  res: { status: (n: number) => { json: (o: unknown) => void } }
): Promise<void> {
  const body = req.body;

  if (Array.isArray(body)) {
    res.status(200).json(handleRpcBatch(body));
    return;
  }

  const response = handleRpcRequest(body);
  const httpCode = isErrorResponse(response) ? 200 : 200; // RPC always 200; error in payload
  res.status(httpCode).json(response);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function errorResponse(
  id: string | number | null,
  error: { code: number; message: string; data?: unknown }
): JsonRpcErrorResponse {
  return { jsonrpc: "2.0", id, error };
}

function isErrorResponse(r: JsonRpcResponse): r is JsonRpcErrorResponse {
  return "error" in r;
}

// ── Express route export (optional convenience) ───────────────────────────────

import { Router } from "express";

const rpcRouter = Router();

rpcRouter.post("/rpc", async (req, res) => {
  await btngRpcHandler(req, res as any);
});

rpcRouter.get("/rpc/methods", (_req, res) => {
  res.json({
    jsonrpc: "2.0",
    id: null,
    result: METHODS["rpc_listMethods"]({}),
  });
});

export default rpcRouter;

// ── Usage examples ─────────────────────────────────────────────────────────────
//
// 1. Express integration
// ─────────────────────
//   import rpcRouter from "./btngRpcAdapter";
//   app.use("/api", rpcRouter);
//   // POST /api/rpc  { "jsonrpc":"2.0","id":1,"method":"btng_createWallet","params":{"country":"GHANA"} }
//
// 2. Direct programmatic usage
// ─────────────────────────────
//   import { handleRpcRequest } from "./btngRpcAdapter";
//
//   const response = handleRpcRequest({
//     jsonrpc: "2.0",
//     id: 42,
//     method: "btng_createWallet",
//     params: { country: "GHANA" },
//   });
//   console.log(response.result); // { address: "BTNG1Gw...", country: "GHANA" }
//
// 3. Batch request
// ─────────────────
//   import { handleRpcBatch } from "./btngRpcAdapter";
//
//   const responses = handleRpcBatch([
//     { jsonrpc:"2.0", id:1, method:"btng_createWallet",  params:{ country:"GHANA"   } },
//     { jsonrpc:"2.0", id:2, method:"btng_createWallet",  params:{ country:"NIGERIA" } },
//     { jsonrpc:"2.0", id:3, method:"btng_verify",        params:{ address:"BTNG1Gw..."  } },
//     { jsonrpc:"2.0", id:4, method:"rpc_listMethods",    params:{} },
//   ]);
//
// 4. Serverless / Edge Function
// ──────────────────────────────
//   Deno.serve(async (req) => {
//     const body = await req.json();
//     const result = handleRpcRequest(body);
//     return new Response(JSON.stringify(result), {
//       headers: { "Content-Type": "application/json" },
//     });
//   });
