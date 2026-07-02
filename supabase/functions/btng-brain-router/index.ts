/**
 * BTNG Brain Router — Governed Intent Engine
 * The classifier proposes. The network disposes.
 * Every decision is written to the Law Journal (btng_rulings table).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

// ── Network identity ──────────────────────────────────────────────────────────
const NETWORK_NODE = "btng-node-01";
const BRAIN_VERSION = "btng-brain-1.0";

// ── Trusted sovereign mesh CIDRs (IPs authorised to probe /health) ───────────
const TRUSTED_MESH_CIDRS = new Set([
  "154.161.183.158",           // Ghana primary anchor
  "127.0.0.1", "::1",          // Loopback / internal mesh
  "10.0.0.0/8",                // RFC-1918 private (Docker / VPC)
  "172.16.0.0/12",
  "192.168.0.0/16",
]);

/** Exact-match + octet-prefix check for CIDR ranges stored above */
function isTrustedMeshIP(ip: string): boolean {
  if (!ip) return false;
  if (TRUSTED_MESH_CIDRS.has(ip)) return true;
  for (const cidr of TRUSTED_MESH_CIDRS) {
    if (!cidr.includes("/")) continue;
    const [base] = cidr.split("/");
    const baseParts = base.split(".");
    const ipParts   = ip.split(".");
    if (baseParts.every((oct, i) => oct === "0" || oct === ipParts[i])) return true;
  }
  return false;
}

// ── Sovereign jurisdiction map ────────────────────────────────────────────────
const SOVEREIGN_JURISDICTIONS = new Set([
  "GH","SG","CH","AE","KY","LI",       // Core sovereign
  "NG","KE","ZA","RW","TZ","ET",        // African expansion
  "MU","BW","SN","CI","EG","GN",        // West + East Africa tier-2
  "CM","CD","SN","UG","MA","MZ",        // Central + North Africa
]);

// ── KYC tier requirements by intent ─────────────────────────────────────────
const INTENT_MIN_KYC: Record<string, number> = {
  intent_open_account:       2,
  intent_apply_loan:         2,
  intent_gold_card_details:  1,
  intent_explain_gold_card:  0,
  intent_branch_locator:     1,
  intent_balance_inquiry:    1,
  intent_transfer_funds:     2,
};

// ── Policy Engine ─────────────────────────────────────────────────────────────
interface Context {
  kyc_tier?: number;           // 0 = none, 1 = basic, 2 = full
  jurisdiction?: string;       // ISO country code
  risk_flag?: boolean;         // Active risk / AML flag
  is_customer?: boolean;       // Existing authenticated holder
  auth_tier?: number;          // 0 = anon, 1 = signed-in, 2 = verified
  privacy_level?: string;      // "standard" | "maximum"
  user_id?: string;
  email?: string;
  source_ip?: string;          // Caller IP for mesh boundary checks
  batch_size?: number;         // Batch size for merchant / mass-KYC operations
  target_loan?: number;        // Loan ceiling for NFT / infra bond checks
}

interface PolicyDecision {
  ruling: "ALLOW" | "ALLOW_FULL" | "ALLOW_REDUCED" | "DENY" | "ESCALATE_TO_BRANCH" | "PASS";
  policy_id: string;
  tool: string | null;
  reason: string;
}

