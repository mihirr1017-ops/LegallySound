// lib/keyManager.js
// ─────────────────────────────────────────────────────────────────────────────
// Supports two AI providers: Mistral AI and OpenRouter (Qwen).
// Keys are stored in Vercel environment variables:
//
//   MISTRAL_KEYS    = mistral-key1,mistral-key2         (comma-separated)
//   MISTRAL_KEY     = mistral-key1                      (single, legacy fallback)
//   OPENROUTER_KEYS = sk-or-v1-key1,sk-or-v1-key2     (comma-separated)
//   OPENROUTER_KEY  = sk-or-v1-key1                    (single, legacy fallback)
//
// Strategy:
//   1. Try all Mistral keys in order (primary provider)
//   2. If all Mistral keys are exhausted, fall through to OpenRouter keys
//   3. If all OpenRouter keys are exhausted, throw a clear error
//
// Model config (optional env vars):
//   MISTRAL_MODEL = mistral-large-latest       (default)
//   QWEN_MODEL    = qwen/qwen3-30b-a3b        (default)
// ─────────────────────────────────────────────────────────────────────────────

const EXHAUSTED_PATTERNS = [
  "rate limit",
  "ratelimit",
  "quota",
  "exhausted",
  "insufficient",
  "billing",
  "credits",
  "too many requests",
  "usage limit",
  "capacity",
];

function isExhausted(message = "", statusCode = 0) {
  if (statusCode === 429 || statusCode === 402) return true;
  const lower = message.toLowerCase();
  return EXHAUSTED_PATTERNS.some((p) => lower.includes(p));
}

function parseKeys(multiEnv, singleEnv) {
  const keys = (multiEnv || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const single = (singleEnv || "").trim();
  if (single && !keys.includes(single)) keys.unshift(single);
  return keys;
}

// ── OpenRouter call ───────────────────────────────────────────────────────────
async function callOpenRouter(key, messages, maxTokens, temperature) {
  const model = process.env.QWEN_MODEL || "qwen/qwen3-30b-a3b";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://legallysound.vercel.app",
      "X-Title": "LegallySound",
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    signal: AbortSignal.timeout(50000),
  });

  const data = await response.json();

  if (data.error) {
    const msg = data.error.message || JSON.stringify(data.error);
    const err = new Error(msg);
    err.statusCode = response.status;
    err.exhausted = isExhausted(msg, response.status);
    throw err;
  }

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);
    err.statusCode = response.status;
    err.exhausted = isExhausted("", response.status);
    throw err;
  }

  let text = data.choices?.[0]?.message?.content || "";
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return text;
}

// ── Mistral call ──────────────────────────────────────────────────────────────
async function callMistral(key, messages, maxTokens, temperature) {
  const model = process.env.MISTRAL_MODEL || "mistral-large-latest";

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    signal: AbortSignal.timeout(50000),
  });

  const data = await response.json();

  if (data.error || data.message) {
    const msg = data.error?.message || data.message || JSON.stringify(data);
    const err = new Error(msg);
    err.statusCode = response.status;
    err.exhausted = isExhausted(msg, response.status);
    throw err;
  }

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);
    err.statusCode = response.status;
    err.exhausted = isExhausted("", response.status);
    throw err;
  }

  return data.choices?.[0]?.message?.content || "";
}

// ── Try all keys for a given provider ────────────────────────────────────────
async function tryProvider(keys, callFn, providerName, messages, maxTokens, temperature) {
  let lastError = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    console.log(`[keyManager] ${providerName} key ${i + 1}/${keys.length} (${key.slice(0, 6)}…)`);

    try {
      const text = await callFn(key, messages, maxTokens, temperature);
      console.log(`[keyManager] ${providerName} key ${i + 1} succeeded`);
      return { text, provider: providerName, keyIndex: i + 1 };
    } catch (err) {
      console.warn(`[keyManager] ${providerName} key ${i + 1} failed: ${err.message}`);
      if (err.exhausted) {
        lastError = err;
        continue; // try next key for this provider
      }
      // Non-exhaustion error (bad request, invalid model etc.) — don't rotate, throw
      throw err;
    }
  }

  // All keys for this provider exhausted
  lastError = lastError || new Error(`All ${providerName} keys failed`);
  lastError.allExhausted = true;
  throw lastError;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function callWithKeyRotation(messages, maxTokens = 600, temperature = 0.7) {
  const orKeys = parseKeys(process.env.OPENROUTER_KEYS, process.env.OPENROUTER_KEY);
  const mistralKeys = parseKeys(process.env.MISTRAL_KEYS, process.env.MISTRAL_KEY);

  if (orKeys.length === 0 && mistralKeys.length === 0) {
    throw new Error(
      "No API keys configured. Set OPENROUTER_KEYS and/or MISTRAL_KEYS in Vercel environment variables."
    );
  }

  // ── Step 1: Try Mistral keys ─────────────────────────────────────────────
  if (mistralKeys.length > 0) {
    try {
      return await tryProvider(mistralKeys, callMistral, "Mistral", messages, maxTokens, temperature);
    } catch (err) {
      const code = err.statusCode;
      const shouldFallThrough = err.allExhausted || (code >= 400 && code < 500);
      if (shouldFallThrough) {
        console.log(`[keyManager] Mistral unavailable (HTTP ${code || "exhausted"}) — falling through to OpenRouter`);
      } else {
        throw err;
      }
    }
  }

  // ── Step 2: Try OpenRouter keys ──────────────────────────────────────────
  if (orKeys.length > 0) {
    try {
      return await tryProvider(orKeys, callOpenRouter, "OpenRouter", messages, maxTokens, temperature);
    } catch (err) {
      if (err.allExhausted) {
        throw new Error(
          `All API keys exhausted (tried ${mistralKeys.length} Mistral + ${orKeys.length} OpenRouter key(s)). ` +
          `Add more keys to MISTRAL_KEYS or OPENROUTER_KEYS in Vercel environment variables.`
        );
      }
      throw err;
    }
  }

  throw new Error("No API keys available. Configure OPENROUTER_KEYS and/or MISTRAL_KEYS.");
}

// ── Status helper (used by health endpoint) ──────────────────────────────────
export function getProviderStatus() {
  const orKeys = parseKeys(process.env.OPENROUTER_KEYS, process.env.OPENROUTER_KEY);
  const mistralKeys = parseKeys(process.env.MISTRAL_KEYS, process.env.MISTRAL_KEY);
  return {
    openrouter: { count: orKeys.length, model: process.env.QWEN_MODEL || "qwen/qwen3-30b-a3b" },
    mistral:    { count: mistralKeys.length, model: process.env.MISTRAL_MODEL || "mistral-large-latest" },
    totalKeys:  orKeys.length + mistralKeys.length,
  };
}
