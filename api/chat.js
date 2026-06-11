// api/chat.js
import { callWithKeyRotation } from "../lib/keyManager.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "Method not allowed" }); return; }

  const { systemPrompt, messages } = req.body || {};
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "messages must be an array" });
    return;
  }

  const fullMessages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  try {
    const { text, provider, keyIndex } = await callWithKeyRotation(fullMessages, 600, 0.7);
    res.status(200).json({ reply: text, provider, keyIndex });
  } catch (err) {
    console.error("[api/chat]", err.message);
    res.status(503).json({ error: err.message });
  }
}
