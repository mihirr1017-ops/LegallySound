// api/chat.js
import { callWithKeyRotation } from "../lib/keyManager.js";

const VALID_TYPES = new Set([
  "Corporate M&A","PE / VC Investment","Banking & Finance","Capital Markets / SEBI",
  "Arbitration & Disputes","IBC / Insolvency","Criminal / White Collar",
  "Constitutional & Writ Practice","General Corporate","Competition Law",
  "Litigation Chamber","CPC & Civil Procedure","BSA & Evidence Law",
]);
const VALID_DIFFS = new Set(["Beginner", "Intermediate", "Advanced"]);

function buildSystemPrompt(interviewType, difficulty) {
  return `You are a senior legal interviewer at a top-tier Indian law firm conducting a ${interviewType} interview at ${difficulty} difficulty level. Introduce yourself, don't mention anyone's name and ask for their introduction.  Ask ONE question at a time. Wait for the candidate's answer before asking the next. Start with an introductory question, then probe deeper. After each response, briefly acknowledge in 1 line then ask the next question. Ask follow-ups based on answers to test depth. Keep questions relevant to ${interviewType} practice in India. Be professional but probing like a real Tier-1 firm partner. Do NOT list multiple questions at once. Vary types: conceptual, statutory, case-law, scenario-based. Gently correct wrong answers and move on.`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Token");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "Method not allowed" }); return; }

  const secret = process.env.APP_SECRET;
  if (secret && req.headers["x-app-token"] !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { interviewType, difficulty, messages } = req.body || {};

  if (!VALID_TYPES.has(interviewType)) {
    res.status(400).json({ error: "Invalid interviewType" });
    return;
  }
  if (!VALID_DIFFS.has(difficulty)) {
    res.status(400).json({ error: "Invalid difficulty" });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }
  if (messages.length > 100) {
    res.status(400).json({ error: "Too many messages" });
    return;
  }

  const fullMessages = [
    { role: "system", content: buildSystemPrompt(interviewType, difficulty) },
    ...messages,
  ];

  try {
    const { text, provider, keyIndex } = await callWithKeyRotation(fullMessages, 600, 0.7);
    res.status(200).json({ reply: text, provider, keyIndex });
  } catch (err) {
    console.error("[api/chat]", err.message);
    res.status(503).json({ error: err.message });
  }
}
