# ╔══════════════════════════════════════════════════════════════════╗
# ║  BTNG UNIVERSAL BANKING ENGINE — UBL-1.0                        ║
# ║  FastAPI Backend · Deploy once · All platforms connect          ║
# ║  https://btng-bank.yourdomain.com                               ║
# ╚══════════════════════════════════════════════════════════════════╝
#
# REQUIREMENTS:
#   pip install fastapi uvicorn pydantic
#
# RUN:
#   uvicorn main:app --host 0.0.0.0 --port 8080
#
# DEPLOY:
#   Render / Railway / VPS / Docker — expose at your domain

from fastapi import FastAPI, Request
from pydantic import BaseModel
from datetime import datetime, timedelta

app = FastAPI(
    title="BTNG Universal Banking Engine",
    description="Sovereign BTNG Gold banking backend — UBL-1.0",
    version="1.0.0"
)

BTNG_GOLD_SYMBOL  = "BTNGG"
BTNG_CHAIN_PREFIX = "btng1"
BASE_RATE_APR     = 0.08   # 8% APR sovereign rate
MAX_LTV           = 0.70   # 70% loan-to-value

# ── Request Models ────────────────────────────────────────────────
class IdentityIn(BaseModel):
    btng_id: str
    wallet:  str
    expires: str

class LoanRequest(BaseModel):
    btng_id:   str
    principal: float
    days:      int

# ── Identity Registry ─────────────────────────────────────────────
@app.post("/identity")
def register_identity(identity: IdentityIn, request: Request):
    client = request.headers.get("X-BTNG-Client", "unknown")
    return {
        "status":        "OK",
        "btng_id":       identity.btng_id,
        "wallet":        identity.wallet,
        "expires":       identity.expires,
        "registered_at": datetime.utcnow().isoformat(),
        "client":        client,
    }

# ── Wallet Lookup ─────────────────────────────────────────────────
@app.get("/wallet/{btng_id}")
def get_wallet(btng_id: str, request: Request):
    client = request.headers.get("X-BTNG-Client", "unknown")
    suffix = btng_id.replace("-", "").lower()[-6:]
    return {
        "btng_id": btng_id,
        "wallet":  f"{BTNG_CHAIN_PREFIX}{suffix}",
        "asset":   BTNG_GOLD_SYMBOL,
        "balance": 0.0,
        "tier":    "Bronze",
        "active":  True,
        "client":  client,
    }

# ── Loan Quote ────────────────────────────────────────────────────
@app.post("/loan/quote")
def loan_quote(req: LoanRequest, request: Request):
    max_borrow = req.principal * MAX_LTV
    daily_rate = BASE_RATE_APR / 365.0
    interest   = max_borrow * daily_rate * req.days
    total_due  = max_borrow + interest
    due_date   = datetime.utcnow() + timedelta(days=req.days)
    risk = ("HIGH" if req.principal > 50000
            else "MEDIUM" if req.principal > 10000
            else "LOW")
    return {
        "btng_id":    req.btng_id,
        "principal":  req.principal,
        "max_borrow": round(max_borrow, 2),
        "interest":   round(interest, 2),
        "total_due":  round(total_due, 2),
        "currency":   BTNG_GOLD_SYMBOL,
        "due_date":   due_date.isoformat(),
        "rate_apr":   BASE_RATE_APR,
        "ltv":        MAX_LTV,
        "risk_level": risk,
        "client":     request.headers.get("X-BTNG-Client", "unknown"),
    }

# ── Card Activation ───────────────────────────────────────────────
@app.post("/card/activate")
def activate_card(payload: dict, request: Request):
    btng_id    = payload.get("btng_id", "")
    wallet     = payload.get("wallet", "")
    expires    = payload.get("expires") or (
        datetime.utcnow() + timedelta(days=3*365)
    ).strftime("%Y-%m-%d")
    seed       = "".join(c for c in btng_id if c.isdigit()).zfill(16)[-16:]
    masked     = f"{seed[:4]} •••• •••• {seed[-4:]}"
    return {
        "status":              "ACTIVE",
        "btng_id":             btng_id,
        "wallet":              wallet,
        "card_number_masked":  masked,
        "activated_at":        datetime.utcnow().isoformat(),
        "expires":             expires,
        "tier":                "Silver",
        "client":              request.headers.get("X-BTNG-Client", "unknown"),
    }

# ── Health Check ──────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "OK", "engine": "UBL-1.0", "symbol": BTNG_GOLD_SYMBOL}
