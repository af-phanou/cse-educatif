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
  return host === "localhost:8088" || host === "127.0.0.1:8088";
}

function isAllowedMutationOrigin(origin) {
  return origin === "http://localhost:8088" ||
    origin === "http://127.0.0.1:8088";
}

module.exports = {
  isValidPanelToken,
  isAllowedLocalHost,
  isAllowedMutationOrigin
};
