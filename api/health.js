export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  res.json({
    ok: true,
    keyLoaded: Boolean(process.env.OPENROUTER_KEY),
    model: process.env.QWEN_MODEL || "qwen/qwen3-30b-a3b:free",
    timestamp: new Date().toISOString(),
  });
}