function applyLaw(intent: string, context: Context): PolicyDecision {

  // ── INTENT: Open Account ─────────────────────────────────────────────────
  if (intent === "intent_open_account") {
    const kyc  = context.kyc_tier  ?? 0;
    const juris = context.jurisdiction ?? "UNKNOWN";
    const risk  = context.risk_flag ?? false;

    if (risk) return {
      ruling: "DENY", policy_id: "ACC-001-RISK", tool: null,
      reason: "Active AML/risk flag — account creation blocked",
    };
    if (kyc >= 2 && SOVEREIGN_JURISDICTIONS.has(juris)) return {
      ruling: "ALLOW", policy_id: "ACC-001", tool: "open_account_workflow",
      reason: "KYC tier-2 clear + sovereign jurisdiction",
    };
    if (kyc >= 1) return {
      ruling: "ESCALATE_TO_BRANCH", policy_id: "ACC-001-KYC", tool: "branch_handoff_queue",
      reason: "KYC tier-1 only — human review required for full account",
    };
    return {
      ruling: "DENY", policy_id: "ACC-001-NOKYC", tool: null,
      reason: "No verified identity — complete KYC to proceed",
    };
  }

  // ── INTENT: Explain / Gold Card Details ─────────────────────────────────
  if (intent === "intent_explain_gold_card" || intent === "intent_gold_card_details") {
    const isCustomer = context.is_customer ?? false;
    const authTier   = context.auth_tier   ?? 0;
    if (isCustomer || authTier >= 1) return {
      ruling: "ALLOW", policy_id: "PROD-001", tool: "product_knowledge_base",
      reason: "Authenticated holder — full product intelligence granted",
    };
    return {
      ruling: "DENY", policy_id: "PROD-001-AUTH", tool: null,
      reason: "Product intelligence restricted to BTNG card holders only",
    };
  }

  // ── INTENT: Branch Locator ────────────────────────────────────────────────
  if (intent === "intent_branch_locator") {
    const authTier = context.auth_tier   ?? 0;
    const privacy  = context.privacy_level ?? "standard";

    if (privacy === "maximum" || authTier < 1) return {
      ruling: "DENY", policy_id: "GEO-001-PRIV", tool: null,
      reason: "Privacy lock active or unauthenticated — location withheld",
    };
    if (authTier >= 2) return {
      ruling: "ALLOW_FULL", policy_id: "GEO-001", tool: "branch_locator_precise",
      reason: "Tier-2 auth — full branch location with address",
    };
    return {
      ruling: "ALLOW_REDUCED", policy_id: "GEO-001-LIM", tool: "branch_locator_region_only",
      reason: "Tier-1 auth — region/city shown, precise address withheld",
    };
  }

  // ── INTENT: Loan Application ─────────────────────────────────────────────
  if (intent === "intent_apply_loan") {
    const kyc  = context.kyc_tier  ?? 0;
    const risk  = context.risk_flag ?? false;
    if (risk) return {
      ruling: "DENY", policy_id: "LOAN-001-RISK", tool: null,
      reason: "Active risk flag — loan applications suspended",
    };
    if (kyc >= 2) return {
      ruling: "ALLOW", policy_id: "LOAN-001", tool: "loan_application_engine",
      reason: "Full KYC verified — gold-backed credit eligible",
    };
    return {
      ruling: "ESCALATE_TO_BRANCH", policy_id: "LOAN-001-KYC", tool: "branch_handoff_queue",
      reason: "KYC tier insufficient — escalate to sovereign officer",
    };
  }

  // ── INTENT: Balance Inquiry ───────────────────────────────────────────────
  if (intent === "intent_balance_inquiry") {
    const authTier = context.auth_tier ?? 0;
    if (authTier >= 1) return {
      ruling: "ALLOW", policy_id: "BAL-001", tool: "wallet_balance_query",
      reason: "Authenticated — balance retrieval permitted",
    };
    return {
      ruling: "DENY", policy_id: "BAL-001-AUTH", tool: null,
      reason: "Authentication required for balance inquiry",
    };
  }

  // ── INTENT: Transfer Funds ────────────────────────────────────────────────
  if (intent === "intent_transfer_funds") {
    const kyc  = context.kyc_tier  ?? 0;
    const risk  = context.risk_flag ?? false;
    if (risk) return {
      ruling: "DENY", policy_id: "TXN-001-RISK", tool: null,
      reason: "Transfer blocked — active risk flag",
    };
    if (kyc >= 2) return {
      ruling: "ALLOW", policy_id: "TXN-001", tool: "funds_transfer_workflow",
      reason: "Full KYC — cross-border BTNG transfer permitted",
    };
    return {
      ruling: "DENY", policy_id: "TXN-001-KYC", tool: null,
      reason: "Transfer requires KYC tier-2 — complete identity verification",
    };
  }

  // ── SOVEREIGN CLI INTENTS ──────────────────────────────────────────────────

  // NFT: Create & Loan
  if (intent === "intent_nft_create_and_loan") {
    const juris = context.jurisdiction ?? "UNKNOWN";
    const risk  = context.risk_flag    ?? false;
    const loan  = (context as any).target_loan ?? 0;
    if (risk) return {
      ruling: "DENY", policy_id: "NFT-001-RISK", tool: null,
      reason: "Risk flag active on artist/asset",
    };
    if (!SOVEREIGN_JURISDICTIONS.has(juris)) return {
      ruling: "DENY", policy_id: "NFT-001-JUR", tool: null,
      reason: "Jurisdiction not in sovereign mesh — add it to expand coverage",
    };
    if (loan > 500_000) return {
      ruling: "ESCALATE_TO_BRANCH", policy_id: "NFT-001-CAP", tool: "council_review_queue",
      reason: "Loan exceeds single-asset autonomous ceiling ($500k) — council review required",
    };
    return {
      ruling: "ALLOW", policy_id: "NFT-001", tool: "create_and_loan_workflow",
      reason: "Jurisdiction and loan ceiling clear — NFT mint + loan authorized",
    };
  }

  // NFT: Pilot Init
  if (intent === "intent_nft_pilot_init") {
    const authTier = context.auth_tier ?? 0;
    if (authTier < 2) return {
      ruling: "DENY", policy_id: "NFT-003-AUTH", tool: null,
      reason: "Pilot init requires operator tier 2+",
    };
    return {
      ruling: "ALLOW", policy_id: "NFT-003", tool: "nft_pilot_engine",
      reason: "Pilot initialization authorized",
    };
  }

  // NFT: Finalize Lock
  if (intent === "intent_nft_finalize_lock") {
    const authTier = context.auth_tier ?? 0;
    if (authTier < 3) return {
      ruling: "DENY", policy_id: "NFT-004-AUTH", tool: null,
      reason: "Finalize-lock is irreversible — requires operator tier 3",
    };
    return {
      ruling: "ALLOW", policy_id: "NFT-004", tool: "nft_lock_workflow",
      reason: "Asset finalize-lock authorized by operator",
    };
  }

  // NFT: Generate Certificate
  if (intent === "intent_nft_generate_certificate") {
    return {
      ruling: "ALLOW", policy_id: "NFT-005", tool: "cert_generator",
      reason: "Certificate generation permitted to authenticated operator",
    };
  }

  // NFT: Verify (read-only)
  if (intent === "intent_nft_verify") {
    return {
      ruling: "ALLOW", policy_id: "NFT-002", tool: "asset_verifier",
      reason: "Read-only verification permitted to all",
    };
  }

  // Security: Seal Disk Tank
  if (intent === "intent_security_seal_disk_tank") {
    const authTier = context.auth_tier ?? 0;
    if (authTier < 3) return {
      ruling: "DENY", policy_id: "SEC-001-AUTH", tool: null,
      reason: "Security seal requires operator tier 3 — this action is irreversible",
    };
    return {
      ruling: "ALLOW", policy_id: "SEC-001", tool: "security_audit_seal",
      reason: "Disk tank seal authorized by tier-3 operator",
    };
  }

  // Mesh: Broadcast Directive (council tier 4 required)
  if (intent === "intent_mesh_broadcast_directive") {
    const authTier = context.auth_tier ?? 0;
    if (authTier < 4) return {
      ruling: "DENY", policy_id: "MESH-001-AUTH", tool: null,
      reason: "Global mesh directive requires council tier 4",
    };
    return {
      ruling: "ALLOW", policy_id: "MESH-001", tool: "broadcast_manager",
      reason: "Directive broadcast authorized by council",
    };
  }

  // Mesh: Sync (read-only health check)
  if (intent === "intent_mesh_sync") {
    return {
      ruling: "ALLOW", policy_id: "MESH-002", tool: "mesh_sync_protocol",
      reason: "Read-only mesh sync permitted",
    };
  }

  // Mesh: Scale / Rebalance / Release Liquidity (operator tier 3)
  if (["intent_mesh_scale", "intent_mesh_rebalance", "intent_mesh_release_liquidity"].includes(intent)) {
    const authTier = context.auth_tier ?? 0;
    if (authTier < 3) return {
      ruling: "DENY", policy_id: "MESH-003-AUTH", tool: null,
      reason: "Mesh treasury actions require operator tier 3",
    };
    return {
      ruling: "ALLOW", policy_id: "MESH-003", tool: "mesh_treasury_module",
      reason: "Treasury action authorized by tier-3 operator",
    };
  }

  // Governance: Export Audit
  if (intent === "intent_governance_export_audit") {
    return {
      ruling: "ALLOW", policy_id: "GOV-002", tool: "audit_exporter",
      reason: "Audit export permitted to authenticated operator",
    };
  }

  // Council: Report Broadcast (council tier 4)
  if (intent === "intent_council_report_broadcast") {
    const authTier = context.auth_tier ?? 0;
    if (authTier < 4) return {
      ruling: "DENY", policy_id: "GOV-001-AUTH", tool: null,
      reason: "Council report broadcast requires tier 4 council authority",
    };
    return {
      ruling: "ALLOW", policy_id: "GOV-001", tool: "council_broadcast",
      reason: "Council report broadcast authorized",
    };
  }

  // Banker: Perpetual Run / Forever Loop (automation arm, tier 3)
  if (["intent_banker_perpetual_run", "intent_banker_forever_loop"].includes(intent)) {
    const authTier = context.auth_tier ?? 0;
    if (authTier < 3) return {
      ruling: "DENY", policy_id: "BNK-001-AUTH", tool: null,
      reason: "Automation arm requires operator tier 3 — prevents rogue loops",
    };
    return {
      ruling: "ALLOW", policy_id: "BNK-001", tool: "automation_module",
      reason: "Banker automation armed by operator",
    };
  }

  // ── INTENT: External Health Check (mesh boundary probe) ─────────────────
  if (intent === "intent_health_check_external") {
    const srcIp = context.source_ip ?? "";
    if (!isTrustedMeshIP(srcIp)) return {
      ruling: "DENY", policy_id: "NET-001", tool: null,
      reason: `Health probe from untrusted sovereign boundary — source IP: ${srcIp || "unknown"}`,
    };
    return {
      ruling: "ALLOW", policy_id: "NET-001", tool: "health_status_endpoint",
      reason: "Trusted mesh node — health probe permitted",
    };
  }

  // ── PHASE 2 Q2 2026: EXPANSION INTENTS ─────────────────────────────────────

  // Western Rail / Tarkwa Gold Hub (Logistics)
  if (intent === "intent_logistics_tarkwa_gold_hub") {
    const authTier = context.auth_tier ?? 0;
    if (authTier < 3) return {
      ruling: "DENY", policy_id: "LOG-001-AUTH", tool: null,
      reason: "Rail logistics API requires operator tier 3 — Western Corridor restricted",
    };
    return {
      ruling: "ALLOW", policy_id: "LOG-001", tool: "tarkwa_logistics_api",
      reason: "Western Corridor armed — Tarkwa Gold Hub logistics API authorized",
    };
  }

  // WDB Merchant Onboarding (Mass KYC / Act 1151)
  if (intent === "intent_wdb_merchant_onboard") {
    const authTier  = context.auth_tier  ?? 0;
    const batchSize = context.batch_size ?? 0;
    if (authTier < 2) return {
      ruling: "DENY", policy_id: "WDB-001-AUTH", tool: null,
      reason: "Merchant onboarding requires operator tier 2 — verify identity first",
    };
    // Tier 3+ operators bypass the 10k human-review ceiling — every ALLOW is logged.
    if (authTier >= 3) return {
      ruling: "ALLOW", policy_id: "WDB-001-OPR", tool: "wdb_bulk_kyc_pipeline",
      reason: "Operator tier 3+ — large batch ceiling bypassed, Act 1151 pipeline armed",
    };
    // Tier 2: enforce 10k council-review gate
    if (batchSize > 10_000) return {
      ruling: "ESCALATE_TO_BRANCH", policy_id: "WDB-001-BATCH", tool: "council_review_queue",
      reason: "Tier-2 batch > 10,000 requires sovereign council sign-off under Act 1151",
    };
    return {
      ruling: "ALLOW", policy_id: "WDB-001", tool: "wdb_bulk_kyc_pipeline",
      reason: "Merchant cohort cleared — Act 1151 enrollment pipeline armed",
    };
  }

  // BRICS+ Reserve Sync (Cross-Bloc)
  if (intent === "intent_reserve_sync_cross_bloc") {
    const authTier = context.auth_tier ?? 0;
    if (authTier < 5) return {
      ruling: "DENY", policy_id: "RES-005-AUTH", tool: null,
      reason: "Cross-bloc reserve sync requires council tier 5 — sovereign key required",
    };
    return {
      ruling: "ALLOW", policy_id: "RES-005", tool: "brics_plus_bridge",
      reason: "BRICS+ handshake authorized by sovereign council — cross-bloc bridge armed",
    };
  }

  // Pan-African Rail Expansion (Infrastructure Bond)
  if (intent === "intent_infrastructure_rail_expansion") {
    const authTier = context.auth_tier ?? 0;
    if (authTier < 4) return {
      ruling: "DENY", policy_id: "INF-001-AUTH", tool: null,
      reason: "Infrastructure bond execution requires council tier 4 — Sahelian quorum needed",
    };
    return {
      ruling: "ALLOW", policy_id: "INF-001", tool: "rail_bond_issuer",
      reason: "Sahelian expansion armed — Pan-African rail bond issuer authorized",
    };
  }

  // ── INTENT: System Genesis (the immutable origin anchor) ─────────────────
  if (intent === "intent_system_genesis") {
    return {
      ruling: "ANCHORED" as any,
      policy_id: "GEN-000",
      tool: "law_journal_origin",
      reason: "Genesis block — the immutable first entry. All rulings are measured from this sovereign origin.",
    };
  }

  // ── DEFAULT: Unknown intent — model may talk but CANNOT act ─────────────
  return {
    ruling: "PASS", policy_id: "DEFAULT", tool: null,
    reason: "No sovereign gate defined — conversational response only",
  };
}

