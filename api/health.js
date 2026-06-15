// api/health.js
import { getProviderStatus } from "../lib/keyManager.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const status = getProviderStatus();
  res.status(200).json({ ok: status.totalKeys > 0 });
}
