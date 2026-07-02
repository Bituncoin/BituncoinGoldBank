// BTNG Zone Engine Client
// Calls the Zone Engine HTTP API to resolve a user's zone and evaluate rules.
// Point ZONE_ENGINE_HOST at your deployed zone engine server (default port 8125).

const ZONE_ENGINE_HOST = process.env.ZONE_ENGINE_HOST ?? 'http://localhost:8125';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ZoneResolveInput {
  userId: string;
  registeredCountry?: string;
  gpsCountry?: string;
  ipCountry?: string;
  kycLevel: string;
  userTier: string;
}

export interface ZoneResolveResult {
  zoneId: string;
  nodeUrl: string;
  reason: string;
  config: {
    id: string;
    nodeUrl: string;
    maxSendAmount: number;
    maxSwapAmount: number;
    maxWithdrawAmount: number;
  };
}

export interface ZoneEvaluateInput {
  userId: string;
  zoneId: string;
  assetId: string;
  amount: number;
  action: 'SEND' | 'SWAP' | 'WITHDRAW' | 'DEPOSIT';
}

export interface ZoneEvaluateResult {
  allowed: boolean;
  maxAmount?: number;
  reason?: string;
}

// ── Zone Resolve ──────────────────────────────────────────────────────────────

/**
 * Resolves which BTNG zone a user belongs to.
 *
 * @example
 * const zone = await getUserZone({
 *   userId: 'user_123',
 *   registeredCountry: 'GH',
 *   kycLevel: 'FULL',
 *   userTier: 'GOLD',
 * });
 * // zone.zoneId === 'AFRICA_CRYPTO_ZONE'
 */
export async function getUserZone(ctx: ZoneResolveInput): Promise<ZoneResolveResult> {
  const res = await fetch(`${ZONE_ENGINE_HOST}/api/zone/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ctx),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zone resolve failed [${res.status}]: ${text}`);
  }

  return res.json();
}

// ── Zone Rule Evaluation ──────────────────────────────────────────────────────

/**
 * Evaluates whether a transaction action is allowed under the user's zone rules.
 *
 * @example
 * const decision = await evaluateZoneRule({
 *   userId: 'user_123',
 *   zoneId: 'AFRICA_CRYPTO_ZONE',
 *   assetId: 'BTNGG',
 *   amount: 500,
 *   action: 'SEND',
 * });
 * // decision.allowed === true
 */
export async function evaluateZoneRule(ctx: ZoneEvaluateInput): Promise<ZoneEvaluateResult> {
  const res = await fetch(`${ZONE_ENGINE_HOST}/api/zone/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ctx),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zone evaluate failed [${res.status}]: ${text}`);
  }

  return res.json();
}

// ── Combined: Resolve + Evaluate in One Call ──────────────────────────────────

/**
 * Convenience function: resolves user zone then immediately evaluates a rule.
 * Returns both the zone resolution and the rule decision.
 */
export async function resolveAndEvaluate(
  resolveCtx: ZoneResolveInput,
  evaluateCtx: Omit<ZoneEvaluateInput, 'userId' | 'zoneId'>
): Promise<{ zone: ZoneResolveResult; decision: ZoneEvaluateResult }> {
  const zone = await getUserZone(resolveCtx);

  const decision = await evaluateZoneRule({
    userId: resolveCtx.userId,
    zoneId: zone.zoneId,
    ...evaluateCtx,
  });

  return { zone, decision };
}

// ── Lightweight Rule Check (simple wrapper) ───────────────────────────────────

/**
 * Lightweight helper: checks zone rules for a single action.
 * Returns { allowed, maxAmount?, reason? }
 *
 * @example
 * const result = await checkZoneRules({
 *   userId: 'user_123',
 *   zoneId: 'AFRICA_CRYPTO_ZONE',
 *   assetId: 'BTNGG_GOLD',
 *   amount: 3000,
 *   action: 'WITHDRAW',
 * });
 * if (!result.allowed) alert(`Blocked: ${result.reason}`);
 */
export async function checkZoneRules(ctx: {
  userId: string;
  zoneId: string;
  assetId: string;
  amount: number;
  action: string;
}): Promise<ZoneEvaluateResult> {
  const res = await fetch(`${ZONE_ENGINE_HOST}/api/zone/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ctx),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zone rule check failed [${res.status}]: ${text}`);
  }

  return res.json(); // { allowed, maxAmount?, reason? }
}
