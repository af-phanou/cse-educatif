"use strict";

/**
 * Eligibilite pour les inscriptions CSE.
 * Le CSV RH ne contient que nom, prenom et numero d'etablissement.
 * Ne jamais deduire une validation d'inscription d'une correspondance multiple.
 * Pas d'API publique ni d'import reel a ce stade.
 */
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 15000;

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘'ʼ\-‐‑–—]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("fr");
}

function normalizeNumber(value) {
  // Les zeros initiaux sont conserves : "0012" n'est pas "12".
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, "").toLocaleUpperCase("fr");
}

function matchKey(lastName, firstName, establishmentNumber) {
  return [
    normalizeName(lastName),
    normalizeName(firstName),
    normalizeNumber(establishmentNumber)
  ].join("|");
}

function detectDelimiter(text) {
  let inQuotes = false;
  let counts = { ";": 0, ",": 0, "\t": 0 };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && (char === "\n" || char === "\r")) {
      break;
    } else if (!inQuotes && Object.prototype.hasOwnProperty.call(counts, char)) {
      counts[char]++;
    }
  }
  const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  return counts[best] > 0 ? best : ";";
}

function splitCsv(text, delimiter) {
  const rows = [];
  let row = [], field = "", inQuotes = false, quotedFieldEnded = false;
  let line = 1, recordLine = 1;
  function addRow() {
    row.push(field);
    if (row.some(value => value.trim())) {
      rows.push({ line: recordLine, columns: row });
      if (rows.length > MAX_ROWS + 1) throw new Error("CSV trop long : nombre maximal de lignes depasse.");
    }
    row = [];
    field = "";
    quotedFieldEnded = false;
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          quotedFieldEnded = true;
        }
      } else {
        field += char;
        if (char === "\n") line++;
      }
      continue;
    }
    if (char === '"') {
      if (field.length || quotedFieldEnded) throw new Error("Guillemets mal places a la ligne " + line + ".");
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
      quotedFieldEnded = false;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      addRow();
      line++;
      recordLine = line;
    } else if (quotedFieldEnded && !/\s/.test(char)) {
      throw new Error("Caracteres apres un guillemet fermant a la ligne " + line + ".");
    } else if (quotedFieldEnded) {
      // Espaces apres champ entre guillemets : sans effet.
    } else {
      field += char;
    }
  }
  if (inQuotes) throw new Error("Guillemet non ferme a la ligne " + recordLine + ".");
  if (row.length || field.length || quotedFieldEnded) addRow();
  return rows;
}

function headerKey(value) {
  return normalizeName(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

const HEADERS = {
  last: ["NOM", "NOMDEFAMILLE", "NOMSALARIE"],
  first: ["PRENOM", "PRENOMS", "PRENOMSALARIE"],
  number: ["NUMEROETABLISSEMENT", "NUMERODELETABLISSEMENT", "NUMETABLISSEMENT", "NUMEROETAB", "CODEETABLISSEMENT"]
};

function parseEligibilityCsv(input) {
  if (typeof input !== "string") throw new TypeError("Le contenu CSV doit etre du texte.");
  if (Buffer.byteLength(input, "utf8") > MAX_BYTES) throw new Error("Fichier CSV trop volumineux (max. 2 Mio).");
  if (input.includes("\u0000")) throw new Error("Le fichier CSV contient des caracteres invalides.");
  const content = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(content);
  const rows = splitCsv(content, delimiter);
  if (rows.length < 2) throw new Error("Le CSV doit comporter un en-tete et au moins une ligne.");

  const header = rows[0].columns.map(headerKey);
  const positions = {};
  for (const [property, aliases] of Object.entries(HEADERS)) {
    const matches = header.flatMap((value, index) => aliases.includes(value) ? [index] : []);
    if (matches.length !== 1) {
      throw new Error("Colonne obligatoire absente ou en double : " + property + ".");
    }
    positions[property] = matches[0];
  }

  const entries = [];
  for (const row of rows.slice(1)) {
    const values = row.columns;
    const lastName = (values[positions.last] || "").trim();
    const firstName = (values[positions.first] || "").trim();
    const establishmentNumber = (values[positions.number] || "").trim();

    if (!lastName || !firstName || !establishmentNumber) {
      throw new Error("Champ obligatoire vide a la ligne " + row.line + ".");
    }
    if (lastName.length > 120 || firstName.length > 120 || establishmentNumber.length > 40) {
      throw new Error("Champ trop long a la ligne " + row.line + ".");
    }
    if (/[^\S\r\n]/u.test("")) { /* no-op: scanner compatible UTF-8 */ }
    const key = matchKey(lastName, firstName, establishmentNumber);
    if (key.split("|").some(part => !part)) {
      throw new Error("Valeur non comparable a la ligne " + row.line + ".");
    }
    // Ignorer toutes les autres colonnes eventuelles : minimisation des donnees.
    entries.push({
      sourceLine: row.line,
      lastName,
      firstName,
      establishmentNumber,
      matchKey: key
    });
  }
  return { delimiter, entries };
}

function checkEligibility(entries, claim) {
  const key = matchKey(claim.lastName, claim.firstName, claim.establishmentNumber);
  const matches = entries.filter(entry => entry.matchKey === key);
  // Informations internes exclusivement. Le site public devra donner
  // une reponse generique pour eviter l'enumeration des salaries.
  return matches.length === 1
    ? { status: "matched", entry: matches[0] }
    : { status: "manual_review", reason: matches.length ? "ambiguous" : "not_found" };
}

module.exports = { normalizeName, normalizeNumber, matchKey, parseEligibilityCsv, checkEligibility };
