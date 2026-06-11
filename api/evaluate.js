export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { evaluationPrompt } = req.body;
  if (!process.env.OPENROUTER_KEY)
    return res.status(503).json({ error: "OPENROUTER_KEY not set in environment variables." });
  if (!evaluationPrompt)
    return res.status(400).json({ error: "evaluationPrompt is required" });

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
        "HTTP-Referer": "https://legallysound.vercel.app",
        "X-Title": "LegallySound",
      },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || "qwen/qwen3-30b-a3b:free",
        messages: [{ role: "user", content: evaluationPrompt }],
        max_tokens: 900,
        temperature: 0.5,
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(502).json({ error: data.error.message });

    let result = data.choices?.[0]?.message?.content || "";
    result = result.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}