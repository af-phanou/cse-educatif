"use strict";

/**
 * Protections HTTP provisoires du parcours d'inscription, non public.
 * Avant production : rate limit partage (pas seulement en RAM), anti-bot,
 * confirmation email, verification de propriete du domaine et CSRF.
 */
const MAX_JSON_BYTES = 8192;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 4;

function allowedOrigin(value) {
  return value === "https://cse-educatif-rxtg.fr" ||
    value === "https://www.cse-educatif-rxtg.fr";
}

async function readRegistrationBody(req) {
  if (typeof req.headers["content-type"] !== "string" ||
      req.headers["content-type"].split(";")[0].toLowerCase().trim() !== "application/json") {
    const error = new Error("JSON requis");
    error.httpStatus = 415;
    throw error;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_JSON_BYTES) {
      const error = new Error("Requete trop grande");
      error.httpStatus = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Format invalide");
    }
    return parsed;
  } catch {
    const error = new Error("Formulaire JSON invalide");
    error.httpStatus = 400;
    throw error;
  }
}

function makeRateLimiter() {
  const attempts = new Map();
  return {
    allow(address, now = Date.now()) {
      const key = address || "unknown";
      // Nettoyage periodique paresseux pour ne pas grossir sans limite.
      if (attempts.size >= 5000) {
        for (const [id, value] of attempts) {
          if (value.until <= now) attempts.delete(id);
        }
        if (attempts.size >= 5000) return false;
      }
      let data = attempts.get(key);
      if (!data || data.until <= now) {
        data = {count:0, until:now + WINDOW_MS};
      }
      data.count++;
      attempts.set(key, data);
      return data.count <= MAX_REQUESTS_PER_WINDOW;
    }
  };
}

module.exports = { allowedOrigin, readRegistrationBody, makeRateLimiter };
