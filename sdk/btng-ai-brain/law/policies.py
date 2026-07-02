# BTNG Sovereign Brain — Policy Library
# Centralised constants shared by router.py and any external policy validators.

from .router import ALLOWED_JURISDICTIONS, TRUSTED_MESH_CIDRS, NETWORK_NODE, BRAIN_VERSION

# Policy families — for documentation and tooling
POLICY_FAMILIES = {
    "ACC":  "Account Opening",
    "PROD": "Product Intelligence",
    "GEO":  "Branch / Location",
    "LOAN": "Loan & Credit",
    "BAL":  "Balance Inquiry",
    "TXN":  "Transfer / Payments",
    "NFT":  "Creative Asset (NFT)",
    "SEC":  "Security & Audit",
    "MESH": "Sovereign Mesh",
    "GOV":  "Governance",
    "BNK":  "Banker Automation",
    "NET":  "Network / Health",
    "LOG":  "Logistics",
    "WDB":  "WDB Merchant",
    "RES":  "Reserve / Cross-Bloc",
    "INF":  "Infrastructure Bond",
    "GEN":  "Genesis / System",
}

# Auth tier definitions
AUTH_TIERS = {
    0: "Anonymous",
    1: "Signed-in (email verified)",
    2: "Verified (KYC tier-2)",
    3: "Operator (tier 3)",
    4: "Council (tier 4)",
    5: "Sovereign Council (tier 5 — cross-bloc key)",
}

__all__ = [
    "ALLOWED_JURISDICTIONS",
    "TRUSTED_MESH_CIDRS",
    "NETWORK_NODE",
    "BRAIN_VERSION",
    "POLICY_FAMILIES",
    "AUTH_TIERS",
]
