"use strict";

/**
 * Repertoire des etablissements :
 * - lecture publique exclusivement des etablissements actifs ;
 * - modifications reservees a un service d'administration prive.
 * Ne JAMAIS brancher upsertEstablishments sur une route non authentifiee.
 */
const MAX_BATCH = 100;
const CODE_PATTERN = /^[0-9A-Z][0-9A-Z._/-]{0,19}$/;

function normalizeEstablishmentCode(raw) {
  if (typeof raw !== "string") throw new Error("Le code doit etre une chaine de caracteres (pour conserver les zeros initiaux).");
  const code = raw.normalize("NFKC").trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new Error("Code etablissement invalide.");
  return code;
}

function normalizeEstablishmentName(raw) {
  if (typeof raw !== "string") throw new Error("Le nom de l'etablissement doit etre du texte.");
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!name || name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new Error("Nom d'etablissement invalide.");
  }
  return name;
}

function validateEstablishmentBatch(payload) {
  if (!Array.isArray(payload) || payload.length < 1 || payload.length > MAX_BATCH) {
    throw new Error("Le lot doit comprendre entre 1 et 100 etablissements.");
  }
  const seen = new Set();
  return payload.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Chaque etablissement doit etre un objet JSON.");
    }
    const code = normalizeEstablishmentCode(item.code);
    const name = normalizeEstablishmentName(item.name);
    if (seen.has(code)) throw new Error("Code duplique dans le lot : " + code);
    seen.add(code);
    if (item.active !== undefined && typeof item.active !== "boolean") {
      throw new Error("Le statut actif doit etre un booleen : " + code);
    }
    if (item.displayOrder !== undefined &&
        (!Number.isInteger(item.displayOrder) || item.displayOrder < 0 || item.displayOrder > 100000)) {
      throw new Error("L'ordre d'affichage doit etre un entier entre 0 et 100000 : " + code);
    }
    return {
      code,
      name,
      active: item.active === undefined ? null : item.active,
      displayOrder: item.displayOrder === undefined ? null : item.displayOrder
    };
  });
}

async function listActiveEstablishments(db) {
  const result = await db.query([
    "SELECT code, name",
    "FROM cse.establishments",
    "WHERE active = true",
    "ORDER BY display_order ASC, code ASC"
  ].join("\n"));
  return result.rows.map(({code, name}) => ({code, name}));
}

async function listAllEstablishments(db) {
  const result = await db.query([
    "SELECT code, name, active, display_order",
    "FROM cse.establishments",
    "ORDER BY display_order ASC, code ASC"
  ].join("\n"));
  return result.rows.map(({code, name, active, display_order: displayOrder}) =>
    ({code, name, active, displayOrder}));
}

async function upsertEstablishments(client, rawBatch, source) {
  if (source !== "vps_ssh") {
    throw new Error("Source d'administration non autorisee.");
  }
  const batch = validateEstablishmentBatch(rawBatch);
  const result = [];
  await client.query("BEGIN");
  try {
    // Garantit l'atomicite lors des modifications simultanees d'une liste.
    await client.query("SELECT pg_advisory_xact_lock(92170419)");
    for (const item of batch) {
      const prior = await client.query(
        "SELECT code FROM cse.establishments WHERE code = $1 FOR UPDATE",
        [item.code]
      );
      const changeKind = prior.rowCount ? "update" : "create";
      const saved = await client.query([
        "INSERT INTO cse.establishments (code, name, active, display_order)",
        "VALUES ($1, $2, COALESCE($3::boolean, true), COALESCE($4::integer, 1000))",
        "ON CONFLICT (code) DO UPDATE SET",
        "  name = EXCLUDED.name,",
        "  active = COALESCE($3::boolean, cse.establishments.active),",
        "  display_order = COALESCE($4::integer, cse.establishments.display_order),",
        "  updated_at = now()",
        "RETURNING code, name, active, display_order"
      ].join("\n"), [item.code, item.name, item.active, item.displayOrder]);
      const row = saved.rows[0];
      await client.query([
        "INSERT INTO cse.establishment_changes",
        "  (code, kind, new_name, new_active, source)",
        "VALUES ($1, $2, $3, $4, $5)"
      ].join("\n"), [item.code, changeKind, row.name, row.active, source]);
      result.push({
        code: row.code,
        name: row.name,
        active: row.active,
        displayOrder: row.display_order,
        action: changeKind
      });
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* best effort */ }
    throw error;
  }
}

module.exports = {
  normalizeEstablishmentCode,
  validateEstablishmentBatch,
  listActiveEstablishments,
  listAllEstablishments,
  upsertEstablishments
};
