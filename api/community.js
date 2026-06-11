import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // ── GET — fetch all members ──────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const members = await kv.get("community-members");
      return res.json({ members: members || [] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST — add a new member ──────────────────────────────────────────────
  if (req.method === "POST") {
    const { name, track, desc, linkedin } = req.body || {};

    if (!name?.trim() || !desc?.trim())
      return res.status(400).json({ error: "Name and description are required." });

    try {
      const existing = (await kv.get("community-members")) || [];

      const newMember = {
        name: name.trim(),
        track: track || "Corporate",
        desc: desc.trim(),
        linkedin: linkedin?.trim() || "",
        joined: new Date().toISOString().split("T")[0],
      };

      const updated = [...existing, newMember];
      await kv.set("community-members", updated);

      return res.status(201).json({ ok: true, member: newMember });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}