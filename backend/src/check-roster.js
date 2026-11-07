"use strict";
// Usage : node src/check-roster.js --preview -
// Lecture sur stdin, aucun stockage et aucun affichage de noms.
const fs = require("node:fs");
const { parseEligibilityCsv } = require("./eligibility");
if (process.argv[2] !== "--preview" || process.argv[3] !== "-") {
  console.error("Usage : node src/check-roster.js --preview - (CSV sur l'entree standard)");
  process.exit(2);
}
try {
  const csv = fs.readFileSync(0, "utf8");
  const parsed = parseEligibilityCsv(csv);
  const keys = new Set(parsed.entries.map(entry => entry.matchKey));
  console.log(JSON.stringify({
    status: "preview_only",
    rows: parsed.entries.length,
    ambiguous_matches: parsed.entries.length - keys.size,
    stored: false
  }));
} catch (error) {
  console.error("Echec de validation CSV :", error.message);
  process.exitCode = 1;
}
