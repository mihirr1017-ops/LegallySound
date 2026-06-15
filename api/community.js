// api/community.js
// Stores community members as a JSON file in Vercel Blob storage.
//
// Setup:
//   1. npm install @vercel/blob
//   2. Vercel Dashboard → Storage → Blob → Create Store → Connect to Project
//      (This auto-adds the BLOB_READ_WRITE_TOKEN env var)
//   3. Redeploy

import { put, head, del } from "@vercel/blob";

const BLOB_FILENAME = "community-members.json";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function readMembers() {
  try {
    // list() finds our file by prefix
    const { blobs } = await import("@vercel/blob").then(m =>
      m.list({ prefix: BLOB_FILENAME })
    );
    if (!blobs || blobs.length === 0) return [];

    const res = await fetch(blobs[0].url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[community readMembers]", err.message);
    return [];
  }
}

async function writeMembers(members) {
  // put() with the same pathname + allowOverwrite replaces the file
  await put(BLOB_FILENAME, JSON.stringify(members), {
    access: "public",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res
      .status(503)
      .json({
        error:
          "BLOB_READ_WRITE_TOKEN not set. Go to Vercel Dashboard → Storage → Blob → Create Store → Connect to Project, then Redeploy.",
      });
    return;
  }

  // ── GET — fetch all members ──────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const members = await readMembers();
      res.status(200).json({ members });
    } catch (err) {
      console.error("[community GET]", err.message);
      res.status(200).json({ members: [], warning: err.message });
    }
    return;
  }

  // ── POST — add a new member ──────────────────────────────────────────────
  if (req.method === "POST") {
    // Handle both parsed and unparsed bodies
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }
    }

    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Request body missing or invalid" });
      return;
    }

    const { name, track, desc, linkedin } = body;
    const VALID_TRACKS = ["Corporate", "Litigation", "General", "Founder"];

    if (!name?.trim())                      { res.status(400).json({ error: "Name is required" }); return; }
    if (name.trim().length > 80)            { res.status(400).json({ error: "Name must be 80 characters or fewer" }); return; }
    if (!desc?.trim())                      { res.status(400).json({ error: "Description is required" }); return; }
    if (desc.trim().length > 400)           { res.status(400).json({ error: "Description must be 400 characters or fewer" }); return; }
    if ((linkedin || "").trim().length > 200) { res.status(400).json({ error: "LinkedIn URL must be 200 characters or fewer" }); return; }
    const resolvedTrack = VALID_TRACKS.includes(track) ? track : "Corporate";

    const newMember = {
      name: name.trim(),
      track: resolvedTrack,
      desc: desc.trim(),
      linkedin: (linkedin || "").trim(),
      joined: new Date().toISOString().split("T")[0],
    };

    try {
      const existing = await readMembers();
      await writeMembers([...existing, newMember]);
      res.status(201).json({ ok: true, member: newMember });
    } catch (err) {
      console.error("[community POST]", err.message);
      res
        .status(500)
        .json({ error: "Failed to save member: " + err.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed. Use GET or POST." });
}