// ── Intent Classifier (keyword-based sovereign router) ────────────────────────
function classifyIntent(text: string): { intent: string; confidence: number } {
  const t = text.toLowerCase();

  // Map patterns → intents
  const patterns: [string[], string, number][] = [
    // Banking intents
    [["open account","create account","new account","register account","signup"],           "intent_open_account",              0.92],
    [["gold card","btng card","gold coin card","card details","card benefits"],             "intent_explain_gold_card",         0.89],
    [["card features","card product","gold card product"],                                 "intent_gold_card_details",         0.87],
    [["branch","location","office","nearest","atm","where is"],                            "intent_branch_locator",            0.91],
    [["loan","borrow","credit","finance","apply loan","need funding","capital"],            "intent_apply_loan",                0.90],
    [["balance","how much","my wallet","wallet balance","how many btng"],                  "intent_balance_inquiry",           0.93],
    [["transfer","send","send money","wire","remit","pay to","move funds"],                "intent_transfer_funds",            0.92],
    // CLI / Sovereign intents
    [["nft create","create and loan","mint nft","create loan","nft:create"],               "intent_nft_create_and_loan",       0.95],
    [["nft verify","verify asset","check nft","nft:verify"],                              "intent_nft_verify",                0.94],
    [["nft pilot","pilot init","nft:pilot"],                                              "intent_nft_pilot_init",            0.93],
    [["finalize lock","lock asset","seal asset","nft:finalize"],                          "intent_nft_finalize_lock",         0.94],
    [["generate certificate","issue cert","nft:cert"],                                   "intent_nft_generate_certificate",  0.93],
    [["seal disk","seal tank","security seal","security:seal"],                          "intent_security_seal_disk_tank",   0.96],
    [["broadcast directive","mesh broadcast","global directive","mesh:broadcast"],        "intent_mesh_broadcast_directive",  0.95],
    [["mesh scale","scale mesh","mesh:scale"],                                           "intent_mesh_scale",                0.94],
    [["release liquidity","mesh liquidity","mesh:liquidity"],                            "intent_mesh_release_liquidity",    0.94],
    [["mesh sync","sync nodes","mesh:sync"],                                             "intent_mesh_sync",                 0.96],
    [["mesh rebalance","rebalance treasury","mesh:rebalance"],                           "intent_mesh_rebalance",            0.94],
    [["export audit","audit log","governance export","governance:audit"],                 "intent_governance_export_audit",   0.93],
    [["council report","report broadcast","council:report"],                             "intent_council_report_broadcast",  0.95],
    [["perpetual run","banker run","banker:perpetual"],                                  "intent_banker_perpetual_run",      0.95],
    [["forever loop","banker loop","banker:forever"],                                    "intent_banker_forever_loop",       0.95],
    [["health check","health probe","node health","mesh health","health:external","/health"], "intent_health_check_external", 0.97],
    [["genesis","origin anchor","law journal origin","first block","genesis block","intent_system_genesis","GEN-000"], "intent_system_genesis", 1.00],
    // ── Phase 2 Q2 2026 ──────────────────────────────────────────────────────
    [["tarkwa","gold hub","western rail","logistics hub","rail corridor","tarkwa hub"],        "intent_logistics_tarkwa_gold_hub",     0.95],
    [["merchant onboard","wdb merchant","bulk kyc","act 1151","merchant enroll","mass kyc"],   "intent_wdb_merchant_onboard",          0.94],
    [["brics","reserve sync","cross bloc","brics+","bloc bridge","cross-bloc reserve"],        "intent_reserve_sync_cross_bloc",       0.96],
    [["rail expansion","infrastructure bond","pan african rail","sahelian","rail bond"],        "intent_infrastructure_rail_expansion", 0.95],
  ];

  for (const [keywords, intent, confidence] of patterns) {
    if (keywords.some(k => t.includes(k))) {
      // Adjust confidence by text length (shorter = less certain)
      const adj = t.length < 12 ? confidence - 0.08 : confidence;
      return { intent, confidence: Math.min(adj, 0.99) };
    }
  }

  // Fallback heuristics
  if (t.includes("help") || t.includes("support")) {
    return { intent: "intent_general_support", confidence: 0.75 };
  }

  return { intent: "intent_unknown", confidence: 0.50 };
}

