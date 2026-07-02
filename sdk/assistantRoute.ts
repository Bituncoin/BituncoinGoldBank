// assistantRoute.ts
// Express route to expose BTNG assistant at /api/assistant

import { Router, Request, Response } from "express";
import { BTNG_AGENT } from "./btngAssistantAgent";

const router = Router();

router.post("/assistant", (req: Request, res: Response) => {
  const result = BTNG_AGENT.handle(req.body);
  res.json(result);
});

export default router;

// ── Usage ──────────────────────────────────────────────────────────────────────
// In your existing src/api/routes.ts:
//
//   import assistantRoute from './assistantRoute';
//   router.use('/api', assistantRoute);
//
// This exposes POST /api/assistant accepting BTNGAgentRequest JSON bodies.
// Example request:
//   { "intent": "CREATE_WALLET", "country": "GHANA" }
//   { "intent": "LOOKUP_ADDRESS", "address": "BTNG1Gw..." }
//   { "intent": "VERIFY_ADDRESS", "address": "BTNG2Nm..." }
//   { "intent": "HELP" }
