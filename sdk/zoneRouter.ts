import express from 'express';
import { ZoneEngine } from '../constants/zoneEngine';

const router = express.Router();
const engine = new ZoneEngine();

// POST /zone/resolve
// Body: { userId, registeredCountry?, gpsCountry?, ipCountry?, kycLevel, userTier }
router.post('/zone/resolve', (req, res) => {
  try {
    const resolution = engine.resolveZone(req.body);
    res.json(resolution);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /zone/evaluate
// Body: { userId, zoneId, assetId, amount, action }
router.post('/zone/evaluate', (req, res) => {
  try {
    const decision = engine.evaluateRules(req.body);
    res.json(decision);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
