// api/evaluate.js
import { callWithKeyRotation } from "../lib/keyManager.js";

const VALID_TYPES = new Set([
  "Corporate M&A","PE / VC Investment","Banking & Finance","Capital Markets / SEBI",
  "Arbitration & Disputes","IBC / Insolvency","Criminal / White Collar",
  "Constitutional & Writ Practice","General Corporate","Competition Law",
  "Litigation Chamber","CPC & Civil Procedure","BSA & Evidence Law",
]);
const VALID_DIFFS = new Set(["Beginner", "Intermediate", "Advanced"]);

function buildEvalPrompt(messages, interviewType, difficulty) {
  const interviewerLines = messages.filter(m => m.role === "assistant");
  const candidateLines   = messages.filter(m => m.role === "user");
  const transcript = messages
    .map(m => (m.role === "user" ? "CANDIDATE" : "INTERVIEWER") + ": " + m.content)
    .join("\n\n");
  const qCount = interviewerLines.length;
  const aCount = candidateLines.length;

  return `You are a brutal but fair senior partner at a top-tier Indian law firm (CAM / AZB / Khaitan calibre) evaluating a candidate for a ${interviewType} associate role. You have seen hundreds of interviews. You do NOT give inflated scores. You score based on EVIDENCE from the transcript only.

INTERVIEW TYPE: ${interviewType}
DIFFICULTY: ${difficulty}
QUESTIONS ASKED: ${qCount} | ANSWERS GIVEN: ${aCount}

TRANSCRIPT:
${transcript}

---
SCORING RUBRIC — read this carefully before scoring:

LEGAL KNOWLEDGE (how accurately and completely did the candidate answer?):
1-2: Answered almost nothing correctly. Blank or wrong on basics.
3-4: Got some basics right but missed key statutes, cases, or principles. Significant gaps.
5-6: Adequate — covered the main points but lacked depth, missed nuance, or cited wrong sections.
7-8: Strong — accurate, cited correct provisions and cases, showed genuine understanding.
9-10: Exceptional — precise, nuanced, cited obscure but correct authority, nothing missed.

COMMUNICATION (clarity, structure, and conciseness of answers):
1-2: Rambling, incoherent, or one-word answers. Very hard to follow.
3-4: Disorganised. Point made eventually but after significant wandering.
5-6: Reasonably clear but could be more structured or concise.
7-8: Clear, structured, confident. Answers have a beginning, middle, end.
9-10: Crisp, precise, impressive. Sounds like a trained lawyer.

ANALYTICAL DEPTH (did the candidate go beyond surface answers, apply law to facts, spot issues?):
1-2: Recited definitions only. No application, no issue-spotting.
3-4: Some application but mostly superficial. Did not probe exceptions or edge cases.
5-6: Decent analysis but did not connect principles to practical consequences.
7-8: Good issue-spotting, applied law correctly, identified practical implications.
9-10: Outstanding — layered analysis, spotted sub-issues, considered counter-arguments.

COMPOSURE UNDER PRESSURE (did the candidate handle follow-up questions, corrections, or difficult questions?):
1-2: Fell apart under follow-up. Changed answers when challenged without reason.
3-4: Visibly struggled. Long pauses or gave up on hard questions.
5-6: Held their ground mostly but was shaken by follow-ups.
7-8: Handled pressure well. Acknowledged gaps honestly and recovered.
9-10: Thrived under pressure. Used corrections constructively.

PRACTICAL READINESS (is this person ready to work on real matters from day one?):
1-2: Not ready. Would need years of foundation building.
3-4: Needs significant development before being client-facing.
5-6: Needs mentoring but could handle supervised work.
7-8: Ready for supervised associate work. Minimal hand-holding needed.
9-10: Hire immediately. Could run with matters independently.

---
CRITICAL INSTRUCTIONS:
1. Scores MUST reflect the actual quality of this specific transcript. Do NOT default to 5-7 for everything.
2. If the candidate gave short, vague, or incorrect answers — score 3 or 4. Do not be kind.
3. If the candidate only answered 1-2 questions — every score should reflect that limitation.
4. Scores across the five dimensions MUST vary — if all five are the same number, you have failed the task.
5. For each score, quote ONE specific line from the transcript as evidence (prefix with "Evidence: ").
6. VERDICT must be one of: STRONG HIRE / HIRE / BORDERLINE / REJECT — pick the one that fits, do not hedge.

OUTPUT FORMAT (use exactly these headers, nothing else):

LEGAL KNOWLEDGE: [X]/10
Assessment: [2-3 sentences explaining the score]

COMMUNICATION: [X]/10
Assessment: [2-3 sentences explaining the score]

ANALYTICAL DEPTH: [X]/10
Assessment: [2-3 sentences explaining the score]

COMPOSURE UNDER PRESSURE: [X]/10
Assessment: [2-3 sentences explaining the score]

PRACTICAL READINESS: [X]/10
Assessment: [2-3 sentences explaining the score]

OVERALL: [X]/10
[One sentence summary]

VERDICT: [STRONG HIRE / HIRE / BORDERLINE / REJECT]
[2 sentences explaining verdict]

WHAT TO FIX BEFORE NEXT INTERVIEW:
1. [Most critical gap — specific, actionable]
2. [Second gap]
3. [Third gap]

WHAT WAS DONE WELL:
1. [Genuine strength — only if earned]
2. [Second strength — omit if none]`;
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

  const { messages, interviewType, difficulty } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }
  if (messages.length > 100) {
    res.status(400).json({ error: "Too many messages" });
    return;
  }
  if (!VALID_TYPES.has(interviewType)) {
    res.status(400).json({ error: "Invalid interviewType" });
    return;
  }
  if (!VALID_DIFFS.has(difficulty)) {
    res.status(400).json({ error: "Invalid difficulty" });
    return;
  }

  const evalPrompt = buildEvalPrompt(messages, interviewType, difficulty);

  try {
    const { text, provider, keyIndex } = await callWithKeyRotation(
      [{ role: "user", content: evalPrompt }],
      900,
      0.2
    );
    res.status(200).json({ result: text, provider, keyIndex });
  } catch (err) {
    console.error("[api/evaluate]", err.message);
    res.status(503).json({ error: err.message });
  }
}
