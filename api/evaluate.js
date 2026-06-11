// api/evaluate.js
import { callWithKeyRotation } from "../lib/keyManager.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "Method not allowed" }); return; }

  const { evaluationPrompt } = req.body || {};
  if (!evaluationPrompt) {
    res.status(400).json({ error: "evaluationPrompt is required" });
    return;
  }

  try {
    const { text, provider, keyIndex } = await callWithKeyRotation(
      [{ role: "user", content: evaluationPrompt }],
      900,
      0.2
    );
    res.status(200).json({ result: text, provider, keyIndex });
  } catch (err) {
    console.error("[api/evaluate]", err.message);
    res.status(503).json({ error: err.message });
  }
}
