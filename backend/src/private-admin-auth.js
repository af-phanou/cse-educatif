"use strict";

const { timingSafeEqual } = require("node:crypto");
const TOKEN_RE = /^[a-f0-9]{64}$/i;

function isValidPanelToken(value, expected) {
  if (typeof value !== "string" || typeof expected !== "string" ||
      !TOKEN_RE.test(value) || !TOKEN_RE.test(expected)) return false;
  return timingSafeEqual(Buffer.from(value.toLowerCase(), "ascii"),
    Buffer.from(expected.toLowerCase(), "ascii"));
}

function isAllowedLocalHost(host) {
  return ["localhost:8088", "127.0.0.1:8088",
    "localhost:18088", "127.0.0.1:18088"].includes(host);
}

// Les parametres d'URL (ex. ?utm_source=...) ne changent pas la route.
// Conserver une comparaison exacte des chemins, sans decodage implicite.
function requestPath(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.startsWith("/")) return "";
  return rawUrl.split("?", 1)[0];
}

function isAllowedMutationOrigin(origin) {
  return ["http://localhost:8088", "http://127.0.0.1:8088",
    "http://localhost:18088", "http://127.0.0.1:18088"].includes(origin);
}

module.exports = {
  isValidPanelToken,
  isAllowedLocalHost,
  isAllowedMutationOrigin,
  requestPath
};