// ── SHA-256 input hash (no PII stored) ───────────────────────────────────────
async function hashInput(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuf  = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArr  = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ── Law Journal writer ────────────────────────────────────────────────────────
async function writeRuling(
  supabase: ReturnType<typeof createClient>,
  entry: {
    session_id: string; intent: string; confidence: number;
    policy_id: string; ruling: string; tool: string | null;
    latency_ms: number; input_hash: string; reason: string;
  }
) {
  const { error } = await supabase.from("btng_rulings").insert({
    session_id:   entry.session_id,
    intent:       entry.intent,
    confidence:   entry.confidence,
    policy_id:    entry.policy_id,
    ruling:       entry.ruling,
    tool:         entry.tool,
    network_node: NETWORK_NODE,
    latency_ms:   entry.latency_ms,
    input_hash:   entry.input_hash,
    reason:       entry.reason,
    version:      BRAIN_VERSION,
  });
  if (error) console.warn("[brain-router] ruling write error:", error.message);
}

// ── Edge Function entry ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = performance.now();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.json() as {
      input: string;
      session_id?: string;
      context?: Context;
    };

    const { input, session_id, context = {} } = body;

    if (!input || typeof input !== "string") {
      return new Response(JSON.stringify({ error: "input is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // ── Capture caller IP for mesh boundary policies ───────────────────────
    if (!context.source_ip) {
      const cfIp  = req.headers.get("CF-Connecting-IP");
      const xReal = req.headers.get("X-Real-IP");
      const xFwd  = req.headers.get("X-Forwarded-For")?.split(",")[0].trim();
      context.source_ip = cfIp ?? xReal ?? xFwd ?? "";
    }

    // ── Try to enrich context from auth header ───────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (authHeader && !context.user_id) {
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? ""
      );
      const { data } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
      if (data?.user) {
        context.user_id    = data.user.id;
        context.email      = data.user.email;
        context.auth_tier  = context.auth_tier ?? 1;
        context.is_customer = true;
      }
    }

    const sid       = session_id ?? crypto.randomUUID().slice(0, 12);
    const inputHash = await hashInput(input);

    // ── Classifier: proposes intent ─────────────────────────────────────
    const { intent, confidence } = classifyIntent(input);

    // ── Policy Engine: the network disposes ────────────────────────────
    const decision = applyLaw(intent, context);

    const latencyMs = Math.round(performance.now() - t0);

    // ── Write to Law Journal ────────────────────────────────────────────
    await writeRuling(supabase, {
      session_id:  sid,
      intent,
      confidence,
      policy_id:   decision.policy_id,
      ruling:      decision.ruling,
      tool:        decision.tool,
      latency_ms:  latencyMs,
      input_hash:  inputHash,
      reason:      decision.reason,
    });

    console.log(`[brain-router] ${sid} | ${intent} (${(confidence*100).toFixed(0)}%) → ${decision.ruling} | ${decision.policy_id} | ${latencyMs}ms`);

    return new Response(
      JSON.stringify({
        session_id:   sid,
        intent,
        confidence,
        ruling:       decision.ruling,
        tool:         decision.tool,
        policy:       decision.policy_id,
        reason:       decision.reason,
        network_node: NETWORK_NODE,
        governed:     true,
        latency_ms:   latencyMs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: any) {
    console.error("[brain-router] fatal:", err?.message);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
